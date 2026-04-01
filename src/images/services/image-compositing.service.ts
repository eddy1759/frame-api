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
import { FrameAssetsService } from '../../frames/services/frame-assets.service';
import {
  DEFAULT_FRAME_IMAGE_PLACEMENT,
  FrameImagePlacement,
  snapshotFrameImagePlacement,
} from '../../frames/utils/frame-metadata.util';
import {
  extractSvgCanvasDimensions,
  SvgCanvasDimensions,
} from '../../frames/utils/svg-canvas.util';
import { Image } from '../entities/image.entity';
import { ImageRenderVariant } from '../entities/image-render-variant.entity';
import { ImageVariant } from '../entities/image-variant.entity';
import { FrameRenderStatus, VariantType } from '../types/image.types';
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
  framePlacement: FrameImagePlacement | null;
  renderTransform: RenderTransformV1 | null;
  pendingFrameId: string | null;
  pendingFrameSnapshotKey: string | null;
  pendingFrameSnapshotSize: number | null;
  pendingFramePlacement: FrameImagePlacement | null;
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
  originalBuffer: Buffer;
  snapshotBuffer: Buffer;
  frameCanvas: SvgCanvasDimensions;
  placement: FrameImagePlacement;
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
        framePlacement: null,
        renderTransform: null,
        pendingFrameId: null,
        pendingFrameSnapshotKey: null,
        pendingFrameSnapshotSize: null,
        pendingFramePlacement: null,
        pendingRenderTransform: null,
        frameRenderStatus: FrameRenderStatus.NONE,
        activeRenderRevision: 0,
      };
    }

    const svgAsset = await this.frameAssetsService.getSvgAssetInfo(frameId);
    const frameSnapshotKey = this.buildFrameSnapshotKey(imageId, 1);
    await this.storageService.copyObject(svgAsset.storageKey, frameSnapshotKey);

    return {
      frameId,
      frameSnapshotKey,
      frameSnapshotSize: svgAsset.fileSize,
      framePlacement: snapshotFrameImagePlacement(svgAsset.imagePlacement),
      renderTransform: null,
      pendingFrameId: null,
      pendingFrameSnapshotKey: null,
      pendingFrameSnapshotSize: null,
      pendingFramePlacement: null,
      pendingRenderTransform: null,
      frameRenderStatus: FrameRenderStatus.READY,
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

    const svgAsset = await this.frameAssetsService.getSvgAssetInfo(nextFrameId);
    const nextRevision = this.getNextRenderRevision(image.activeRenderRevision);
    const pendingSnapshotKey = this.buildFrameSnapshotKey(
      image.id,
      nextRevision,
    );
    await this.storageService.copyObject(
      svgAsset.storageKey,
      pendingSnapshotKey,
    );

    return {
      updateData: {
        pendingFrameId: nextFrameId,
        pendingFrameSnapshotKey: pendingSnapshotKey,
        pendingFrameSnapshotSize: svgAsset.fileSize,
        pendingFramePlacement: snapshotFrameImagePlacement(
          svgAsset.imagePlacement,
        ),
        pendingRenderTransform: null,
        frameRenderStatus: FrameRenderStatus.PENDING_REPROCESS,
      },
      quotaAddBytes: svgAsset.fileSize,
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
    frameRenderStatus: FrameRenderStatus;
    pendingFrameId: string | null;
    message: string;
  }> {
    let oldSnapshotKey: string | null = null;
    let oldSnapshotSize = 0;
    let newSnapshotKey: string | null = null;
    let response: {
      imageId: string;
      frameRenderStatus: FrameRenderStatus;
      pendingFrameId: string | null;
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
            lockedImage.framePlacement = lockedImage.pendingFramePlacement;
            lockedImage.renderTransform = lockedImage.pendingRenderTransform;
            lockedImage.pendingFrameId = null;
            lockedImage.pendingFrameSnapshotKey = null;
            lockedImage.pendingFrameSnapshotSize = null;
            lockedImage.pendingFramePlacement = null;
            lockedImage.pendingRenderTransform = null;
            lockedImage.frameRenderStatus = FrameRenderStatus.READY;
            lockedImage.activeRenderRevision = this.getNextRenderRevision(
              lockedImage.activeRenderRevision,
            );

            response = {
              imageId,
              frameRenderStatus: lockedImage.frameRenderStatus,
              pendingFrameId: lockedImage.pendingFrameId,
              message:
                'Pending frame change promoted and render refresh queued.',
            };
          } else if (
            lockedImage.pendingRenderTransform &&
            lockedImage.frameId
          ) {
            lockedImage.renderTransform = lockedImage.pendingRenderTransform;
            lockedImage.pendingRenderTransform = null;
            lockedImage.frameRenderStatus = FrameRenderStatus.READY;
            lockedImage.activeRenderRevision = this.getNextRenderRevision(
              lockedImage.activeRenderRevision,
            );

            response = {
              imageId,
              frameRenderStatus: lockedImage.frameRenderStatus,
              pendingFrameId: lockedImage.pendingFrameId,
              message:
                'Pending transform change promoted and render refresh queued.',
            };
          } else if (lockedImage.frameId) {
            oldSnapshotKey = lockedImage.frameSnapshotKey;
            oldSnapshotSize = Number(lockedImage.frameSnapshotSize ?? 0);
            lockedImage.frameId = null;
            lockedImage.frameSnapshotKey = null;
            lockedImage.frameSnapshotSize = null;
            lockedImage.framePlacement = null;
            lockedImage.renderTransform = null;
            lockedImage.pendingFrameId = null;
            lockedImage.pendingFrameSnapshotKey = null;
            lockedImage.pendingFrameSnapshotSize = null;
            lockedImage.pendingFramePlacement = null;
            lockedImage.pendingRenderTransform = null;
            lockedImage.frameRenderStatus = FrameRenderStatus.NONE;
            lockedImage.activeRenderRevision = this.getNextRenderRevision(
              lockedImage.activeRenderRevision,
            );

            response = {
              imageId,
              frameRenderStatus: lockedImage.frameRenderStatus,
              pendingFrameId: lockedImage.pendingFrameId,
              message:
                'Pending frame removal promoted. Raw image variants remain active.',
            };
          } else {
            lockedImage.frameRenderStatus = FrameRenderStatus.NONE;
            response = {
              imageId,
              frameRenderStatus: lockedImage.frameRenderStatus,
              pendingFrameId: lockedImage.pendingFrameId,
              message: 'No pending frame change was available to promote.',
            };
          }
        } else if (
          this.canUseRenderedVariants(lockedImage) &&
          lockedImage.frameId
        ) {
          const nextRevision = this.getNextRenderRevision(
            lockedImage.activeRenderRevision,
          );
          const svgAsset = await this.frameAssetsService.getSvgAssetInfo(
            lockedImage.frameId,
          );

          newSnapshotKey = this.buildFrameSnapshotKey(imageId, nextRevision);
          await this.storageService.copyObject(
            svgAsset.storageKey,
            newSnapshotKey,
          );
          await this.storageQuotaService.addVariantUsage(
            lockedImage.userId,
            Number(svgAsset.fileSize),
            manager,
          );

          oldSnapshotKey = lockedImage.frameSnapshotKey;
          oldSnapshotSize = Number(lockedImage.frameSnapshotSize ?? 0);
          lockedImage.frameSnapshotKey = newSnapshotKey;
          lockedImage.frameSnapshotSize = svgAsset.fileSize;
          lockedImage.framePlacement = snapshotFrameImagePlacement(
            svgAsset.imagePlacement,
          );
          lockedImage.activeRenderRevision = nextRevision;
          lockedImage.frameRenderStatus = FrameRenderStatus.READY;

          response = {
            imageId,
            frameRenderStatus: lockedImage.frameRenderStatus,
            pendingFrameId: lockedImage.pendingFrameId,
            message:
              'Current frame snapshot refreshed and render refresh queued.',
          };
        } else {
          response = {
            imageId,
            frameRenderStatus: lockedImage.frameRenderStatus,
            pendingFrameId: lockedImage.pendingFrameId,
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
      await this.queuePrewarmActiveRenderVariants(imageForQueue);
    }

    return response!;
  }

  async resolveThumbnailUrl(
    image: Image,
    rawVariants: ImageVariant[],
  ): Promise<string | null> {
    const rawThumbnail =
      rawVariants.find(
        (variant) => variant.variantType === VariantType.THUMBNAIL,
      ) ?? null;

    if (!this.canUseRenderedVariants(image)) {
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
          !this.canUseRenderedVariants(image) ||
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

  async prewarmActiveRenderVariants(imageId: string): Promise<void> {
    const image = await this.imageRepository.findOne({
      where: { id: imageId },
    });
    if (!image || !this.canUseRenderedVariants(image)) {
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
      originalBuffer,
      snapshotBuffer,
      frameCanvas: extractSvgCanvasDimensions(snapshotBuffer),
      placement: this.getImagePlacement(image),
      sourceWidth: orientedDimensions.width,
      sourceHeight: orientedDimensions.height,
      transform: this.getRenderTransform(image),
    };

    for (const variantType of renderableTypes) {
      await this.ensureRenderVariant(image, variantType, context);
    }
  }

  async queuePrewarmActiveRenderVariants(image: Image | null): Promise<void> {
    if (!image || !this.canUseRenderedVariants(image)) {
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
    const output = resolveFramedRenderDimensions(
      context.frameCanvas,
      config.maxWidth,
      config.maxHeight,
    );
    const placement = resolvePlacementRect(output, context.placement);
    const transformedPlacement = resolveTransformPlacement({
      sourceWidth: context.sourceWidth,
      sourceHeight: context.sourceHeight,
      windowWidth: placement.width,
      windowHeight: placement.height,
      transform: context.transform,
    });
    const rotatedImageBuffer = await sharp(context.originalBuffer)
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
      canvasWidth: placement.width,
      canvasHeight: placement.height,
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
    const placedImageBuffer = await sharp({
      create: {
        width: placement.width,
        height: placement.height,
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

    // Materialize the photo layer first. Reusing the same Sharp pipeline for a
    // second composite call causes the earlier composite to be replaced, which
    // drops the image layer and leaves a blank window under the frame overlay.
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
      originalBuffer,
      snapshotBuffer,
      frameCanvas: extractSvgCanvasDimensions(snapshotBuffer),
      placement: this.getImagePlacement(image),
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

  private canUseRenderedVariants(image: Image): boolean {
    return (
      Boolean(image.frameId) &&
      Boolean(image.frameSnapshotKey) &&
      image.activeRenderRevision > 0 &&
      [FrameRenderStatus.READY, FrameRenderStatus.PENDING_REPROCESS].includes(
        image.frameRenderStatus,
      )
    );
  }

  private getImagePlacement(image: Image): FrameImagePlacement {
    return snapshotFrameImagePlacement(
      image.framePlacement ?? DEFAULT_FRAME_IMAGE_PLACEMENT,
    );
  }

  private getRenderTransform(image: Image): RenderTransformV1 {
    return resolveRenderTransform(image.renderTransform);
  }

  private buildFrameSnapshotKey(imageId: string, revision: number): string {
    return `image-frame-snapshots/${imageId}/rev-${revision}/frame.svg`;
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
}
