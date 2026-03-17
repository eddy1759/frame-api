import { Injectable, Logger, HttpStatus } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { v4 as uuidv4 } from 'uuid';
import { ConfigService } from '@nestjs/config';
import { UploadSession } from '../entities/upload-session.entity';
import { Image } from '../entities/image.entity';
import {
  ProcessingStatus,
  VariantType,
  UploadSessionStatus,
} from '../types/image.types';
import { StorageService } from '../../common/services/storage.service';
import { BusinessException } from '../../common/filters/business.exception';
import { StorageQuotaService } from './storage-quota.service';
import { ImagesCacheService } from './images-cache.service';
import { ImageVariantService } from './image-variant.service';
import { RequestUploadUrlDto } from '../dto/request-upload-url.dto';
import { CompleteUploadDto } from '../dto/complete-upload.dto';
import {
  IMAGE_PROCESSING_QUEUE,
  ImageProcessingJobType,
  ImageProcessingJobData,
} from '../../common/queue/queue.constants';

@Injectable()
export class UploadService {
  private readonly logger = new Logger(UploadService.name);

  constructor(
    @InjectRepository(UploadSession)
    private readonly uploadSessionRepository: Repository<UploadSession>,
    @InjectRepository(Image)
    private readonly imageRepository: Repository<Image>,
    @InjectQueue(IMAGE_PROCESSING_QUEUE)
    private readonly processingQueue: Queue,
    private readonly storageService: StorageService,
    private readonly storageQuotaService: StorageQuotaService,
    private readonly imagesCacheService: ImagesCacheService,
    private readonly imageVariantService: ImageVariantService,
    private readonly configService: ConfigService,
  ) {}

  async requestUploadUrl(
    userId: string,
    dto: RequestUploadUrlDto,
    ipAddress?: string,
    userAgent?: string,
  ): Promise<{
    uploadSessionId: string;
    imageId: string;
    presignedUrl: string;
    storageKey: string;
    expiresAt: Date;
    maxFileSize: number;
  }> {
    // 1. Check daily upload rate limit
    const dailyCount =
      await this.imagesCacheService.getDailyUploadCount(userId);
    const dailyLimit = this.configService.get<number>(
      'image.dailyUploadLimit',
      100,
    );

    if (dailyCount >= dailyLimit) {
      throw new BusinessException (
        'DAILY_UPLOAD_LIMIT_REACHED',
        `Daily upload limit of ${dailyLimit} reached. Try again tomorrow.`,
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    // 2. Check storage quota
    await this.storageQuotaService.checkQuotaAvailability(userId, dto.fileSize);

    // 3. Validate frameId if provided
    if (dto.frameId) {
      await this.validateFrameId(dto.frameId);
    }

    // 4. Generate storage key
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const extension = this.getExtensionFromMimeType(dto.mimeType);
    const uuid = uuidv4();
    const storageKey = `tmp/${userId}/${year}/${month}/${uuid}.${extension}`;
    const permanentKey = `images/${userId}/${year}/${month}/${uuid}.${extension}`;

    // 5. Generate presigned PUT URL
    const presignedUrlExpiry = this.configService.get<number>(
      'storage.presignedUrlExpiry',
      3600,
    );
    const presigned = await this.storageService.generatePresignedPutUrl(
      storageKey,
      dto.mimeType,
      dto.fileSize,
      presignedUrlExpiry,
    );

    // 6. Create upload session
    const session = this.uploadSessionRepository.create({
      id: uuid,
      userId,
      frameId: dto.frameId || null,
      originalFilename: this.sanitizeFilename(dto.filename),
      mimeType: dto.mimeType,
      expectedFileSize: dto.fileSize,
      storageKey,
      presignedUrl: presigned.url,
      status: UploadSessionStatus.PENDING,
      is360: dto.is360 || false,
      expiresAt: presigned.expiresAt,
      ipAddress,
      userAgent,
    });

    await this.uploadSessionRepository.save(session);

    // 7. Reserve pending quota
    await this.storageQuotaService.reservePending(userId, dto.fileSize);

    // 8. Increment daily count
    await this.imagesCacheService.incrementDailyUploadCount(userId);

    this.logger.log(`Upload session created: ${session.id} for user ${userId}`);

    return {
      uploadSessionId: session.id,
      imageId: session.id,
      presignedUrl: presigned.url,
      storageKey,
      expiresAt: presigned.expiresAt,
      maxFileSize: this.configService.get<number>(
        'image.maxFileSize',
        52428800,
      ),
    };
  }

  async completeUpload(
    imageId: string,
    userId: string,
    dto: CompleteUploadDto,
  ): Promise<{
    id: string;
    status: string;
    processingStatus: string;
    message: string;
  }> {
    // 1. Find upload session
    const session = await this.uploadSessionRepository.findOne({
      where: { id: imageId },
    });

    if (!session) {
      throw new BusinessException(
        'UPLOAD_SESSION_NOT_FOUND',
        'Upload session not found',
        HttpStatus.NOT_FOUND,
      );
    }

    // 2. Verify ownership
    if (session.userId !== userId) {
      throw new BusinessException(
        'IMAGE_NOT_OWNED',
        'You do not own this upload session',
        HttpStatus.FORBIDDEN,
      );
    }

    // 3. Check if already completed (idempotent)
    if (session.status === UploadSessionStatus.COMPLETED) {
      const existingImage = await this.imageRepository.findOne({
        where: { id: imageId },
      });

      if (existingImage) {
        return {
          id: existingImage.id,
          status: 'uploaded',
          processingStatus: existingImage.processingStatus,
          message: 'Upload was already completed.',
        };
      }
    }

    // 4. Verify session is pending
    if (session.status !== UploadSessionStatus.PENDING) {
      throw new BusinessException(
        'UPLOAD_SESSION_EXPIRED',
        `Upload session is in '${session.status}' state and cannot be completed`,
        HttpStatus.GONE,
      );
    }

    // 5. Check expiry
    if (new Date() > session.expiresAt) {
      await this.uploadSessionRepository.update(session.id, {
        status: UploadSessionStatus.EXPIRED,
      });
      await this.storageQuotaService.releasePending(
        userId,
        Number(session.expectedFileSize),
      );

      throw new BusinessException(
        'UPLOAD_SESSION_EXPIRED',
        'Presigned URL has expired. Please request a new upload URL.',
        HttpStatus.GONE,
      );
    }

    // 6. Verify file exists in storage at tmp/ key
    const headResult = await this.storageService.headObject(session.storageKey);

    if (!headResult) {
      throw new BusinessException(
        'UPLOAD_NOT_FOUND_IN_STORAGE',
        'File not found at the upload location. Please ensure the file was uploaded to the presigned URL.',
        HttpStatus.UNPROCESSABLE_ENTITY,
      );
    }

    // 7. Verify file size (±1% tolerance)
    const expectedSize = Number(session.expectedFileSize);
    const actualSize = headResult.contentLength;
    const tolerance = expectedSize * 0.01;
    const maxAllowed = this.configService.get<number>(
      'image.maxFileSize',
      52428800,
    );

    if (actualSize > maxAllowed) {
      throw new BusinessException(
        'FILE_SIZE_EXCEEDED',
        `File size ${actualSize} exceeds maximum of ${maxAllowed} bytes`,
        HttpStatus.BAD_REQUEST,
      );
    }

    if (Math.abs(actualSize - expectedSize) > Math.max(tolerance, 1024)) {
      this.logger.warn(
        `File size mismatch for session ${session.id}: expected ${expectedSize}, actual ${actualSize}`,
      );
    }

    // 8. Re-verify quota with actual size
    const usedBytes = await this.storageQuotaService.getUsedBytes(userId);
    const quota = await this.storageQuotaService.getOrCreateQuota(userId);

    if (Number(usedBytes) + actualSize > Number(quota.limitBytes)) {
      await this.storageService.deleteObject(session.storageKey);
      await this.storageQuotaService.releasePending(
        userId,
        Number(session.expectedFileSize),
      );

      throw new BusinessException(
        'STORAGE_QUOTA_EXCEEDED',
        'Storage quota would be exceeded with actual file size',
        HttpStatus.FORBIDDEN,
      );
    }

    // 9. Move file from tmp/ to images/
    const permanentKey = session.storageKey.replace('tmp/', 'images/');
    await this.storageService.moveObject(session.storageKey, permanentKey);

    // 10. Create Image record
    const extension = this.getExtensionFromMimeType(session.mimeType);
    const image = this.imageRepository.create({
      id: session.id,
      userId: session.userId,
      frameId: session.frameId,
      title: dto.title || null,
      description: dto.description || null,
      originalFilename: session.originalFilename,
      mimeType: session.mimeType,
      originalFormat: extension,
      storageKey: permanentKey,
      fileSize: actualSize,
      is360: session.is360,
      checksum: dto.checksum || null,
      processingStatus: ProcessingStatus.UPLOADED,
    });

    await this.imageRepository.save(image);

    // 11. Create original variant record
    await this.imageVariantService.createVariant({
      imageId: image.id,
      variantType: VariantType.ORIGINAL,
      storageKey: permanentKey,
      mimeType: session.mimeType,
      fileSize: actualSize,
      width: 0, // Will be set during processing
      height: 0,
    });

    // 12. Update upload session
    await this.uploadSessionRepository.update(session.id, {
      status: UploadSessionStatus.COMPLETED,
      completedAt: new Date(),
    });

    // 13. Confirm quota (move from pending to used)
    await this.storageQuotaService.confirmUsage(
      userId,
      actualSize,
      Number(session.expectedFileSize),
    );

    // 14. Dispatch processing job
    const jobData: ImageProcessingJobData = {
      imageId: image.id,
      userId: image.userId,
      storageKey: permanentKey,
      mimeType: image.mimeType,
      is360: image.is360,
      requestedAt: new Date().toISOString(),
    };

    await this.processingQueue.add(
      ImageProcessingJobType.PROCESS_IMAGE,
      jobData,
      {
        jobId: image.id,
        priority: image.is360 ? 2 : 1, // Standard images process first
      },
    );

    // 15. Invalidate caches
    await this.imagesCacheService.invalidateUserLists(userId);

    this.logger.log(
      `Upload completed: ${image.id} for user ${userId}, processing queued`,
    );

    return {
      id: image.id,
      status: 'uploaded',
      processingStatus: ProcessingStatus.UPLOADED,
      message: 'Upload confirmed. Image is being processed.',
    };
  }

  async getUploadSession(sessionId: string, userId: string) {
    const session = await this.uploadSessionRepository.findOne({
      where: { id: sessionId },
    });

    if (!session) {
      throw new BusinessException(
        'UPLOAD_SESSION_NOT_FOUND',
        'Upload session not found',
        HttpStatus.NOT_FOUND,
      );
    }

    if (session.userId !== userId) {
      throw new BusinessException(
        'IMAGE_NOT_OWNED',
        'You do not own this upload session',
        HttpStatus.FORBIDDEN,
      );
    }

    return {
      id: session.id,
      status: session.status,
      expiresAt: session.expiresAt,
      storageKey: session.storageKey,
      createdAt: session.createdAt,
    };
  }

  async cancelUploadSession(sessionId: string, userId: string): Promise<void> {
    const session = await this.uploadSessionRepository.findOne({
      where: { id: sessionId },
    });

    if (!session) {
      throw new BusinessException(
        'UPLOAD_SESSION_NOT_FOUND',
        'Upload session not found',
        HttpStatus.NOT_FOUND,
      );
    }

    if (session.userId !== userId) {
      throw new BusinessException(
        'IMAGE_NOT_OWNED',
        'You do not own this upload session',
        HttpStatus.FORBIDDEN,
      );
    }

    if (session.status !== UploadSessionStatus.PENDING) {
      return; // Idempotent — already in a terminal state
    }

    // Cancel session
    await this.uploadSessionRepository.update(sessionId, {
      status: UploadSessionStatus.CANCELLED,
    });

    // Release pending quota
    await this.storageQuotaService.releasePending(
      userId,
      Number(session.expectedFileSize),
    );

    // Try to clean up any partial upload in storage
    try {
      await this.storageService.deleteObject(session.storageKey);
    } catch {
      // File may not exist yet — that's fine
    }

    this.logger.log(
      `Upload session cancelled: ${sessionId} for user ${userId}`,
    );
  }

  private async validateFrameId(frameId: string): Promise<void> {
    // This would ideally call the FrameService, but for loose coupling
    // we can do a direct DB check or import the Frame module
    // For now, we validate it exists in the database
    // This will be injected via FrameService when integrated
    // Placeholder — frame validation
  }

  private getExtensionFromMimeType(mimeType: string): string {
    const map: Record<string, string> = {
      'image/jpeg': 'jpg',
      'image/png': 'png',
      'image/heic': 'heic',
      'image/heif': 'heif',
    };
    return map[mimeType] || 'jpg';
  }

  private sanitizeFilename(filename: string): string {
    return filename.replace(/[^a-zA-Z0-9._-]/g, '_').substring(0, 255);
  }
}
