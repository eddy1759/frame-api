/* eslint-disable @typescript-eslint/no-require-imports */
import { InjectQueue, Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Job, Queue } from 'bullmq';
import sharp = require('sharp');
import * as exifr from 'exifr';
import { ConfigService } from '@nestjs/config';
import { QueryDeepPartialEntity } from 'typeorm/query-builder/QueryPartialEntity';
import { Image } from '../entities/image.entity';
import {
  ImageOrientation,
  ProcessingStatus,
  VariantType,
} from '../types/image.types';
import { resolveAutoOrientedDimensions } from '../utils/render-transform.util';
import { ImageVariantService } from '../services/image-variant.service';
import { ImagesCacheService } from '../services/images-cache.service';
import { StorageQuotaService } from '../services/storage-quota.service';
import { StorageService } from '../../common/services/storage.service';
import {
  ALBUM_EVENTS_QUEUE,
  AlbumEventJobType,
  AlbumImageAddedJobData,
  IMAGE_PROCESSING_QUEUE,
  ImageProcessingJobData,
} from '../../common/queue/queue.constants';
import { ImageCompositingService } from '../services/image-compositing.service';

interface VariantConfig {
  maxWidth: number;
  maxHeight: number;
  quality: number;
  fit: 'cover' | 'inside';
}

@Processor(IMAGE_PROCESSING_QUEUE)
export class ImageProcessingWorker extends WorkerHost {
  private readonly logger = new Logger(ImageProcessingWorker.name);

  constructor(
    @InjectRepository(Image)
    private readonly imageRepository: Repository<Image>,
    @InjectQueue(ALBUM_EVENTS_QUEUE)
    private readonly albumEventsQueue: Queue,
    private readonly imageVariantService: ImageVariantService,
    private readonly storageQuotaService: StorageQuotaService,
    private readonly imagesCacheService: ImagesCacheService,
    private readonly storageService: StorageService,
    private readonly configService: ConfigService,
    private readonly imageCompositingService: ImageCompositingService,
  ) {
    super();
  }

  async process(job: Job<ImageProcessingJobData>): Promise<void> {
    if (job.name === 'prewarm-frame-render') {
      await this.prewarmFrameRender(job);
      return;
    }

    await this.processImage(job);
  }

  private async prewarmFrameRender(
    job: Job<ImageProcessingJobData>,
  ): Promise<void> {
    const { imageId } = job.data;

    this.logger.log(
      `Prewarming frame renders for image: ${imageId} (job ${job.id})`,
    );

    try {
      await this.imageCompositingService.prewarmActiveRenderVariants(imageId);
      await this.publishAlbumImageAdded(job.data);
      this.logger.log(`Frame render prewarm completed for ${imageId}`);
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'Unknown frame render error';
      this.logger.error(
        `Frame render prewarm failed for ${imageId}: ${message}`,
      );
      throw error;
    }
  }

  private async processImage(job: Job<ImageProcessingJobData>): Promise<void> {
    const { imageId, userId, tmpStorageKey, storageKey, mimeType, is360 } =
      job.data;

    if (!userId || !storageKey || !mimeType) {
      throw new Error(
        `Image job ${job.id} is missing required storage metadata.`,
      );
    }

    this.logger.log(`Processing image: ${imageId} (job ${job.id})`);

    try {
      await this.imageRepository.update(imageId, {
        processingStatus: ProcessingStatus.PROCESSING,
        processingError: null,
      });

      const sourceKey = tmpStorageKey || storageKey;
      const originalBuffer =
        await this.storageService.getObjectBuffer(sourceKey);
      const metadata = await sharp(originalBuffer).metadata();
      const orientedDimensions = resolveAutoOrientedDimensions(metadata);
      const width = orientedDimensions.width;
      const height = orientedDimensions.height;
      const aspectRatio = this.computeAspectRatio(width, height);
      const orientation = this.computeOrientation(width, height);
      const exifData = await this.extractExif(originalBuffer, imageId);

      let validated360 = Boolean(is360);
      if (validated360) {
        validated360 = this.validate360Image(width, height, exifData);
        if (!validated360) {
          this.logger.warn(
            `Image ${imageId} claimed as 360 but failed validation. Processing as standard.`,
          );
        }
      }

      if (sourceKey !== storageKey) {
        await this.storageService.copyObject(sourceKey, storageKey);
      }

      await this.imageVariantService.createVariant({
        imageId,
        variantType: VariantType.ORIGINAL,
        storageKey,
        mimeType,
        fileSize: originalBuffer.length,
        width,
        height,
      });

      const variantConfigs = this.getVariantConfigs(validated360);
      const failures: string[] = [];
      let totalVariantBytes = 0;

      for (const [variantType, config] of Object.entries(variantConfigs)) {
        try {
          const variantBuffer = await this.generateVariant(
            originalBuffer,
            config,
          );
          const variantKey = this.buildVariantStorageKey(
            storageKey,
            variantType,
          );
          const variantMetadata = await sharp(variantBuffer).metadata();

          await this.storageService.putObject(
            variantKey,
            variantBuffer,
            'image/jpeg',
          );
          await this.imageVariantService.createVariant({
            imageId,
            variantType: variantType as VariantType,
            storageKey: variantKey,
            mimeType: 'image/jpeg',
            fileSize: variantBuffer.length,
            width: variantMetadata.width || 0,
            height: variantMetadata.height || 0,
            quality: config.quality,
          });

          totalVariantBytes += variantBuffer.length;
        } catch (error) {
          failures.push(
            `${variantType}: ${error instanceof Error ? error.message : 'unknown error'}`,
          );
        }
      }

      if (failures.length > 0) {
        throw new Error(`Variant generation failed (${failures.join('; ')})`);
      }

      const allVariants =
        await this.imageVariantService.getVariantsByImageId(imageId);
      const thumbnail = allVariants.find(
        (variant) => variant.variantType === VariantType.THUMBNAIL,
      );

      const updatePayload: QueryDeepPartialEntity<Image> = {
        processingStatus: ProcessingStatus.COMPLETED,
        processingError: null,
        width,
        height,
        aspectRatio,
        orientation,
        is360: validated360,
        exifData: () => ':exifData::jsonb',
        exifStripped: true,
        gpsLatitude: null,
        gpsLongitude: null,
        thumbnailUrl: thumbnail
          ? this.storageService.getPublicUrl(thumbnail.storageKey)
          : null,
      };

      await this.imageRepository
        .createQueryBuilder()
        .update(Image)
        .set(updatePayload)
        .setParameters({ exifData: JSON.stringify(exifData) })
        .where('id = :id', { id: imageId })
        .execute();

      const updatedImage = await this.imageRepository.findOne({
        where: { id: imageId },
      });

      if (totalVariantBytes > 0) {
        await this.storageQuotaService.addVariantUsage(
          userId,
          totalVariantBytes,
        );
      }

      if (sourceKey !== storageKey) {
        await this.storageService.deleteObject(sourceKey);
      }

      if (updatedImage) {
        await this.imageCompositingService.queuePrewarmActiveRenderVariants(
          updatedImage,
        );
      }

      await this.imagesCacheService.invalidateImage(imageId);
      await this.imagesCacheService.invalidateUserLists(userId);

      this.logger.log(
        `Processing completed for ${imageId}: ${width}x${height}, ${allVariants.length} variants`,
      );
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'Unknown processing error';

      this.logger.error(`Processing failed for ${imageId}: ${message}`);

      await this.imageRepository.update(imageId, {
        processingStatus: ProcessingStatus.FAILED,
        processingError: message,
      });

      await this.imagesCacheService.invalidateImage(imageId);
      throw error;
    }
  }

  private getVariantConfigs(is360: boolean): Record<string, VariantConfig> {
    const variants = this.configService.get<Record<string, VariantConfig>>(
      'image.variants',
      {},
    );

    if (!is360) {
      const standardVariants = { ...variants };
      delete standardVariants.panoramic_preview;
      return standardVariants;
    }

    return variants;
  }

  private async generateVariant(
    originalBuffer: Buffer,
    config: VariantConfig,
  ): Promise<Buffer> {
    return sharp(originalBuffer)
      .rotate()
      .resize({
        width: config.maxWidth,
        height: config.maxHeight,
        fit: config.fit === 'cover' ? sharp.fit.cover : sharp.fit.inside,
        withoutEnlargement: true,
      })
      .jpeg({
        quality: config.quality,
        progressive: true,
        mozjpeg: true,
      })
      .toBuffer();
  }

  private buildVariantStorageKey(
    originalKey: string,
    variantType: string,
  ): string {
    const lastDotIndex = originalKey.lastIndexOf('.');
    const basePath = originalKey.substring(0, lastDotIndex);
    return `${basePath}_${variantType}.jpg`;
  }

  private async extractExif(
    originalBuffer: Buffer,
    imageId: string,
  ): Promise<Record<string, unknown>> {
    try {
      const rawExif = await exifr.parse(originalBuffer, {
        gps: true,
        tiff: true,
        exif: true,
        xmp: true,
      });

      if (!rawExif || typeof rawExif !== 'object') {
        return {};
      }

      return this.sanitizeExif(rawExif as Record<string, unknown>);
    } catch (error) {
      this.logger.warn(
        `EXIF extraction failed for ${imageId}: ${error instanceof Error ? error.message : 'unknown error'}`,
      );
      return {};
    }
  }

  private sanitizeExif(
    rawExif: Record<string, unknown>,
  ): Record<string, unknown> {
    const allowedKeys = [
      'Make',
      'Model',
      'DateTimeOriginal',
      'ExposureTime',
      'FNumber',
      'ISO',
      'FocalLength',
      'LensModel',
      'ImageWidth',
      'ImageHeight',
      'Orientation',
      'ColorSpace',
      'Flash',
      'WhiteBalance',
    ];

    const sanitized: Record<string, unknown> = {};

    for (const key of allowedKeys) {
      if (rawExif[key] !== undefined) {
        sanitized[key] = rawExif[key];
      }
    }

    return sanitized;
  }

  private computeAspectRatio(width: number, height: number): string {
    if (width === 0 || height === 0) {
      return '1:1';
    }

    const gcd = (a: number, b: number): number => (b === 0 ? a : gcd(b, a % b));
    const divisor = gcd(width, height);
    const w = width / divisor;
    const h = height / divisor;
    const ratio = width / height;

    if (Math.abs(ratio - 16 / 9) < 0.05) return '16:9';
    if (Math.abs(ratio - 9 / 16) < 0.05) return '9:16';
    if (Math.abs(ratio - 4 / 3) < 0.05) return '4:3';
    if (Math.abs(ratio - 3 / 4) < 0.05) return '3:4';
    if (Math.abs(ratio - 3 / 2) < 0.05) return '3:2';
    if (Math.abs(ratio - 2 / 3) < 0.05) return '2:3';
    if (Math.abs(ratio - 1) < 0.05) return '1:1';

    return `${w}:${h}`;
  }

  private computeOrientation(width: number, height: number): ImageOrientation {
    if (width > height) return ImageOrientation.LANDSCAPE;
    if (height > width) return ImageOrientation.PORTRAIT;
    return ImageOrientation.SQUARE;
  }

  private validate360Image(
    width: number,
    height: number,
    exifData: Record<string, unknown>,
  ): boolean {
    const ratio = width / height;
    if (Math.abs(ratio - 2) > 0.15) {
      return false;
    }

    if (width < 4096 || height < 2048) {
      return false;
    }

    return Object.keys(exifData).length >= 0;
  }

  private async publishAlbumImageAdded(
    jobData: ImageProcessingJobData,
  ): Promise<void> {
    const image = await this.imageRepository.findOne({
      where: { id: jobData.imageId },
      select: ['id', 'albumId', 'frameId', 'userId', 'activeRenderRevision'],
    });

    if (!image?.albumId || !image.frameId) {
      return;
    }

    const payload: AlbumImageAddedJobData = {
      albumId: image.albumId,
      imageId: image.id,
      frameId: image.frameId,
      userId: image.userId,
      imageRenderRevision: jobData.renderRevision ?? image.activeRenderRevision,
    };

    if (payload.imageRenderRevision < 1) {
      return;
    }

    await this.albumEventsQueue.add(AlbumEventJobType.IMAGE_ADDED, payload, {
      jobId: `album-add-${payload.albumId}-${payload.imageId}`,
      priority: 2,
    });
  }
}
