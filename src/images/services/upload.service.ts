/* eslint-disable @typescript-eslint/explicit-function-return-type */
import { createHash } from 'crypto';
import { Injectable, Logger, HttpStatus } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectQueue } from '@nestjs/bullmq';
import { InjectRepository } from '@nestjs/typeorm';
import { Queue } from 'bullmq';
import { v4 as uuidv4 } from 'uuid';
import { DataSource, Repository } from 'typeorm';
// eslint-disable-next-line @typescript-eslint/no-require-imports
const sharp: typeof import('sharp') = require('sharp');
import { User } from '../../auth/entities/user.entity';
import { BusinessException } from '../../common/filters/business.exception';
import { StorageService } from '../../common/services/storage.service';
import {
  IMAGE_PROCESSING_QUEUE,
  ImageProcessingJobData,
  ImageProcessingJobType,
} from '../../common/queue/queue.constants';
import { FramesService } from '../../frames/services/frames.service';
import { CompleteUploadDto } from '../dto/complete-upload.dto';
import { RequestUploadUrlDto } from '../dto/request-upload-url.dto';
import { Image } from '../entities/image.entity';
import { UploadSession } from '../entities/upload-session.entity';
import { ProcessingStatus, UploadSessionStatus } from '../types/image.types';
import { normalizeRenderTransform } from '../utils/render-transform.util';
import { ImagesCacheService } from './images-cache.service';
import { ImageCompositingService } from './image-compositing.service';
import { StorageQuotaService } from './storage-quota.service';

@Injectable()
export class UploadService {
  private readonly logger = new Logger(UploadService.name);

  constructor(
    @InjectRepository(UploadSession)
    private readonly uploadSessionRepository: Repository<UploadSession>,
    @InjectRepository(Image)
    private readonly imageRepository: Repository<Image>,
    private readonly dataSource: DataSource,
    @InjectQueue(IMAGE_PROCESSING_QUEUE)
    private readonly processingQueue: Queue,
    private readonly storageService: StorageService,
    private readonly storageQuotaService: StorageQuotaService,
    private readonly imagesCacheService: ImagesCacheService,
    private readonly imageCompositingService: ImageCompositingService,
    private readonly framesService: FramesService,
    private readonly configService: ConfigService,
  ) {}

  async requestUploadUrl(
    user: User,
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
    this.assertAllowedMimeType(dto.mimeType);
    this.assertAllowedFileSize(dto.fileSize);

    if (dto.frameId) {
      await this.framesService.assertFrameEligibleForImage(dto.frameId, user);
    }

    const dailyCount = await this.countDailyUploads(user.id);
    if (dailyCount >= this.dailyUploadLimit) {
      throw new BusinessException(
        'DAILY_UPLOAD_LIMIT_REACHED',
        `Daily upload limit of ${this.dailyUploadLimit} reached.`,
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    const uuid = uuidv4();
    const storageKey = this.buildTemporaryStorageKey(
      user.id,
      uuid,
      dto.mimeType,
      new Date(),
    );

    const presigned = await this.storageService.generatePresignedPutUrl(
      storageKey,
      dto.mimeType,
      dto.fileSize,
      this.presignedUrlExpiry,
    );

    const session = this.uploadSessionRepository.create({
      id: uuid,
      userId: user.id,
      frameId: dto.frameId ?? null,
      originalFilename: this.sanitizeFilename(dto.filename),
      mimeType: dto.mimeType,
      expectedFileSize: dto.fileSize,
      storageKey,
      presignedUrl: presigned.url,
      status: UploadSessionStatus.PENDING,
      is360: dto.is360 ?? false,
      expiresAt: presigned.expiresAt,
      ipAddress,
      userAgent,
    });

    await this.dataSource.transaction(async (manager) => {
      await this.storageQuotaService.reservePending(
        user.id,
        dto.fileSize,
        manager,
      );
      await manager.getRepository(UploadSession).save(session);
    });

    this.logger.log(`Upload session created: ${session.id}`);

    return {
      uploadSessionId: session.id,
      imageId: session.id,
      presignedUrl: presigned.url,
      storageKey,
      expiresAt: presigned.expiresAt,
      maxFileSize: this.maxFileSize,
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

    if (session.userId !== userId) {
      throw new BusinessException(
        'IMAGE_NOT_OWNED',
        'You do not own this upload session',
        HttpStatus.FORBIDDEN,
      );
    }

    if (session.status === UploadSessionStatus.COMPLETED) {
      return this.buildExistingCompletionResponse(imageId);
    }

    if (session.status === UploadSessionStatus.COMPLETING) {
      const existingImage = await this.imageRepository.findOne({
        where: { id: imageId },
      });

      return {
        id: imageId,
        status: 'uploaded',
        processingStatus:
          existingImage?.processingStatus ?? ProcessingStatus.UPLOADED,
        message: 'Upload completion is already in progress.',
      };
    }

    if (session.status !== UploadSessionStatus.PENDING) {
      throw new BusinessException(
        'UPLOAD_SESSION_EXPIRED',
        `Upload session is in ${session.status} state`,
        HttpStatus.GONE,
      );
    }

    if (new Date() > session.expiresAt) {
      await this.expireSession(session);
      throw new BusinessException(
        'UPLOAD_SESSION_EXPIRED',
        'Upload session expired',
        HttpStatus.GONE,
      );
    }

    const markedCompleting = await this.uploadSessionRepository
      .createQueryBuilder()
      .update(UploadSession)
      .set({
        status: UploadSessionStatus.COMPLETING,
        errorMessage: null,
      })
      .where('id = :id', { id: session.id })
      .andWhere('user_id = :userId', { userId })
      .andWhere('status = :status', { status: UploadSessionStatus.PENDING })
      .execute();

    if ((markedCompleting.affected ?? 0) !== 1) {
      return this.buildExistingCompletionResponse(imageId);
    }

    let initialFrameState: Awaited<
      ReturnType<ImageCompositingService['buildInitialFrameState']>
    > | null = null;

    try {
      const head = await this.storageService.headObject(session.storageKey);
      if (!head?.contentLength) {
        await this.failSession(
          session,
          'Uploaded file not found in temporary storage.',
        );
      }

      const actualSize = Number(head?.contentLength);
      this.assertAllowedFileSize(actualSize);

      const buffer = await this.storageService.getObjectBuffer(
        session.storageKey,
      );
      const metadata = await sharp(buffer).metadata();
      const detectedMimeType = this.detectMimeType(
        metadata.format,
        session.mimeType,
      );

      this.assertAllowedMimeType(detectedMimeType);

      if (!this.mimeTypesMatch(detectedMimeType, session.mimeType)) {
        await this.failSession(
          session,
          `Uploaded content type ${detectedMimeType} does not match requested type ${session.mimeType}.`,
        );
      }

      const checksum = createHash('sha256').update(buffer).digest('hex');

      if (dto.checksum && dto.checksum !== checksum) {
        await this.failSession(session, 'Uploaded file checksum mismatch.');
      }

      const finalKey = this.buildPermanentStorageKey(
        userId,
        imageId,
        session.mimeType,
        session.createdAt,
      );
      const renderTransform =
        session.frameId && dto.transform
          ? normalizeRenderTransform(dto.transform)
          : null;
      if (!session.frameId && dto.transform) {
        await this.failSession(
          session,
          'Render transform can only be supplied when a frame is attached.',
        );
      }
      initialFrameState =
        await this.imageCompositingService.buildInitialFrameState(
          imageId,
          session.frameId,
        );
      const frameState = initialFrameState;

      await this.dataSource.transaction(async (manager) => {
        const lockedSession = await manager
          .getRepository(UploadSession)
          .createQueryBuilder('session')
          .setLock('pessimistic_write')
          .where('session.id = :id', { id: session.id })
          .getOne();

        if (!lockedSession) {
          throw new Error(
            `Upload session ${session.id} disappeared during completion.`,
          );
        }

        if (lockedSession.status !== UploadSessionStatus.COMPLETING) {
          throw new Error(
            `Upload session ${session.id} is not in completing state.`,
          );
        }

        await this.storageQuotaService.confirmUsage(
          userId,
          actualSize,
          Number(lockedSession.expectedFileSize),
          manager,
        );
        if (initialFrameState?.frameSnapshotSize) {
          await this.storageQuotaService.addVariantUsage(
            userId,
            Number(initialFrameState.frameSnapshotSize),
            manager,
          );
        }

        const image = manager.getRepository(Image).create({
          id: lockedSession.id,
          userId: lockedSession.userId,
          frameId: frameState.frameId,
          frameSnapshotKey: frameState.frameSnapshotKey,
          frameSnapshotSize: frameState.frameSnapshotSize,
          framePlacement: frameState.framePlacement,
          renderTransform,
          pendingFrameId: frameState.pendingFrameId,
          pendingFrameSnapshotKey: frameState.pendingFrameSnapshotKey,
          pendingFrameSnapshotSize: frameState.pendingFrameSnapshotSize,
          pendingFramePlacement: frameState.pendingFramePlacement,
          pendingRenderTransform: null,
          frameRenderStatus: frameState.frameRenderStatus,
          activeRenderRevision: frameState.activeRenderRevision,
          title: dto.title ?? null,
          description: dto.description ?? null,
          originalFilename: lockedSession.originalFilename,
          mimeType: detectedMimeType,
          originalFormat: this.getExtensionFromMimeType(detectedMimeType),
          storageKey: finalKey,
          fileSize: actualSize,
          is360: lockedSession.is360,
          checksum,
          processingStatus: ProcessingStatus.UPLOADED,
          processingError: null,
        });

        await manager.getRepository(Image).save(image);
        await manager.getRepository(UploadSession).update(lockedSession.id, {
          status: UploadSessionStatus.COMPLETED,
          completedAt: new Date(),
          errorMessage: null,
        });
      });

      await this.enqueueProcessing({
        imageId,
        userId,
        tmpStorageKey: session.storageKey,
        storageKey: finalKey,
        mimeType: detectedMimeType,
        is360: session.is360,
        requestedAt: new Date().toISOString(),
      });

      await this.imagesCacheService.invalidateUserLists(userId);

      this.logger.log(`Upload completed: ${imageId}`);

      return {
        id: imageId,
        status: 'uploaded',
        processingStatus: ProcessingStatus.UPLOADED,
        message: 'Upload confirmed. Processing started.',
      };
    } catch (error) {
      if (error instanceof BusinessException) {
        throw error;
      }

      if (initialFrameState?.frameSnapshotKey) {
        await this.storageService.deleteObject(
          initialFrameState.frameSnapshotKey,
        );
      }
      await this.failSession(session, (error as Error).message);
      throw new BusinessException(
        'UPLOAD_COMPLETION_FAILED',
        'Upload completion failed.',
        HttpStatus.UNPROCESSABLE_ENTITY,
      );
    }
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
      errorMessage: session.errorMessage ?? null,
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
      return;
    }

    await this.dataSource.transaction(async (manager) => {
      await this.storageQuotaService.releasePending(
        userId,
        Number(session.expectedFileSize),
        manager,
      );
      await manager.getRepository(UploadSession).update(sessionId, {
        status: UploadSessionStatus.CANCELLED,
        errorMessage: null,
      });
    });

    await this.storageService.deleteObject(session.storageKey);
    this.logger.log(`Upload session cancelled: ${sessionId}`);
  }

  private async countDailyUploads(userId: string): Promise<number> {
    const startOfDay = new Date();
    startOfDay.setHours(0, 0, 0, 0);

    return this.uploadSessionRepository
      .createQueryBuilder('session')
      .where('session.userId = :userId', { userId })
      .andWhere('session.createdAt >= :startOfDay', { startOfDay })
      .getCount();
  }

  private async expireSession(session: UploadSession): Promise<void> {
    await this.dataSource.transaction(async (manager) => {
      await this.storageQuotaService.releasePending(
        session.userId,
        Number(session.expectedFileSize),
        manager,
      );
      await manager.getRepository(UploadSession).update(session.id, {
        status: UploadSessionStatus.EXPIRED,
        errorMessage: 'Upload session expired before completion.',
      });
    });
  }

  private async failSession(
    session: UploadSession,
    errorMessage: string,
  ): Promise<never> {
    await this.dataSource.transaction(async (manager) => {
      await this.storageQuotaService.releasePending(
        session.userId,
        Number(session.expectedFileSize),
        manager,
      );
      await manager.getRepository(UploadSession).update(session.id, {
        status: UploadSessionStatus.FAILED,
        errorMessage,
      });
    });

    await this.storageService.deleteObject(session.storageKey);

    throw new BusinessException(
      'UPLOAD_VALIDATION_FAILED',
      errorMessage,
      HttpStatus.UNPROCESSABLE_ENTITY,
    );
  }

  private async buildExistingCompletionResponse(imageId: string): Promise<{
    id: string;
    status: string;
    processingStatus: string;
    message: string;
  }> {
    const existingImage = await this.imageRepository.findOne({
      where: { id: imageId },
    });

    return {
      id: imageId,
      status: 'uploaded',
      processingStatus:
        existingImage?.processingStatus ?? ProcessingStatus.UPLOADED,
      message: existingImage
        ? 'Upload already completed'
        : 'Upload completion already recorded.',
    };
  }

  private async enqueueProcessing(
    jobData: ImageProcessingJobData,
  ): Promise<void> {
    const maxAttempts = 3;
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        await this.processingQueue.add(
          ImageProcessingJobType.PROCESS_IMAGE,
          jobData,
          {
            jobId: `process-${jobData.imageId}`,
            priority: jobData.is360 ? 2 : 1,
          },
        );
        return;
      } catch (error) {
        this.logger.error(
          `Queue handoff attempt ${attempt}/${maxAttempts} failed for ${jobData.imageId}: ${(error as Error).message}`,
        );
        if (attempt < maxAttempts) {
          await new Promise((resolve) => setTimeout(resolve, 1000));
        }
      }
    }
  }

  private assertAllowedMimeType(mimeType: string): void {
    if (!this.allowedMimeTypes.includes(mimeType)) {
      throw new BusinessException(
        'INVALID_FILE_TYPE',
        `Unsupported image type: ${mimeType}`,
        HttpStatus.BAD_REQUEST,
      );
    }
  }

  private assertAllowedFileSize(fileSize: number): void {
    if (fileSize <= 0 || fileSize > this.maxFileSize) {
      throw new BusinessException(
        'FILE_TOO_LARGE',
        'File exceeds allowed size',
        HttpStatus.BAD_REQUEST,
      );
    }
  }

  private detectMimeType(
    format: string | undefined,
    requestedMimeType: string,
  ): string {
    if (!format) {
      throw new BusinessException(
        'INVALID_IMAGE',
        'Unable to detect uploaded image format.',
        HttpStatus.UNPROCESSABLE_ENTITY,
      );
    }

    if (format === 'jpeg') {
      return 'image/jpeg';
    }

    if (format === 'png') {
      return 'image/png';
    }

    if (format === 'heif') {
      return requestedMimeType === 'image/heic' ? 'image/heic' : 'image/heif';
    }

    throw new BusinessException(
      'INVALID_FILE_TYPE',
      `Unsupported detected image format: ${format}`,
      HttpStatus.UNPROCESSABLE_ENTITY,
    );
  }

  private mimeTypesMatch(
    detectedMimeType: string,
    requestedMimeType: string,
  ): boolean {
    if (detectedMimeType === requestedMimeType) {
      return true;
    }

    const heifSet = new Set(['image/heic', 'image/heif']);
    return heifSet.has(detectedMimeType) && heifSet.has(requestedMimeType);
  }

  private buildTemporaryStorageKey(
    userId: string,
    imageId: string,
    mimeType: string,
    now: Date,
  ): string {
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');

    return `tmp/${userId}/${year}/${month}/${imageId}.${this.getExtensionFromMimeType(mimeType)}`;
  }

  private buildPermanentStorageKey(
    userId: string,
    imageId: string,
    mimeType: string,
    createdAt: Date,
  ): string {
    const year = createdAt.getFullYear();
    const month = String(createdAt.getMonth() + 1).padStart(2, '0');

    return `images/${userId}/${year}/${month}/${imageId}.${this.getExtensionFromMimeType(mimeType)}`;
  }

  private get allowedMimeTypes(): string[] {
    return this.configService.get<string[]>('image.allowedMimeTypes', [
      'image/jpeg',
      'image/png',
      'image/heic',
      'image/heif',
    ]);
  }

  private get dailyUploadLimit(): number {
    return this.configService.get<number>('image.dailyUploadLimit', 100);
  }

  private get maxFileSize(): number {
    return this.configService.get<number>('image.maxSize', 52428800);
  }

  private get presignedUrlExpiry(): number {
    return this.configService.get<number>('storage.presignedUrlExpiry', 3600);
  }

  private getExtensionFromMimeType(mimeType: string): string {
    const map: Record<string, string> = {
      'image/jpeg': 'jpg',
      'image/png': 'png',
      'image/heic': 'heic',
      'image/heif': 'heif',
    };

    return map[mimeType] ?? 'jpg';
  }

  private sanitizeFilename(filename: string): string {
    const cleaned = filename.replace(/[^a-zA-Z0-9._-]/g, '_');
    return cleaned.substring(0, 255);
  }
}
