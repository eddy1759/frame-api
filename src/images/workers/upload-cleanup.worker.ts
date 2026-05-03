import { Injectable, Logger } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { InjectRepository } from '@nestjs/typeorm';
import { Cron, CronExpression } from '@nestjs/schedule';
import { Queue } from 'bullmq';
import { AlbumItem } from '../../albums/entities/album-item.entity';
import { In, LessThan, MoreThan, Repository } from 'typeorm';
import {
  IMAGE_PROCESSING_QUEUE,
  ImageProcessingJobData,
  ImageProcessingJobType,
} from '../../common/queue/queue.constants';
import { StorageService } from '../../common/services/storage.service';
import { Image } from '../entities/image.entity';
import { ImageRenderVariant } from '../entities/image-render-variant.entity';
import { ImageVariant } from '../entities/image-variant.entity';
import { UploadSession } from '../entities/upload-session.entity';
import { ProcessingStatus, UploadSessionStatus } from '../types/image.types';
import { ImagesCacheService } from '../services/images-cache.service';
import { ImageRenderVariantService } from '../services/image-render-variant.service';
import { ImageVariantService } from '../services/image-variant.service';
import { StorageQuotaService } from '../services/storage-quota.service';

@Injectable()
export class UploadCleanupService {
  private readonly logger = new Logger(UploadCleanupService.name);

  constructor(
    @InjectRepository(UploadSession)
    private readonly uploadSessionRepository: Repository<UploadSession>,
    @InjectRepository(AlbumItem)
    private readonly albumItemRepository: Repository<AlbumItem>,
    @InjectRepository(Image)
    private readonly imageRepository: Repository<Image>,
    @InjectRepository(ImageRenderVariant)
    private readonly imageRenderVariantRepository: Repository<ImageRenderVariant>,
    private readonly imageVariantService: ImageVariantService,
    private readonly imageRenderVariantService: ImageRenderVariantService,
    private readonly storageQuotaService: StorageQuotaService,
    private readonly storageService: StorageService,
    private readonly imagesCacheService: ImagesCacheService,
    @InjectQueue(IMAGE_PROCESSING_QUEUE)
    private readonly processingQueue: Queue,
  ) {}

  @Cron(CronExpression.EVERY_10_MINUTES)
  async handleExpiredSessions(): Promise<void> {
    const cleaned = await this.cleanupExpiredSessions();
    this.logger.log(`Expired session cleanup processed ${cleaned} sessions`);
  }

  @Cron('0 */15 * * * *')
  async handleStalledUploads(): Promise<void> {
    const requeued = await this.requeueStalledUploads();
    this.logger.log(`Requeued ${requeued} stalled uploaded images`);
  }

  @Cron(CronExpression.EVERY_DAY_AT_2AM)
  async handleHardDeletes(): Promise<void> {
    const deleted = await this.cleanupHardDeletes();
    const staleRenderVariants = await this.cleanupStaleRenderVariants();
    this.logger.log(
      `Hard delete cleanup processed ${deleted} images and ${staleRenderVariants} stale framed render variants`,
    );
  }

  @Cron(CronExpression.EVERY_DAY_AT_3AM)
  async handleQuotaReconciliation(): Promise<void> {
    this.logger.log('Running daily quota reconciliation...');

    const usersWithImages = await this.imageRepository
      .createQueryBuilder('image')
      .select('DISTINCT image.userId', 'userId')
      .where('image.isDeleted = false')
      .getRawMany<{ userId: string }>();

    for (const { userId } of usersWithImages) {
      try {
        const result: Array<{
          total_bytes: string | null;
          image_count: string | null;
        }> = await this.imageRepository.query(
          `
            SELECT
              COALESCE(SUM(i.file_size), 0) +
              COALESCE(SUM(COALESCE(i.frame_snapshot_size, 0)), 0) +
              COALESCE(SUM(COALESCE(i.pending_frame_snapshot_size, 0)), 0) +
              COALESCE((
                SELECT SUM(v.file_size)
                FROM image_variants v
                WHERE v.image_id IN (
                  SELECT id FROM images WHERE user_id = $1 AND is_deleted = false
                )
                AND v.variant_type <> 'original'
              ), 0) +
              COALESCE((
                SELECT SUM(rv.file_size)
                FROM image_render_variants rv
                WHERE rv.image_id IN (
                  SELECT id FROM images WHERE user_id = $1 AND is_deleted = false
                )
              ), 0) AS total_bytes,
              COUNT(*)::int AS image_count
            FROM images i
            WHERE i.user_id = $1 AND i.is_deleted = false
          `,
          [userId],
        );

        const actualUsedBytes = parseInt(result?.[0]?.total_bytes ?? '0', 10);
        const actualImageCount = parseInt(result?.[0]?.image_count ?? '0', 10);

        await this.storageQuotaService.reconcileQuota(
          userId,
          actualUsedBytes,
          actualImageCount,
        );
      } catch (error) {
        this.logger.error(
          `Quota reconciliation failed for user ${userId}: ${error instanceof Error ? error.message : 'unknown error'}`,
        );
      }
    }

    this.logger.log('Quota reconciliation complete');
  }

  async triggerCleanup(): Promise<{
    expiredSessions: number;
    hardDeleted: number;
    requeuedUploads: number;
    staleRenderVariants: number;
  }> {
    const expiredSessions = await this.cleanupExpiredSessions();
    const hardDeleted = await this.cleanupHardDeletes();
    const requeuedUploads = await this.requeueStalledUploads();
    const staleRenderVariants = await this.cleanupStaleRenderVariants();

    return {
      expiredSessions,
      hardDeleted,
      requeuedUploads,
      staleRenderVariants,
    };
  }

  private async cleanupExpiredSessions(): Promise<number> {
    const expiredSessions = await this.uploadSessionRepository.find({
      where: {
        status: In([
          UploadSessionStatus.PENDING,
          UploadSessionStatus.COMPLETING,
        ]),
        expiresAt: LessThan(new Date()),
      },
      take: 100,
    });

    let cleaned = 0;

    for (const session of expiredSessions) {
      try {
        await this.uploadSessionRepository.manager.transaction(
          async (manager) => {
            const lockedSession = await manager
              .getRepository(UploadSession)
              .createQueryBuilder('session')
              .setLock('pessimistic_write')
              .where('session.id = :id', { id: session.id })
              .getOne();

            if (
              !lockedSession ||
              ![
                UploadSessionStatus.PENDING,
                UploadSessionStatus.COMPLETING,
              ].includes(lockedSession.status)
            ) {
              return;
            }

            await this.storageQuotaService.releasePending(
              lockedSession.userId,
              Number(lockedSession.expectedFileSize),
              manager,
            );

            await manager
              .getRepository(UploadSession)
              .update(lockedSession.id, {
                status: UploadSessionStatus.EXPIRED,
                errorMessage: 'Upload session expired before completion.',
              });
          },
        );

        await this.storageService.deleteObject(session.storageKey);
        cleaned += 1;
      } catch (error) {
        this.logger.error(
          `Failed to clean expired session ${session.id}: ${error instanceof Error ? error.message : 'unknown error'}`,
        );
      }
    }

    return cleaned;
  }

  private async cleanupHardDeletes(): Promise<number> {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - 30);

    const imagesToDelete = await this.imageRepository.find({
      where: {
        isDeleted: true,
        deletedAt: LessThan(cutoffDate),
      },
      take: 50,
    });

    let hardDeleted = 0;

    for (const image of imagesToDelete) {
      try {
        const variants = await this.imageVariantService.getVariantsByImageId(
          image.id,
        );
        const renderVariants =
          await this.imageRenderVariantService.getRenderVariantsByImageId(
            image.id,
          );
        const storageKeys = Array.from(
          new Set([
            image.storageKey,
            image.frameSnapshotKey,
            image.pendingFrameSnapshotKey,
            ...variants.map((variant) => variant.storageKey),
            ...renderVariants.map((variant) => variant.storageKey),
          ]),
        ).filter((key): key is string => Boolean(key));

        await this.storageService.deleteObjects(storageKeys);

        await this.imageRepository.manager.transaction(async (manager) => {
          await manager
            .getRepository(ImageVariant)
            .delete({ imageId: image.id });
          await manager
            .getRepository(ImageRenderVariant)
            .delete({ imageId: image.id });
          await manager.getRepository(Image).delete(image.id);
        });

        await this.imagesCacheService.invalidateImage(image.id);
        await this.imagesCacheService.invalidateUserLists(image.userId);

        hardDeleted += 1;
      } catch (error) {
        this.logger.error(
          `Failed to hard-delete ${image.id}: ${error instanceof Error ? error.message : 'unknown error'}`,
        );
      }
    }

    return hardDeleted;
  }

  private async cleanupStaleRenderVariants(): Promise<number> {
    const images = await this.imageRepository.find({
      where: {
        isDeleted: false,
        activeRenderRevision: MoreThan(1),
      },
      select: ['id', 'userId', 'activeRenderRevision'],
      take: 200,
    });

    let deletedCount = 0;

    for (const image of images) {
      try {
        const referencedAlbumItems = await this.albumItemRepository.find({
          where: { imageId: image.id },
          select: ['imageRenderRevision'],
        });
        const protectedRevisions = new Set(
          referencedAlbumItems.map((item) => item.imageRenderRevision),
        );
        const staleVariants = await this.imageRenderVariantRepository.find({
          where: {
            imageId: image.id,
            renderRevision: LessThan(image.activeRenderRevision),
          },
        });
        const deletableVariants = staleVariants.filter(
          (variant) => !protectedRevisions.has(variant.renderRevision),
        );

        if (deletableVariants.length === 0) {
          continue;
        }

        const storageKeys = deletableVariants.map(
          (variant) => variant.storageKey,
        );
        const totalBytes = deletableVariants.reduce(
          (sum, variant) => sum + Number(variant.fileSize),
          0,
        );

        await this.storageService.deleteObjects(storageKeys);
        await this.imageRenderVariantRepository.delete(
          deletableVariants.map((variant) => variant.id),
        );

        if (totalBytes > 0) {
          await this.storageQuotaService.reclaimVariantUsage(
            image.userId,
            totalBytes,
          );
        }

        deletedCount += deletableVariants.length;
      } catch (error) {
        this.logger.error(
          `Failed to clean stale render variants for ${image.id}: ${
            error instanceof Error ? error.message : 'unknown error'
          }`,
        );
      }
    }

    return deletedCount;
  }

  private async requeueStalledUploads(): Promise<number> {
    const cutoff = new Date(Date.now() - 5 * 60 * 1000);
    const stalledImages = await this.imageRepository.find({
      where: {
        processingStatus: ProcessingStatus.UPLOADED,
        updatedAt: LessThan(cutoff),
      },
      take: 50,
    });

    let requeued = 0;

    for (const image of stalledImages) {
      try {
        const session = await this.uploadSessionRepository.findOne({
          where: { id: image.id },
        });

        const jobData: ImageProcessingJobData = {
          imageId: image.id,
          userId: image.userId,
          tmpStorageKey: session?.storageKey ?? image.storageKey,
          storageKey: image.storageKey,
          mimeType: image.mimeType,
          is360: image.is360,
          requestedAt: new Date().toISOString(),
        };

        await this.processingQueue.add(
          ImageProcessingJobType.PROCESS_IMAGE,
          jobData,
          {
            jobId: `process-${image.id}`,
            priority: image.is360 ? 2 : 1,
          },
        );

        requeued += 1;
      } catch (error) {
        this.logger.error(
          `Failed to requeue image ${image.id}: ${error instanceof Error ? error.message : 'unknown error'}`,
        );
      }
    }

    return requeued;
  }
}
