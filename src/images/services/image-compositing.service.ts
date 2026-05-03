/* eslint-disable @typescript-eslint/no-require-imports */
import { randomUUID } from 'crypto';
import { InjectQueue } from '@nestjs/bullmq';
import { HttpStatus, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Queue } from 'bullmq';
import { Repository } from 'typeorm';
import sharp = require('sharp');
import { User } from '../../auth/entities/user.entity';
import { UserRole } from '../../auth/enums/user-role.enum';
import { BusinessException } from '../../common/filters/business.exception';
import {
  IMAGE_PROCESSING_QUEUE,
  ImageProcessingJobData,
  ImageProcessingJobType,
} from '../../common/queue/queue.constants';
import { RedisService } from '../../common/redis/redis.service';
import { StorageService } from '../../common/services/storage.service';
import { FrameAssetType } from '../../frames/entities/frame-asset-type.enum';
import { FrameAssetsService } from '../../frames/services/frame-assets.service';
import {
  DEFAULT_FRAME_IMAGE_PLACEMENT,
  FrameImagePlacement,
  FrameRenderPlacement,
  FrameScenePlacement,
  isDefaultFrameImagePlacement,
  isFrameScenePlacement,
  snapshotFrameImagePlacement,
  snapshotFrameRenderPlacement,
} from '../../frames/utils/frame-metadata.util';
import {
  extractSvgCanvasDimensions,
  SvgCanvasDimensions,
} from '../../frames/utils/svg-canvas.util';
import { Image } from '../entities/image.entity';
import { ImageRenderVariant } from '../entities/image-render-variant.entity';
import { ImageVariant } from '../entities/image-variant.entity';
import {
  FrameRenderStatus,
  ProcessingStatus,
  VariantType,
} from '../types/image.types';
import { ImagesCacheService } from './images-cache.service';
import { ImageRenderVariantService } from './image-render-variant.service';
import { StorageQuotaService } from './storage-quota.service';
import {
  resolveCompositeCrop,
  resolveFramedRenderDimensions,
  resolvePlacementRect,
} from '../utils/framed-render.util';
import {
  RenderTransformV1,
  resolveAutoOrientedDimensions,
  resolveRenderTransform,
  resolveTransformPlacement,
} from '../utils/render-transform.util';

interface VariantConfig {
  maxWidth: number;
  maxHeight: number;
  quality: number;
  fit: 'cover' | 'inside';
}

interface FrameStateSnapshot {
  frameId: string | null;
  frameSnapshotKey: string | null;
  frameSnapshotSize: number | null;
  frameSnapshotAssetType: FrameAssetType | null;
  framePlacement: FrameRenderPlacement | null;
  renderTransform: RenderTransformV1 | null;
  pendingFrameId: string | null;
  pendingFrameSnapshotKey: string | null;
  pendingFrameSnapshotSize: number | null;
  pendingFrameSnapshotAssetType: FrameAssetType | null;
  pendingFramePlacement: FrameRenderPlacement | null;
  pendingRenderTransform: RenderTransformV1 | null;
  frameRenderStatus: FrameRenderStatus;
  activeRenderRevision: number;
}

interface PendingFrameChangeResult {
  updateData: Partial<Image>;
  quotaAddBytes: number;
  quotaReclaimBytes: number;
  deleteSnapshotKeys: string[];
}

interface RenderSourceContext {
  renderMode: 'overlay' | 'scene';
  frameSnapshotAssetType: FrameAssetType;
  originalBuffer: Buffer;
  snapshotBuffer: Buffer;
  canvas: SvgCanvasDimensions;
  placement: FrameRenderPlacement;
  sourceWidth: number;
  sourceHeight: number;
  transform: RenderTransformV1;
}

@Injectable()
export class ImageCompositingService {
  private readonly logger = new Logger(ImageCompositingService.name);

  constructor(
    @InjectRepository(Image)
    private readonly imageRepository: Repository<Image>,
    private readonly frameAssetsService: FrameAssetsService,
    private readonly renderVariantService: ImageRenderVariantService,
    private readonly storageService: StorageService,
    private readonly storageQuotaService: StorageQuotaService,
    private readonly imagesCacheService: ImagesCacheService,
    private readonly redisService: RedisService,
    private readonly configService: ConfigService,
    @InjectQueue(IMAGE_PROCESSING_QUEUE)
    private readonly processingQueue: Queue,
  ) {}

  async buildInitialFrameState(
    imageId: string,
    frameId: string | null,
  ): Promise<FrameStateSnapshot> {
    if (!frameId) {
      return {
        frameId: null,
        frameSnapshotKey: null,
        frameSnapshotSize: null,
        frameSnapshotAssetType: null,
        framePlacement: null,
        renderTransform: null,
        pendingFrameId: null,
        pendingFrameSnapshotKey: null,
        pendingFrameSnapshotSize: null,
        pendingFrameSnapshotAssetType: null,
        pendingFramePlacement: null,
        pendingRenderTransform: null,
        frameRenderStatus: FrameRenderStatus.NONE,
        activeRenderRevision: 0,
      };
    }

    const renderSource =
      await this.frameAssetsService.getFrameRenderSourceInfo(frameId);
    const frameSnapshotKey = this.buildFrameSnapshotKey(
      imageId,
      1,
      renderSource.assetType,
    );
    await this.storageService.copyObject(
      renderSource.storageKey,
      frameSnapshotKey,
    );

    return {
      frameId,
      frameSnapshotKey,
      frameSnapshotSize: renderSource.fileSize,
      frameSnapshotAssetType: renderSource.assetType,
      framePlacement: snapshotFrameRenderPlacement(renderSource.placement),
      renderTransform: null,
      pendingFrameId: null,
      pendingFrameSnapshotKey: null,
      pendingFrameSnapshotSize: null,
      pendingFrameSnapshotAssetType: null,
      pendingFramePlacement: null,
      pendingRenderTransform: null,
      frameRenderStatus: FrameRenderStatus.PROCESSING,
      activeRenderRevision: 1,
    };
  }

  async buildPendingFrameChange(
    image: Image,
    nextFrameId: string | null,
  ): Promise<PendingFrameChangeResult> {
    const deleteSnapshotKeys = image.pendingFrameSnapshotKey
      ? [image.pendingFrameSnapshotKey]
      : [];
    const quotaReclaimBytes = Number(image.pendingFrameSnapshotSize ?? 0);

    if (nextFrameId === null) {
      return {
        updateData: {
          pendingFrameId: null,
          pendingFrameSnapshotKey: null,
          pendingFrameSnapshotSize: null,
          pendingFrameSnapshotAssetType: null,
          pendingFramePlacement: null,
          pendingRenderTransform: null,
          frameRenderStatus: image.frameId
            ? FrameRenderStatus.PENDING_REPROCESS
            : FrameRenderStatus.NONE,
        },
        quotaAddBytes: 0,
        quotaReclaimBytes,
        deleteSnapshotKeys,
      };
    }

    const renderSource =
      await this.frameAssetsService.getFrameRenderSourceInfo(nextFrameId);
    const nextRevision = this.getNextRenderRevision(image.activeRenderRevision);
    const pendingSnapshotKey = this.buildFrameSnapshotKey(
      image.id,
      nextRevision,
      renderSource.assetType,
    );
    await this.storageService.copyObject(
      renderSource.storageKey,
      pendingSnapshotKey,
    );

    return {
      updateData: {
        pendingFrameId: nextFrameId,
        pendingFrameSnapshotKey: pendingSnapshotKey,
        pendingFrameSnapshotSize: renderSource.fileSize,
        pendingFrameSnapshotAssetType: renderSource.assetType,
        pendingFramePlacement: snapshotFrameRenderPlacement(
          renderSource.placement,
        ),
        pendingRenderTransform: null,
        frameRenderStatus: FrameRenderStatus.PENDING_REPROCESS,
      },
      quotaAddBytes: renderSource.fileSize,
      quotaReclaimBytes,
      deleteSnapshotKeys,
    };
  }

  buildPendingReset(image: Image): PendingFrameChangeResult {
    return {
      updateData: {
        pendingFrameId: null,
        pendingFrameSnapshotKey: null,
        pendingFrameSnapshotSize: null,
        pendingFrameSnapshotAssetType: null,
        pendingFramePlacement: null,
        pendingRenderTransform: null,
        frameRenderStatus: image.frameId
          ? FrameRenderStatus.READY
          : FrameRenderStatus.NONE,
      },
      quotaAddBytes: 0,
      quotaReclaimBytes: Number(image.pendingFrameSnapshotSize ?? 0),
      deleteSnapshotKeys: image.pendingFrameSnapshotKey
        ? [image.pendingFrameSnapshotKey]
        : [],
    };
  }

  async requestReprocess(
    imageId: string,
    requester: Pick<User, 'id' | 'role'>,
    options: { expectedActiveRenderRevision?: number } = {},
  ): Promise<{
    imageId: string;
    frameId: string | null;
    frameRenderStatus: FrameRenderStatus;
    pendingFrameId: string | null;
    activeRenderRevision: number;
    queued: boolean;
    message: string;
  }> {
    let oldSnapshotKey: string | null = null;
    let oldSnapshotSize = 0;
    let newSnapshotKey: string | null = null;
    let response = {} as {
      imageId: string;
      frameId: string | null;
      frameRenderStatus: FrameRenderStatus;
      pendingFrameId: string | null;
      activeRenderRevision: number;
      queued: boolean;
      message: string;
    };

    try {
      await this.imageRepository.manager.transaction(async (manager) => {
        const lockedImage = await manager
          .getRepository(Image)
          .createQueryBuilder('image')
          .setLock('pessimistic_write')
          .where('image.id = :id', { id: imageId })
          .getOne();

        if (!lockedImage) {
          throw new BusinessException(
            'IMAGE_NOT_FOUND',
            'Image not found',
            HttpStatus.NOT_FOUND,
          );
        }

        const isAdmin = requester.role === UserRole.ADMIN;
        if (!isAdmin && lockedImage.userId !== requester.id) {
          throw new BusinessException(
            'IMAGE_NOT_FOUND',
            'Image not found',
            HttpStatus.NOT_FOUND,
          );
        }

        if (
          options.expectedActiveRenderRevision !== undefined &&
          lockedImage.activeRenderRevision !==
            options.expectedActiveRenderRevision
        ) {
          throw new BusinessException(
            'IMAGE_RENDER_REVISION_CONFLICT',
            'Image render revision changed. Refresh the image state and try again.',
            HttpStatus.CONFLICT,
          );
        }

        if (
          lockedImage.frameRenderStatus === FrameRenderStatus.PENDING_REPROCESS
        ) {
          if (
            lockedImage.pendingFrameId ||
            lockedImage.pendingFrameSnapshotKey
          ) {
            oldSnapshotKey = lockedImage.frameSnapshotKey;
            oldSnapshotSize = Number(lockedImage.frameSnapshotSize ?? 0);
            lockedImage.frameId = lockedImage.pendingFrameId;
            lockedImage.frameSnapshotKey = lockedImage.pendingFrameSnapshotKey;
            lockedImage.frameSnapshotSize =
              lockedImage.pendingFrameSnapshotSize;
            lockedImage.frameSnapshotAssetType =
              lockedImage.pendingFrameSnapshotAssetType;
            lockedImage.framePlacement = lockedImage.pendingFramePlacement;
            lockedImage.renderTransform = lockedImage.pendingRenderTransform;
            lockedImage.pendingFrameId = null;
            lockedImage.pendingFrameSnapshotKey = null;
            lockedImage.pendingFrameSnapshotSize = null;
            lockedImage.pendingFrameSnapshotAssetType = null;
            lockedImage.pendingFramePlacement = null;
            lockedImage.pendingRenderTransform = null;
            lockedImage.frameRenderStatus = FrameRenderStatus.PROCESSING;
            lockedImage.activeRenderRevision = this.getNextRenderRevision(
              lockedImage.activeRenderRevision,
            );
            lockedImage.processingStatus = ProcessingStatus.PROCESSING;
            lockedImage.processingError = null;

            response = {
              imageId,
              frameId: lockedImage.frameId,
              frameRenderStatus: lockedImage.frameRenderStatus,
              pendingFrameId: lockedImage.pendingFrameId,
              activeRenderRevision: lockedImage.activeRenderRevision,
              queued: true,
              message:
                'Pending frame change promoted and render refresh queued.',
            };
          } else if (
            lockedImage.pendingRenderTransform &&
            lockedImage.frameId
          ) {
            lockedImage.renderTransform = lockedImage.pendingRenderTransform;
            if (
              this.shouldRefreshCurrentPlacement(lockedImage.framePlacement)
            ) {
              lockedImage.framePlacement =
                await this.resolveCurrentFramePlacement(lockedImage);
            }
            lockedImage.pendingRenderTransform = null;
            lockedImage.frameRenderStatus = FrameRenderStatus.PROCESSING;
            lockedImage.activeRenderRevision = this.getNextRenderRevision(
              lockedImage.activeRenderRevision,
            );
            lockedImage.processingStatus = ProcessingStatus.PROCESSING;
            lockedImage.processingError = null;

            response = {
              imageId,
              frameId: lockedImage.frameId,
              frameRenderStatus: lockedImage.frameRenderStatus,
              pendingFrameId: lockedImage.pendingFrameId,
              activeRenderRevision: lockedImage.activeRenderRevision,
              queued: true,
              message:
                'Pending transform change promoted and render refresh queued.',
            };
          } else if (lockedImage.frameId) {
            oldSnapshotKey = lockedImage.frameSnapshotKey;
            oldSnapshotSize = Number(lockedImage.frameSnapshotSize ?? 0);
            lockedImage.frameId = null;
            lockedImage.frameSnapshotKey = null;
            lockedImage.frameSnapshotSize = null;
            lockedImage.frameSnapshotAssetType = null;
            lockedImage.framePlacement = null;
            lockedImage.renderTransform = null;
            lockedImage.pendingFrameId = null;
            lockedImage.pendingFrameSnapshotKey = null;
            lockedImage.pendingFrameSnapshotSize = null;
            lockedImage.pendingFrameSnapshotAssetType = null;
            lockedImage.pendingFramePlacement = null;
            lockedImage.pendingRenderTransform = null;
            lockedImage.frameRenderStatus = FrameRenderStatus.NONE;
            lockedImage.activeRenderRevision = this.getNextRenderRevision(
              lockedImage.activeRenderRevision,
            );
            lockedImage.processingStatus = ProcessingStatus.COMPLETED;
            lockedImage.processingError = null;

            response = {
              imageId,
              frameId: lockedImage.frameId,
              frameRenderStatus: lockedImage.frameRenderStatus,
              pendingFrameId: lockedImage.pendingFrameId,
              activeRenderRevision: lockedImage.activeRenderRevision,
              queued: false,
              message:
                'Pending frame removal promoted. Raw image variants remain active.',
            };
          } else {
            lockedImage.frameRenderStatus = FrameRenderStatus.NONE;
            response = {
              imageId,
              frameId: lockedImage.frameId,
              frameRenderStatus: lockedImage.frameRenderStatus,
              pendingFrameId: lockedImage.pendingFrameId,
              activeRenderRevision: lockedImage.activeRenderRevision,
              queued: false,
              message: 'No pending frame change was available to promote.',
            };
          }
        } else if (
          this.hasActiveFrameRenderState(lockedImage) &&
          lockedImage.frameId
        ) {
          const nextRevision = this.getNextRenderRevision(
            lockedImage.activeRenderRevision,
          );
          const renderSource =
            await this.frameAssetsService.getFrameRenderSourceInfo(
              lockedImage.frameId,
            );

          newSnapshotKey = this.buildFrameSnapshotKey(
            imageId,
            nextRevision,
            renderSource.assetType,
          );
          await this.storageService.copyObject(
            renderSource.storageKey,
            newSnapshotKey,
          );
          await this.storageQuotaService.addVariantUsage(
            lockedImage.userId,
            Number(renderSource.fileSize),
            manager,
          );

          oldSnapshotKey = lockedImage.frameSnapshotKey;
          oldSnapshotSize = Number(lockedImage.frameSnapshotSize ?? 0);
          lockedImage.frameSnapshotKey = newSnapshotKey;
          lockedImage.frameSnapshotSize = renderSource.fileSize;
          lockedImage.frameSnapshotAssetType = renderSource.assetType;
          lockedImage.framePlacement = snapshotFrameRenderPlacement(
            renderSource.placement,
          );
          lockedImage.activeRenderRevision = nextRevision;
          lockedImage.frameRenderStatus = FrameRenderStatus.PROCESSING;
          lockedImage.processingStatus = ProcessingStatus.PROCESSING;
          lockedImage.processingError = null;

          response = {
            imageId,
            frameId: lockedImage.frameId,
            frameRenderStatus: lockedImage.frameRenderStatus,
            pendingFrameId: lockedImage.pendingFrameId,
            activeRenderRevision: lockedImage.activeRenderRevision,
            queued: true,
            message:
              'Current frame snapshot refreshed and render refresh queued.',
          };
        } else {
          response = {
            imageId,
            frameId: lockedImage.frameId,
            frameRenderStatus: lockedImage.frameRenderStatus,
            pendingFrameId: lockedImage.pendingFrameId,
            activeRenderRevision: lockedImage.activeRenderRevision,
            queued: false,
            message: 'Image has no active frame render to refresh.',
          };
        }
        await manager.getRepository(Image).save(lockedImage);
      });
    } catch (error) {
      if (newSnapshotKey) {
        await this.deleteSnapshotQuietly(newSnapshotKey);
      }
      throw error;
    }

    const imageForQueue = await this.imageRepository.findOne({
      where: { id: imageId },
    });

    if (oldSnapshotKey) {
      await this.deleteSnapshotAndReclaimQuota(
        imageForQueue?.userId,
        oldSnapshotKey,
        oldSnapshotSize,
      );
    }

    if (imageForQueue) {
      await this.imagesCacheService.invalidateImage(imageForQueue.id);
      await this.imagesCacheService.invalidateUserLists(imageForQueue.userId);
      if (response.queued) {
        await this.queuePrewarmActiveRenderVariants(imageForQueue);
      }
    }

    return response;
  }

  async resolveThumbnailUrl(
    image: Image,
    rawVariants: ImageVariant[],
  ): Promise<string | null> {
    const rawThumbnail =
      rawVariants.find(
        (variant) => variant.variantType === VariantType.THUMBNAIL,
      ) ?? null;

    if (!this.canServeRenderedVariants(image)) {
      return rawThumbnail
        ? this.storageService.generatePresignedGetUrl(rawThumbnail.storageKey)
        : null;
    }

    const renderVariant = await this.renderVariantService.getRenderVariant(
      image.id,
      image.activeRenderRevision,
      VariantType.THUMBNAIL,
    );
    if (renderVariant) {
      return this.storageService.generatePresignedGetUrl(
        renderVariant.storageKey,
      );
    }

    return rawThumbnail
      ? this.storageService.generatePresignedGetUrl(rawThumbnail.storageKey)
      : null;
  }

  async resolveVariantResponses(
    image: Image,
    rawVariants: ImageVariant[],
  ): Promise<
    Record<
      string,
      {
        cdnUrl: string;
        width: number;
        height: number;
        fileSize: number;
        mimeType: string;
      }
    >
  > {
    let hasMissingRender = false;

    const entries = await Promise.all(
      rawVariants.map(async (variant) => {
        if (
          !this.canServeRenderedVariants(image) ||
          variant.variantType === VariantType.ORIGINAL ||
          !this.getRenderableVariantTypes(image.is360).includes(
            variant.variantType,
          )
        ) {
          return [
            variant.variantType,
            {
              cdnUrl: await this.storageService.generatePresignedGetUrl(
                variant.storageKey,
              ),
              width: variant.width,
              height: variant.height,
              fileSize: Number(variant.fileSize),
              mimeType: variant.mimeType,
            },
          ] as const;
        }

        const renderVariant = await this.renderVariantService.getRenderVariant(
          image.id,
          image.activeRenderRevision,
          variant.variantType,
        );

        if (!renderVariant) {
          hasMissingRender = true;
          return [
            variant.variantType,
            {
              cdnUrl: await this.storageService.generatePresignedGetUrl(
                variant.storageKey,
              ),
              width: variant.width,
              height: variant.height,
              fileSize: Number(variant.fileSize),
              mimeType: variant.mimeType,
            },
          ] as const;
        }

        return [
          variant.variantType,
          {
            cdnUrl: await this.storageService.generatePresignedGetUrl(
              renderVariant.storageKey,
            ),
            width: renderVariant.width,
            height: renderVariant.height,
            fileSize: Number(renderVariant.fileSize),
            mimeType: renderVariant.mimeType,
          },
        ] as const;
      }),
    );

    if (hasMissingRender) {
      void this.queuePrewarmActiveRenderVariants(image).catch((err) =>
        this.logger.warn(
          `Failed to queue prewarm for image ${image.id}: ${
            err instanceof Error ? err.message : 'unknown error'
          }`,
        ),
      );
    }

    return Object.fromEntries(entries);
  }

  async resolveFinalRender(image: Image): Promise<{
    cdnUrl: string;
    width: number;
    height: number;
    revision: number;
  } | null> {
    if (!this.canServeRenderedVariants(image)) {
      return null;
    }

    const renderVariant =
      (await this.renderVariantService.getRenderVariant(
        image.id,
        image.activeRenderRevision,
        VariantType.LARGE,
      )) ??
      (await this.renderVariantService.getRenderVariant(
        image.id,
        image.activeRenderRevision,
        VariantType.MEDIUM,
      ));

    if (!renderVariant) {
      void this.queuePrewarmActiveRenderVariants(image).catch((err) =>
        this.logger.warn(
          `Failed to queue final render prewarm for image ${image.id}: ${
            err instanceof Error ? err.message : 'unknown error'
          }`,
        ),
      );
      return null;
    }

    return {
      cdnUrl: await this.storageService.generatePresignedGetUrl(
        renderVariant.storageKey,
      ),
      width: renderVariant.width,
      height: renderVariant.height,
      revision: image.activeRenderRevision,
    };
  }

  async prewarmActiveRenderVariants(imageId: string): Promise<void> {
    const image = await this.imageRepository.findOne({
      where: { id: imageId },
    });
    if (!image || !this.hasActiveFrameRenderState(image)) {
      return;
    }

    const renderableTypes = this.getRenderableVariantTypes(image.is360);
    const originalBuffer = await this.storageService.getObjectBuffer(
      image.storageKey,
    );
    const snapshotBuffer = await this.storageService.getObjectBuffer(
      image.frameSnapshotKey!,
    );
    const orientedDimensions = resolveAutoOrientedDimensions(
      await sharp(originalBuffer).metadata(),
    );
    const context: RenderSourceContext = {
      renderMode: this.resolveRenderModeFromImage(image),
      frameSnapshotAssetType: this.resolveFrameSnapshotAssetType(image),
      originalBuffer,
      snapshotBuffer,
      canvas: await this.resolveSnapshotCanvas(image, snapshotBuffer),
      placement: await this.resolveRenderPlacement(image),
      sourceWidth: orientedDimensions.width,
      sourceHeight: orientedDimensions.height,
      transform: this.getRenderTransform(image),
    };

    for (const variantType of renderableTypes) {
      await this.ensureRenderVariant(image, variantType, context);
    }
  }

  async queuePrewarmActiveRenderVariants(image: Image | null): Promise<void> {
    if (!image || !this.hasActiveFrameRenderState(image)) {
      return;
    }

    const jobData: ImageProcessingJobData = {
      imageId: image.id,
      userId: image.userId,
      requestedAt: new Date().toISOString(),
      renderRevision: image.activeRenderRevision,
    };

    await this.processingQueue.add(
      ImageProcessingJobType.PREWARM_FRAME_RENDER,
      jobData,
      {
        jobId: `frame-render-${image.id}-rev-${image.activeRenderRevision}`,
        priority: 3,
      },
    );
  }

  private async ensureRenderVariant(
    image: Image,
    variantType: VariantType,
    context?: RenderSourceContext,
  ): Promise<ImageRenderVariant | null> {
    const existing = await this.renderVariantService.getRenderVariant(
      image.id,
      image.activeRenderRevision,
      variantType,
    );

    if (existing) {
      return existing;
    }

    const lockKey = this.getRenderLockKey(
      image.id,
      image.activeRenderRevision,
      variantType,
    );
    const lockToken = randomUUID();

    const hasLock = await this.redisService.setIfNotExists(
      lockKey,
      lockToken,
      15,
    );
    if (!hasLock) {
      return null;
    }

    try {
      const rechecked = await this.renderVariantService.getRenderVariant(
        image.id,
        image.activeRenderRevision,
        variantType,
      );
      if (rechecked) {
        return rechecked;
      }

      const created = await this.generateRenderVariant(
        image,
        variantType,
        context,
      );
      return created;
    } finally {
      await this.redisService.deleteIfValueMatches(lockKey, lockToken);
    }
  }

  private async generateRenderVariant(
    image: Image,
    variantType: VariantType,
    context?: RenderSourceContext,
  ): Promise<ImageRenderVariant | null> {
    const config = this.getVariantConfig(variantType, image.is360);
    if (!config || !image.frameSnapshotKey) {
      return null;
    }

    const renderContext = await this.resolveRenderSourceContext(image, context);
    const { buffer, width, height } = await this.composeVariant(
      renderContext,
      config,
    );
    const renderKey = this.buildRenderStorageKey(
      image.id,
      image.activeRenderRevision,
      variantType,
    );

    await this.storageService.putObject(renderKey, buffer, 'image/jpeg');
    const { variant, created } =
      await this.renderVariantService.createRenderVariant({
        imageId: image.id,
        renderRevision: image.activeRenderRevision,
        variantType,
        storageKey: renderKey,
        mimeType: 'image/jpeg',
        fileSize: buffer.length,
        width,
        height,
        quality: config.quality,
      });

    if (created) {
      await this.storageQuotaService.addVariantUsage(
        image.userId,
        buffer.length,
      );
    }

    return variant;
  }

  private async composeVariant(
    context: RenderSourceContext,
    config: VariantConfig,
  ): Promise<{ buffer: Buffer; width: number; height: number }> {
    if (context.renderMode === 'scene') {
      return this.composeSceneVariant(context, config);
    }

    return this.composeOverlayVariant(context, config);
  }

  private async resolveRenderSourceContext(
    image: Image,
    context?: RenderSourceContext,
  ): Promise<RenderSourceContext> {
    if (context) {
      return context;
    }

    const originalBuffer = await this.storageService.getObjectBuffer(
      image.storageKey,
    );
    const snapshotBuffer = await this.storageService.getObjectBuffer(
      image.frameSnapshotKey!,
    );
    const orientedDimensions = resolveAutoOrientedDimensions(
      await sharp(originalBuffer).metadata(),
    );

    return {
      renderMode: this.resolveRenderModeFromImage(image),
      frameSnapshotAssetType: this.resolveFrameSnapshotAssetType(image),
      originalBuffer,
      snapshotBuffer,
      canvas: await this.resolveSnapshotCanvas(image, snapshotBuffer),
      placement: await this.resolveRenderPlacement(image),
      sourceWidth: orientedDimensions.width,
      sourceHeight: orientedDimensions.height,
      transform: this.getRenderTransform(image),
    };
  }

  private getVariantConfig(
    variantType: VariantType,
    is360: boolean,
  ): VariantConfig | null {
    if (variantType === VariantType.PANORAMIC_PREVIEW && !is360) {
      return null;
    }

    const variants = this.configService.get<Record<string, VariantConfig>>(
      'image.variants',
      {},
    );

    return variants[variantType] ?? null;
  }

  private getRenderableVariantTypes(is360: boolean): VariantType[] {
    const variants = [
      VariantType.THUMBNAIL,
      VariantType.MEDIUM,
      VariantType.LARGE,
    ];

    if (is360) {
      variants.push(VariantType.PANORAMIC_PREVIEW);
    }

    return variants;
  }

  private canServeRenderedVariants(image: Image): boolean {
    return (
      this.hasActiveFrameRenderState(image) &&
      [FrameRenderStatus.READY, FrameRenderStatus.PENDING_REPROCESS].includes(
        image.frameRenderStatus,
      )
    );
  }

  private hasActiveFrameRenderState(image: Image): boolean {
    return (
      Boolean(image.frameId) &&
      Boolean(image.frameSnapshotKey) &&
      image.activeRenderRevision > 0
    );
  }

  private async resolveRenderPlacement(
    image: Image,
  ): Promise<FrameRenderPlacement> {
    if (image.framePlacement) {
      if (isFrameScenePlacement(image.framePlacement)) {
        return snapshotFrameRenderPlacement(image.framePlacement);
      }

      if (!isDefaultFrameImagePlacement(image.framePlacement)) {
        return snapshotFrameImagePlacement(image.framePlacement);
      }
    }

    const fallbackPlacement = await this.resolveCurrentFramePlacement(image);
    if (fallbackPlacement) {
      return fallbackPlacement;
    }

    return snapshotFrameImagePlacement(
      (image.framePlacement as FrameImagePlacement | null) ??
        DEFAULT_FRAME_IMAGE_PLACEMENT,
    );
  }

  private async resolveImagePlacement(
    image: Image,
  ): Promise<FrameImagePlacement> {
    const placement = await this.resolveRenderPlacement(image);
    if (isFrameScenePlacement(placement)) {
      throw new BusinessException(
        'FRAME_IMAGE_PLACEMENT_REQUIRED',
        'A rectangular frame placement is required for overlay rendering.',
        HttpStatus.CONFLICT,
      );
    }

    return placement;
  }

  private async resolveCurrentFramePlacement(
    image: Pick<Image, 'id' | 'frameId'>,
  ): Promise<FrameRenderPlacement | null> {
    if (!image.frameId) {
      return null;
    }

    try {
      const renderSource =
        await this.frameAssetsService.getFrameRenderSourceInfo(image.frameId);

      if (
        !isFrameScenePlacement(renderSource.placement) &&
        isDefaultFrameImagePlacement(renderSource.placement)
      ) {
        return null;
      }

      return snapshotFrameRenderPlacement(renderSource.placement);
    } catch (error) {
      this.logger.warn(
        `Failed to resolve current frame placement for image ${image.id}: ${
          error instanceof Error ? error.message : 'unknown error'
        }`,
      );
      return null;
    }
  }

  private getRenderTransform(image: Image): RenderTransformV1 {
    return resolveRenderTransform(image.renderTransform);
  }

  private buildFrameSnapshotKey(
    imageId: string,
    revision: number,
    assetType: FrameAssetType,
  ): string {
    const extension =
      assetType === FrameAssetType.SCENE_BASE_PNG ? 'png' : 'svg';
    return `image-frame-snapshots/${imageId}/rev-${revision}/frame.${extension}`;
  }

  private buildRenderStorageKey(
    imageId: string,
    revision: number,
    variantType: VariantType,
  ): string {
    return `image-renders/${imageId}/rev-${revision}/${variantType}.jpg`;
  }

  private getNextRenderRevision(activeRevision: number): number {
    return Math.max(1, activeRevision + 1);
  }

  private getRenderLockKey(
    imageId: string,
    revision: number,
    variantType: VariantType,
  ): string {
    return `image:render:lock:${imageId}:rev:${revision}:${variantType}`;
  }

  private async deleteSnapshotAndReclaimQuota(
    userId: string | undefined,
    snapshotKey: string,
    snapshotSize: number,
  ): Promise<void> {
    try {
      await this.storageService.deleteObject(snapshotKey);
      if (userId && snapshotSize > 0) {
        await this.storageQuotaService.reclaimVariantUsage(
          userId,
          snapshotSize,
        );
      }
    } catch (error) {
      this.logger.warn(
        `Failed to delete frame snapshot ${snapshotKey}: ${
          error instanceof Error ? error.message : 'unknown error'
        }`,
      );
    }
  }

  private async deleteSnapshotQuietly(snapshotKey: string): Promise<void> {
    try {
      await this.storageService.deleteObject(snapshotKey);
    } catch (error) {
      this.logger.warn(
        `Failed to delete temporary frame snapshot ${snapshotKey}: ${
          error instanceof Error ? error.message : 'unknown error'
        }`,
      );
    }
  }

  private async sleep(ms: number): Promise<void> {
    await new Promise((resolve) => setTimeout(resolve, ms));
  }

  private async composeOverlayVariant(
    context: RenderSourceContext,
    config: VariantConfig,
  ): Promise<{ buffer: Buffer; width: number; height: number }> {
    const output = resolveFramedRenderDimensions(
      context.canvas,
      config.maxWidth,
      config.maxHeight,
    );
    const placement = resolvePlacementRect(
      output,
      context.placement as FrameImagePlacement,
    );
    const placedImageBuffer = await this.renderPhotoWindowLayer(
      context.originalBuffer,
      placement.width,
      placement.height,
      context.sourceWidth,
      context.sourceHeight,
      context.transform,
    );

    const baseCanvasBuffer = await sharp({
      create: {
        width: output.width,
        height: output.height,
        channels: 4,
        background: { r: 0, g: 0, b: 0, alpha: 0 },
      },
    })
      .composite([
        {
          input: placedImageBuffer,
          top: placement.top,
          left: placement.left,
        },
      ])
      .png()
      .toBuffer();

    const overlayBuffer = await sharp(context.snapshotBuffer, { density: 300 })
      .resize(output.width, output.height, {
        fit: sharp.fit.contain,
        withoutEnlargement: false,
        background: { r: 0, g: 0, b: 0, alpha: 0 },
      })
      .png()
      .toBuffer();
    const overlayMetadata = await sharp(overlayBuffer).metadata();
    const overlayComposite = resolveCompositeCrop({
      overlayLeft: 0,
      overlayTop: 0,
      overlayWidth: overlayMetadata.width ?? output.width,
      overlayHeight: overlayMetadata.height ?? output.height,
      canvasWidth: output.width,
      canvasHeight: output.height,
    });
    const croppedOverlayBuffer = overlayComposite
      ? await sharp(overlayBuffer)
          .extract({
            left: overlayComposite.inputLeft,
            top: overlayComposite.inputTop,
            width: overlayComposite.inputWidth,
            height: overlayComposite.inputHeight,
          })
          .png()
          .toBuffer()
      : null;

    const compositedBuffer = await sharp(baseCanvasBuffer)
      .composite(
        croppedOverlayBuffer && overlayComposite
          ? [
              {
                input: croppedOverlayBuffer,
                top: overlayComposite.targetTop,
                left: overlayComposite.targetLeft,
              },
            ]
          : [],
      )
      .flatten({ background: '#ffffff' })
      .jpeg({
        quality: config.quality,
        progressive: true,
        mozjpeg: true,
      })
      .toBuffer();

    return {
      buffer: compositedBuffer,
      width: output.width,
      height: output.height,
    };
  }

  private async composeSceneVariant(
    context: RenderSourceContext,
    config: VariantConfig,
  ): Promise<{ buffer: Buffer; width: number; height: number }> {
    const placement = context.placement as FrameScenePlacement;
    const output = resolveFramedRenderDimensions(
      context.canvas,
      config.maxWidth,
      config.maxHeight,
    );
    const baseSceneBuffer = await sharp(context.snapshotBuffer)
      .resize(output.width, output.height, {
        fit: sharp.fit.fill,
        withoutEnlargement: false,
      })
      .png()
      .toBuffer();
    const scaled = this.scaleScenePlacement(
      placement,
      output.width,
      output.height,
    );
    const planeWidth = Math.max(
      1,
      Math.round(
        Math.max(
          this.pointDistance(scaled.topLeft, scaled.topRight),
          this.pointDistance(scaled.bottomLeft, scaled.bottomRight),
        ),
      ),
    );
    const planeHeight = Math.max(
      1,
      Math.round(
        Math.max(
          this.pointDistance(scaled.topLeft, scaled.bottomLeft),
          this.pointDistance(scaled.topRight, scaled.bottomRight),
        ),
      ),
    );
    const photoPlaneBuffer = await this.renderPhotoWindowLayer(
      context.originalBuffer,
      planeWidth,
      planeHeight,
      context.sourceWidth,
      context.sourceHeight,
      context.transform,
    );

    const horizontal = {
      x: scaled.topRight.x - scaled.topLeft.x,
      y: scaled.topRight.y - scaled.topLeft.y,
    };
    const vertical = {
      x: scaled.bottomLeft.x - scaled.topLeft.x,
      y: scaled.bottomLeft.y - scaled.topLeft.y,
    };
    const clipPoints = [
      `${this.formatSvgNumber(scaled.topLeft.x)},${this.formatSvgNumber(scaled.topLeft.y)}`,
      `${this.formatSvgNumber(scaled.topRight.x)},${this.formatSvgNumber(scaled.topRight.y)}`,
      `${this.formatSvgNumber(scaled.bottomRight.x)},${this.formatSvgNumber(scaled.bottomRight.y)}`,
      `${this.formatSvgNumber(scaled.bottomLeft.x)},${this.formatSvgNumber(scaled.bottomLeft.y)}`,
    ].join(' ');
    const composedSvg = [
      `<svg xmlns="http://www.w3.org/2000/svg" width="${output.width}" height="${output.height}" viewBox="0 0 ${output.width} ${output.height}">`,
      '  <defs>',
      '    <clipPath id="scene-plane-clip">',
      `      <polygon points="${clipPoints}" />`,
      '    </clipPath>',
      '  </defs>',
      `  <image x="0" y="0" width="${output.width}" height="${output.height}" preserveAspectRatio="none" href="${this.toDataUri(baseSceneBuffer, 'image/png')}" />`,
      '  <g clip-path="url(#scene-plane-clip)">',
      `    <image x="0" y="0" width="${planeWidth}" height="${planeHeight}" preserveAspectRatio="none" transform="matrix(${this.formatSvgNumber(horizontal.x / planeWidth)} ${this.formatSvgNumber(horizontal.y / planeWidth)} ${this.formatSvgNumber(vertical.x / planeHeight)} ${this.formatSvgNumber(vertical.y / planeHeight)} ${this.formatSvgNumber(scaled.topLeft.x)} ${this.formatSvgNumber(scaled.topLeft.y)})" href="${this.toDataUri(photoPlaneBuffer, 'image/png')}" />`,
      '  </g>',
      '</svg>',
    ].join('\n');

    const compositedBuffer = await sharp(Buffer.from(composedSvg, 'utf8'), {
      density: 300,
    })
      .resize(output.width, output.height, {
        fit: sharp.fit.fill,
        withoutEnlargement: false,
      })
      .flatten({ background: '#ffffff' })
      .jpeg({
        quality: config.quality,
        progressive: true,
        mozjpeg: true,
      })
      .toBuffer();

    return {
      buffer: compositedBuffer,
      width: output.width,
      height: output.height,
    };
  }

  private async renderPhotoWindowLayer(
    originalBuffer: Buffer,
    canvasWidth: number,
    canvasHeight: number,
    sourceWidth: number,
    sourceHeight: number,
    transform: RenderTransformV1,
  ): Promise<Buffer> {
    const transformedPlacement = resolveTransformPlacement({
      sourceWidth,
      sourceHeight,
      windowWidth: canvasWidth,
      windowHeight: canvasHeight,
      transform,
    });
    const rotatedImageBuffer = await sharp(originalBuffer)
      .rotate()
      .resize({
        width: transformedPlacement.scaledSourceWidth,
        height: transformedPlacement.scaledSourceHeight,
        fit: sharp.fit.fill,
        withoutEnlargement: false,
      })
      .rotate(transformedPlacement.transform.rotation, {
        background: { r: 0, g: 0, b: 0, alpha: 0 },
      })
      .png()
      .toBuffer();
    const rotatedImageMetadata = await sharp(rotatedImageBuffer).metadata();
    const placedImageComposite = resolveCompositeCrop({
      overlayLeft: transformedPlacement.left,
      overlayTop: transformedPlacement.top,
      overlayWidth:
        rotatedImageMetadata.width ??
        Math.max(1, Math.ceil(transformedPlacement.rotatedWidth)),
      overlayHeight:
        rotatedImageMetadata.height ??
        Math.max(1, Math.ceil(transformedPlacement.rotatedHeight)),
      canvasWidth,
      canvasHeight,
    });
    const croppedPlacedImageBuffer = placedImageComposite
      ? await sharp(rotatedImageBuffer)
          .extract({
            left: placedImageComposite.inputLeft,
            top: placedImageComposite.inputTop,
            width: placedImageComposite.inputWidth,
            height: placedImageComposite.inputHeight,
          })
          .png()
          .toBuffer()
      : null;

    return sharp({
      create: {
        width: canvasWidth,
        height: canvasHeight,
        channels: 4,
        background: { r: 0, g: 0, b: 0, alpha: 0 },
      },
    })
      .composite(
        croppedPlacedImageBuffer && placedImageComposite
          ? [
              {
                input: croppedPlacedImageBuffer,
                top: placedImageComposite.targetTop,
                left: placedImageComposite.targetLeft,
              },
            ]
          : [],
      )
      .png()
      .toBuffer();
  }

  private async resolveSnapshotCanvas(
    image: Image,
    snapshotBuffer: Buffer,
  ): Promise<SvgCanvasDimensions> {
    const assetType = this.resolveFrameSnapshotAssetType(image);
    if (assetType === FrameAssetType.SCENE_BASE_PNG) {
      const metadata = await sharp(snapshotBuffer).metadata();
      return {
        width: metadata.width ?? image.width ?? 1,
        height: metadata.height ?? image.height ?? 1,
      };
    }

    return extractSvgCanvasDimensions(snapshotBuffer);
  }

  private resolveFrameSnapshotAssetType(
    image: Pick<Image, 'frameSnapshotAssetType' | 'frameSnapshotKey'>,
  ): FrameAssetType {
    if (image.frameSnapshotAssetType) {
      return image.frameSnapshotAssetType;
    }

    return image.frameSnapshotKey?.toLowerCase().endsWith('.png')
      ? FrameAssetType.SCENE_BASE_PNG
      : FrameAssetType.SVG;
  }

  private resolveRenderModeFromImage(image: Image): 'overlay' | 'scene' {
    if (
      this.resolveFrameSnapshotAssetType(image) ===
        FrameAssetType.SCENE_BASE_PNG ||
      isFrameScenePlacement(image.framePlacement)
    ) {
      return 'scene';
    }

    return 'overlay';
  }

  private shouldRefreshCurrentPlacement(
    placement: FrameRenderPlacement | null,
  ): boolean {
    if (!placement) {
      return true;
    }

    return (
      !isFrameScenePlacement(placement) &&
      isDefaultFrameImagePlacement(placement)
    );
  }

  private scaleScenePlacement(
    placement: FrameScenePlacement,
    width: number,
    height: number,
  ): Record<
    'topLeft' | 'topRight' | 'bottomRight' | 'bottomLeft',
    { x: number; y: number }
  > {
    return {
      topLeft: {
        x: placement.corners.topLeft.x * width,
        y: placement.corners.topLeft.y * height,
      },
      topRight: {
        x: placement.corners.topRight.x * width,
        y: placement.corners.topRight.y * height,
      },
      bottomRight: {
        x: placement.corners.bottomRight.x * width,
        y: placement.corners.bottomRight.y * height,
      },
      bottomLeft: {
        x: placement.corners.bottomLeft.x * width,
        y: placement.corners.bottomLeft.y * height,
      },
    };
  }

  private pointDistance(
    left: { x: number; y: number },
    right: { x: number; y: number },
  ): number {
    return Math.hypot(left.x - right.x, left.y - right.y);
  }

  private toDataUri(buffer: Buffer, mimeType: string): string {
    return `data:${mimeType};base64,${buffer.toString('base64')}`;
  }

  private formatSvgNumber(value: number): string {
    if (Number.isInteger(value)) {
      return String(value);
    }

    return value.toFixed(3).replace(/\.?0+$/, '');
  }
}
