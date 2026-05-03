/* eslint-disable @typescript-eslint/explicit-function-return-type */
/* eslint-disable @typescript-eslint/no-unsafe-assignment */
import { Injectable, Logger, HttpStatus } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { User } from '../../auth/entities/user.entity';
import { BusinessException } from '../../common/filters/business.exception';
import {
  PaginatedResult,
  PaginationService,
} from '../../common/services/pagination.service';
import { StorageService } from '../../common/services/storage.service';
import { FramesService } from '../../frames/services/frames.service';
import { BatchGetImagesDto } from '../dto/batch-get-images.dto';
import { QueryImagesDto } from '../dto/query-images.dto';
import { ReprocessImageDto } from '../dto/reprocess-image.dto';
import { UpdateImageDto } from '../dto/update-image.dto';
import { Image } from '../entities/image.entity';
import { ImageRenderVariant } from '../entities/image-render-variant.entity';
import { ImageVariant } from '../entities/image-variant.entity';
import { UploadSession } from '../entities/upload-session.entity';
import { FrameRenderStatus, UploadSessionStatus } from '../types/image.types';
import {
  RenderTransformV1,
  areRenderTransformsEqual,
  normalizeRenderTransform,
  resolveRenderTransform,
} from '../utils/render-transform.util';
import { ImagesCacheService } from './images-cache.service';
import { ImageCompositingService } from './image-compositing.service';
import { ImageRenderVariantService } from './image-render-variant.service';
import { ImageVariantService } from './image-variant.service';
import { StorageQuotaService } from './storage-quota.service';

type CompositingChange = Awaited<
  ReturnType<ImageCompositingService['buildPendingFrameChange']>
>;

@Injectable()
export class ImagesService {
  private readonly logger = new Logger(ImagesService.name);

  constructor(
    @InjectRepository(Image)
    private readonly imageRepository: Repository<Image>,
    @InjectRepository(UploadSession)
    private readonly uploadSessionRepository: Repository<UploadSession>,
    private readonly imageVariantService: ImageVariantService,
    private readonly imageRenderVariantService: ImageRenderVariantService,
    private readonly imagesCacheService: ImagesCacheService,
    private readonly storageQuotaService: StorageQuotaService,
    private readonly paginationService: PaginationService,
    private readonly framesService: FramesService,
    private readonly imageCompositingService: ImageCompositingService,
    private readonly storageService: StorageService,
  ) {}

  async getImageById(imageId: string, userId: string) {
    const image = await this.imageRepository.findOne({
      where: { id: imageId, isDeleted: false, userId },
    });

    if (!image) {
      throw new BusinessException(
        'IMAGE_NOT_FOUND',
        'Image not found',
        HttpStatus.NOT_FOUND,
      );
    }

    const variants =
      await this.imageVariantService.getVariantsByImageId(imageId);

    return {
      id: image.id,
      userId: image.userId,
      frameId: image.frameId,
      pendingFrameId: image.pendingFrameId,
      frameRenderStatus: image.frameRenderStatus,
      activeRenderRevision: image.activeRenderRevision,
      renderTransform: this.resolveActiveTransformForResponse(image),
      pendingRenderTransform: this.resolvePendingTransformForResponse(image),
      finalRender: await this.imageCompositingService.resolveFinalRender(image),
      thumbnailUrl: await this.imageCompositingService.resolveThumbnailUrl(
        image,
        variants,
      ),
      title: image.title,
      description: image.description,
      originalFilename: image.originalFilename,
      mimeType: image.mimeType,
      fileSize: Number(image.fileSize),
      width: image.width,
      height: image.height,
      aspectRatio: image.aspectRatio,
      orientation: image.orientation,
      is360: image.is360,
      processingStatus: image.processingStatus,
      processingError: image.processingError,
      isPublic: image.isPublic,
      variants: await this.imageCompositingService.resolveVariantResponses(
        image,
        variants,
      ),
      createdAt: image.createdAt,
      updatedAt: image.updatedAt,
    };
  }

  async listImages(
    userId: string,
    query: QueryImagesDto,
  ): Promise<PaginatedResult<any>> {
    const pagination = this.paginationService.resolve(query);
    const qb = this.imageRepository
      .createQueryBuilder('image')
      .where('image.userId = :userId', { userId })
      .andWhere('image.isDeleted = :isDeleted', { isDeleted: false });

    if (query.frameId) {
      qb.andWhere('image.frameId = :frameId', { frameId: query.frameId });
    }

    if (query.is360 !== undefined) {
      qb.andWhere('image.is360 = :is360', { is360: query.is360 });
    }

    if (query.processingStatus) {
      qb.andWhere('image.processingStatus = :processingStatus', {
        processingStatus: query.processingStatus,
      });
    }

    if (query.startDate) {
      qb.andWhere('image.createdAt >= :startDate', {
        startDate: query.startDate,
      });
    }

    if (query.endDate) {
      qb.andWhere('image.createdAt <= :endDate', { endDate: query.endDate });
    }

    const sortMap: Record<string, string> = {
      createdAt: 'image.createdAt',
      title: 'image.title',
      processingStatus: 'image.processingStatus',
      fileSize: 'image.fileSize',
    };

    qb.orderBy(
      sortMap[query.sortBy ?? 'createdAt'] ?? 'image.createdAt',
      query.sortOrder ?? 'DESC',
    )
      .addOrderBy('image.createdAt', 'DESC')
      .addOrderBy('image.id', 'ASC')
      .skip(pagination.skip)
      .take(pagination.take);

    const [images, total] = await qb.getManyAndCount();
    const variantsByImageId =
      await this.imageVariantService.getVariantsByImageIds(
        images.map((image) => image.id),
      );

    const data = await Promise.all(
      images.map(async (image) => {
        const variants = variantsByImageId.get(image.id) ?? [];

        return {
          id: image.id,
          title: image.title,
          thumbnailUrl: await this.imageCompositingService.resolveThumbnailUrl(
            image,
            variants,
          ),
          fileSize: Number(image.fileSize),
          width: image.width,
          height: image.height,
          processingStatus: image.processingStatus,
          is360: image.is360,
          frameId: image.frameId,
          pendingFrameId: image.pendingFrameId,
          frameRenderStatus: image.frameRenderStatus,
          activeRenderRevision: image.activeRenderRevision,
          renderTransform: this.resolveActiveTransformForResponse(image),
          pendingRenderTransform:
            this.resolvePendingTransformForResponse(image),
          finalRender:
            await this.imageCompositingService.resolveFinalRender(image),
          mimeType: image.mimeType,
          createdAt: image.createdAt,
        };
      }),
    );

    return {
      data,
      meta: this.paginationService.buildMeta(
        total,
        pagination.page,
        pagination.limit,
      ),
    };
  }

  async updateImage(imageId: string, user: User, dto: UpdateImageDto) {
    const image = await this.imageRepository.findOne({
      where: { id: imageId, isDeleted: false, userId: user.id },
    });

    if (!image) {
      throw new BusinessException(
        'IMAGE_NOT_FOUND',
        'Image not found',
        HttpStatus.NOT_FOUND,
      );
    }

    if (dto.frameId) {
      await this.framesService.assertFrameEligibleForImage(dto.frameId, user);
    }

    const updateData: Partial<Image> = {};
    let compositingChange: CompositingChange | null = null;
    const hasPendingFrameChange =
      Boolean(image.pendingFrameId || image.pendingFrameSnapshotKey) ||
      this.isPendingFrameRemoval(image);
    const hasPendingTransformChange = image.pendingRenderTransform !== null;

    if (dto.title !== undefined) {
      updateData.title = dto.title;
    }

    if (dto.description !== undefined) {
      updateData.description = dto.description;
    }

    if (dto.frameId !== undefined) {
      if (dto.frameId === image.frameId) {
        compositingChange =
          this.imageCompositingService.buildPendingReset(image);
      } else if (dto.frameId === null && image.frameId === null) {
        compositingChange =
          this.imageCompositingService.buildPendingReset(image);
      } else {
        compositingChange =
          await this.imageCompositingService.buildPendingFrameChange(
            image,
            dto.frameId ?? null,
          );
      }

      Object.assign(updateData, compositingChange.updateData);
    }

    if (dto.transform !== undefined) {
      if (dto.frameId === null) {
        throw new BusinessException(
          'IMAGE_RENDER_TRANSFORM_REQUIRES_FRAME',
          'Render transform updates require a staged or active frame.',
          HttpStatus.BAD_REQUEST,
        );
      }

      if (dto.transform === null) {
        updateData.pendingRenderTransform = null;
        if (!hasPendingFrameChange && !compositingChange) {
          updateData.frameRenderStatus = image.frameId
            ? FrameRenderStatus.READY
            : FrameRenderStatus.NONE;
        }
      } else {
        if (dto.frameId === undefined && this.isPendingFrameRemoval(image)) {
          throw new BusinessException(
            'IMAGE_RENDER_TRANSFORM_REQUIRES_FRAME',
            'Cancel the pending frame removal before applying a render transform.',
            HttpStatus.BAD_REQUEST,
          );
        }

        const targetFrameId =
          dto.frameId !== undefined
            ? dto.frameId
            : (image.pendingFrameId ?? image.frameId);

        if (!targetFrameId) {
          throw new BusinessException(
            'IMAGE_RENDER_TRANSFORM_REQUIRES_FRAME',
            'Render transform updates require a staged or active frame.',
            HttpStatus.BAD_REQUEST,
          );
        }

        const normalizedTransform = normalizeRenderTransform(dto.transform);
        const isNewFrameSelection =
          dto.frameId !== undefined &&
          dto.frameId !== null &&
          dto.frameId !== image.frameId;
        const comparisonBaseline =
          dto.frameId === undefined &&
          (hasPendingFrameChange || hasPendingTransformChange)
            ? image.pendingRenderTransform
            : isNewFrameSelection
              ? null
              : image.renderTransform;

        if (areRenderTransformsEqual(normalizedTransform, comparisonBaseline)) {
          if (dto.frameId === undefined && hasPendingTransformChange) {
            updateData.pendingRenderTransform = null;
            if (!hasPendingFrameChange) {
              updateData.frameRenderStatus = image.frameId
                ? FrameRenderStatus.READY
                : FrameRenderStatus.NONE;
            }
          }
        } else {
          updateData.pendingRenderTransform = normalizedTransform;
          updateData.frameRenderStatus = FrameRenderStatus.PENDING_REPROCESS;
        }
      }
    }

    if (Object.keys(updateData).length === 0) {
      return this.getImageById(imageId, user.id);
    }

    try {
      await this.imageRepository.manager.transaction(async (manager) => {
        await manager.getRepository(Image).save({
          ...image,
          ...updateData,
        });

        if (compositingChange?.quotaAddBytes) {
          await this.storageQuotaService.addVariantUsage(
            user.id,
            compositingChange.quotaAddBytes,
            manager,
          );
        }

        if (compositingChange?.quotaReclaimBytes) {
          await this.storageQuotaService.reclaimVariantUsage(
            user.id,
            compositingChange.quotaReclaimBytes,
            manager,
          );
        }
      });
    } catch (error) {
      const newPendingSnapshotKey =
        this.getNewPendingSnapshotKey(compositingChange);

      if (newPendingSnapshotKey) {
        await this.deleteStorageKeysQuietly([newPendingSnapshotKey]);
      }

      throw error;
    }

    if (compositingChange?.deleteSnapshotKeys.length) {
      await this.deleteStorageKeysQuietly(compositingChange.deleteSnapshotKeys);
    }

    await this.imagesCacheService.invalidateImage(imageId);
    await this.imagesCacheService.invalidateUserLists(user.id);

    return this.getImageById(imageId, user.id);
  }

  async requestReprocess(
    imageId: string,
    user: Pick<User, 'id' | 'role'>,
    dto: ReprocessImageDto = {},
  ): Promise<{
    imageId: string;
    frameId: string | null;
    frameRenderStatus: FrameRenderStatus;
    pendingFrameId: string | null;
    activeRenderRevision: number;
    queued: boolean;
    message: string;
  }> {
    return this.imageCompositingService.requestReprocess(imageId, user, dto);
  }

  async deleteImage(imageId: string, userId: string): Promise<null> {
    const image = await this.imageRepository.findOne({
      where: { id: imageId, userId },
    });

    if (!image) {
      return null;
    }

    if (image.isDeleted) {
      return null;
    }

    const variants =
      await this.imageVariantService.getVariantsByImageId(imageId);
    const renderVariants =
      await this.imageRenderVariantService.getRenderVariantsByImageId(imageId);
    const variantBytes = variants.reduce(
      (sum, variant) => sum + Number(variant.fileSize),
      0,
    );
    const renderBytes = renderVariants.reduce(
      (sum, variant) => sum + Number(variant.fileSize),
      0,
    );
    const snapshotBytes =
      Number(image.frameSnapshotSize ?? 0) +
      Number(image.pendingFrameSnapshotSize ?? 0);
    const totalBytes =
      Number(image.fileSize) + variantBytes + renderBytes + snapshotBytes;

    await this.imageRepository.update(imageId, {
      isDeleted: true,
      deletedAt: new Date(),
    });

    await this.storageQuotaService.reclaimUsage(userId, totalBytes);
    await this.imagesCacheService.invalidateImage(imageId);
    await this.imagesCacheService.invalidateUserLists(userId);

    this.logger.log(
      `Image soft-deleted: ${imageId}, reclaimed ${totalBytes} bytes for user ${userId}`,
    );

    return null;
  }

  async batchGetImages(userId: string, dto: BatchGetImagesDto) {
    const images = await this.imageRepository.find({
      where: {
        id: In(dto.imageIds),
        isDeleted: false,
        userId,
      },
    });

    const variantsByImageId =
      await this.imageVariantService.getVariantsByImageIds(
        images.map((image) => image.id),
      );

    return Promise.all(
      images.map(async (image) => {
        const variants = variantsByImageId.get(image.id) ?? [];

        return {
          id: image.id,
          title: image.title,
          thumbnailUrl: await this.imageCompositingService.resolveThumbnailUrl(
            image,
            variants,
          ),
          fileSize: Number(image.fileSize),
          width: image.width,
          height: image.height,
          processingStatus: image.processingStatus,
          is360: image.is360,
          frameId: image.frameId,
          pendingFrameId: image.pendingFrameId,
          frameRenderStatus: image.frameRenderStatus,
          activeRenderRevision: image.activeRenderRevision,
          renderTransform: this.resolveActiveTransformForResponse(image),
          pendingRenderTransform:
            this.resolvePendingTransformForResponse(image),
          finalRender:
            await this.imageCompositingService.resolveFinalRender(image),
          mimeType: image.mimeType,
          isPublic: image.isPublic,
          createdAt: image.createdAt,
        };
      }),
    );
  }

  async getStorageSummary(userId: string) {
    return this.storageQuotaService.getQuotaSummary(userId);
  }

  async getSystemStats() {
    const totalImages = await this.imageRepository.count({
      where: { isDeleted: false },
    });
    const totalDeleted = await this.imageRepository.count({
      where: { isDeleted: true },
    });

    const processingStats = await this.imageRepository
      .createQueryBuilder('image')
      .select('image.processingStatus', 'status')
      .addSelect('COUNT(*)', 'count')
      .where('image.isDeleted = false')
      .groupBy('image.processingStatus')
      .getRawMany();

    const storageStats = await this.imageRepository
      .createQueryBuilder('image')
      .select('SUM(image.fileSize)', 'totalOriginalBytes')
      .where('image.isDeleted = false')
      .getRawOne<{ totalOriginalBytes: string | null }>();

    return {
      totalImages,
      totalDeleted,
      processingStats: processingStats.reduce(
        (
          acc: Record<string, number>,
          row: { status: string; count: string },
        ) => {
          acc[row.status] = parseInt(row.count, 10);
          return acc;
        },
        {},
      ),
      totalOriginalBytes: parseInt(storageStats?.totalOriginalBytes || '0', 10),
    };
  }

  async hardDeleteImage(imageId: string): Promise<void> {
    const image = await this.imageRepository.findOne({
      where: { id: imageId },
    });

    if (!image) {
      return;
    }

    const variants =
      await this.imageVariantService.getVariantsByImageId(imageId);
    const renderVariants =
      await this.imageRenderVariantService.getRenderVariantsByImageId(imageId);
    const totalBytes =
      Number(image.fileSize) +
      variants.reduce((sum, variant) => sum + Number(variant.fileSize), 0) +
      renderVariants.reduce(
        (sum, variant) => sum + Number(variant.fileSize),
        0,
      ) +
      Number(image.frameSnapshotSize ?? 0) +
      Number(image.pendingFrameSnapshotSize ?? 0);
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
      await manager.getRepository(ImageVariant).delete({ imageId });
      await manager.getRepository(ImageRenderVariant).delete({ imageId });
      await manager.getRepository(Image).delete(imageId);
    });

    if (!image.isDeleted && totalBytes > 0) {
      try {
        await this.storageQuotaService.reclaimUsage(image.userId, totalBytes);
      } catch (error) {
        this.logger.warn(
          `Failed to reclaim quota during hard delete for ${imageId}: ${
            error instanceof Error ? error.message : 'unknown error'
          }`,
        );
      }
    }

    await this.imagesCacheService.invalidateImage(imageId);
    await this.imagesCacheService.invalidateUserLists(image.userId);

    this.logger.log(`Image hard-deleted: ${imageId}`);
  }

  async getOrphanedSessions() {
    return this.uploadSessionRepository.find({
      where: {
        status: In([
          UploadSessionStatus.PENDING,
          UploadSessionStatus.COMPLETING,
        ]),
      },
      order: { createdAt: 'DESC' },
      take: 100,
    });
  }

  private resolveActiveTransformForResponse(
    image: Image,
  ): RenderTransformV1 | null {
    if (!image.frameId) {
      return null;
    }

    return resolveRenderTransform(image.renderTransform);
  }

  private resolvePendingTransformForResponse(
    image: Image,
  ): RenderTransformV1 | null {
    if (image.frameRenderStatus !== FrameRenderStatus.PENDING_REPROCESS) {
      return null;
    }

    if (image.pendingRenderTransform) {
      return resolveRenderTransform(image.pendingRenderTransform);
    }

    if (image.pendingFrameId || image.pendingFrameSnapshotKey) {
      return resolveRenderTransform(image.pendingRenderTransform);
    }

    return null;
  }

  private isPendingFrameRemoval(image: Image): boolean {
    return (
      image.frameRenderStatus === FrameRenderStatus.PENDING_REPROCESS &&
      Boolean(image.frameId) &&
      !image.pendingFrameId &&
      !image.pendingFrameSnapshotKey &&
      image.pendingRenderTransform === null
    );
  }

  private getNewPendingSnapshotKey(
    compositingChange: CompositingChange | null,
  ): string | null {
    if (
      !compositingChange?.quotaAddBytes ||
      typeof compositingChange.updateData.pendingFrameSnapshotKey !== 'string'
    ) {
      return null;
    }

    return compositingChange.updateData.pendingFrameSnapshotKey;
  }

  private async deleteStorageKeysQuietly(keys: string[]): Promise<void> {
    const filteredKeys = Array.from(new Set(keys.filter(Boolean)));
    if (filteredKeys.length === 0) {
      return;
    }

    try {
      await this.storageService.deleteObjects(filteredKeys);
    } catch (error) {
      this.logger.warn(
        `Failed to delete image storage objects: ${
          error instanceof Error ? error.message : 'unknown error'
        }`,
      );
    }
  }
}
