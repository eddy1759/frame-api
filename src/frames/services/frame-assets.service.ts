/* eslint-disable @typescript-eslint/no-unsafe-member-access */
/* eslint-disable @typescript-eslint/no-unsafe-argument */
import {
  BadRequestException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Frame } from '../entities/frame.entity';
import { FrameAsset } from '../entities/frame-asset.entity';
import { FrameAssetType } from '../entities/frame-asset-type.enum';
import { STORAGE_PORT, StoragePort } from '../../common/services';
import { FramesCacheService } from './frames-cache.service';
import {
  FrameImagePlacement,
  FrameRenderPlacement,
  FrameRenderMode,
  FrameTitleConfig,
  normalizeFrameMetadata,
  resolveFrameRenderMode,
  resolveFrameImagePlacement,
  resolveFrameScenePlacement,
  resolveFrameTitleConfig,
  snapshotFrameImagePlacement,
  snapshotFrameRenderPlacement,
} from '../utils/frame-metadata.util';
import {
  FrameCompositorService,
  RenderedFrameAssetSet,
  RenderedSceneAssetSet,
} from './frame-compositor.service';

const MAX_SVG_SIZE_BYTES = 5 * 1024 * 1024;

interface UploadedSvgFile {
  buffer: Buffer;
  size: number;
  mimetype?: string;
  originalname?: string;
}

export interface FrameSvgAssetInfo {
  frameId: string;
  storageKey: string;
  mimeType: string;
  fileSize: number;
  imagePlacement: FrameImagePlacement;
}

export interface FrameRenderSourceInfo {
  frameId: string;
  renderMode: FrameRenderMode;
  assetType: FrameAssetType;
  storageKey: string;
  mimeType: string;
  fileSize: number;
  placement: FrameRenderPlacement;
  canvas: {
    width: number;
    height: number;
  };
}

@Injectable()
export class FrameAssetsService {
  constructor(
    @InjectRepository(Frame)
    private readonly frameRepository: Repository<Frame>,
    @InjectRepository(FrameAsset)
    private readonly frameAssetRepository: Repository<FrameAsset>,
    @Inject(STORAGE_PORT)
    private readonly storageService: StoragePort,
    private readonly framesCacheService: FramesCacheService,
    private readonly frameCompositorService: FrameCompositorService,
  ) {}

  async uploadSvgAsset(
    frameId: string,
    file: UploadedSvgFile,
  ): Promise<{
    svgUrl: string;
    editorPreviewUrl: string;
    thumbnails: {
      small: string;
      medium: string;
      large: string;
    };
  }> {
    const frame = await this.frameRepository.findOne({
      where: { id: frameId },
    });

    if (!frame) {
      throw new NotFoundException({
        code: 'FRAME_NOT_FOUND',
        message: 'Frame with the specified ID does not exist.',
      });
    }

    if (!file || !file.buffer) {
      throw new BadRequestException({
        code: 'INVALID_SVG',
        message: 'An SVG file is required.',
      });
    }

    if (file.size > MAX_SVG_SIZE_BYTES) {
      throw new BadRequestException({
        code: 'SVG_TOO_LARGE',
        message: 'SVG file exceeds 5MB size limit.',
      });
    }

    const rawSvg = file.buffer.toString('utf8');
    const sanitizedSvg =
      this.frameCompositorService.sanitizeUploadedSvg(rawSvg);
    this.frameCompositorService.validateAspectRatio(
      sanitizedSvg,
      frame.width,
      frame.height,
    );
    const composedSvg = this.applyConfiguredTitleOverlay(frame, sanitizedSvg);

    const rendered =
      await this.frameCompositorService.renderFrameAssetSet(composedSvg);

    return this.persistRenderedAssets(frame, rendered);
  }

  async storeGeneratedSvgAsset(
    frameId: string,
    svg: string,
  ): Promise<{
    svgUrl: string;
    editorPreviewUrl: string;
    thumbnails: {
      small: string;
      medium: string;
      large: string;
    };
  }> {
    const frame = await this.frameRepository.findOne({
      where: { id: frameId },
    });

    if (!frame) {
      throw new NotFoundException({
        code: 'FRAME_NOT_FOUND',
        message: 'Frame with the specified ID does not exist.',
      });
    }

    const sanitizedSvg = this.frameCompositorService.sanitizeGeneratedSvg(svg);
    this.frameCompositorService.validateAspectRatio(
      sanitizedSvg,
      frame.width,
      frame.height,
    );
    const composedSvg = this.applyConfiguredTitleOverlay(frame, sanitizedSvg);
    const rendered =
      await this.frameCompositorService.renderFrameAssetSet(composedSvg);

    return this.persistRenderedAssets(frame, rendered);
  }

  async storeGeneratedSceneAsset(
    frameId: string,
    sceneBuffer: Buffer,
  ): Promise<{
    editorPreviewUrl: string;
    thumbnails: {
      small: string;
      medium: string;
      large: string;
    };
  }> {
    const frame = await this.frameRepository.findOne({
      where: { id: frameId },
    });

    if (!frame) {
      throw new NotFoundException({
        code: 'FRAME_NOT_FOUND',
        message: 'Frame with the specified ID does not exist.',
      });
    }

    const rendered = await this.frameCompositorService.renderSceneAssetSet(
      sceneBuffer,
      frame.width,
      frame.height,
    );

    return this.persistRenderedSceneAssets(frame, rendered);
  }

  async personalizeFrameAssets(
    sourceFrameId: string,
    targetFrameId: string,
    titleConfig: FrameTitleConfig,
  ): Promise<{
    svgUrl: string;
    editorPreviewUrl: string;
    thumbnails: {
      small: string;
      medium: string;
      large: string;
    };
  }> {
    const [sourceFrame, targetFrame, sourceAsset] = await Promise.all([
      this.frameRepository.findOne({
        where: { id: sourceFrameId },
        select: ['id'],
      }),
      this.frameRepository.findOne({
        where: { id: targetFrameId },
      }),
      this.frameAssetRepository.findOne({
        where: {
          frameId: sourceFrameId,
          type: FrameAssetType.SVG,
        },
      }),
    ]);

    if (!sourceFrame || !targetFrame) {
      throw new NotFoundException({
        code: 'FRAME_NOT_FOUND',
        message: 'Frame with the specified ID does not exist.',
      });
    }

    if (!sourceAsset) {
      throw new NotFoundException({
        code: 'FRAME_ASSET_NOT_FOUND',
        message: 'Frame SVG asset is not available.',
      });
    }

    const sourceSvg = (
      await this.storageService.getObjectBuffer(sourceAsset.storageKey)
    ).toString('utf8');

    this.frameCompositorService.validateAspectRatio(
      sourceSvg,
      targetFrame.width,
      targetFrame.height,
    );

    const personalizedSvg = this.applyConfiguredTitleOverlay(
      targetFrame,
      sourceSvg,
      titleConfig,
    );
    const rendered =
      await this.frameCompositorService.renderFrameAssetSet(personalizedSvg);

    return this.persistRenderedAssets(targetFrame, rendered);
  }

  async cloneFrameAssets(
    sourceFrameId: string,
    targetFrameId: string,
  ): Promise<void> {
    const [sourceFrame, targetFrame, assets] = await Promise.all([
      this.frameRepository.findOne({
        where: { id: sourceFrameId },
      }),
      this.frameRepository.findOne({
        where: { id: targetFrameId },
      }),
      this.frameAssetRepository.find({
        where: { frameId: sourceFrameId },
      }),
    ]);

    if (!sourceFrame || !targetFrame) {
      throw new NotFoundException({
        code: 'FRAME_NOT_FOUND',
        message: 'Frame with the specified ID does not exist.',
      });
    }

    if (assets.length === 0) {
      throw new NotFoundException({
        code: 'FRAME_ASSET_NOT_FOUND',
        message: 'Frame assets are not available for cloning.',
      });
    }

    await this.frameAssetRepository.delete({ frameId: targetFrameId });

    const clonedAssets: FrameAsset[] = [];
    for (const asset of assets) {
      const storageKey = this.resolveStorageKey(targetFrameId, asset.type);
      await this.storageService.copyObject(asset.storageKey, storageKey);
      clonedAssets.push(
        this.frameAssetRepository.create({
          frameId: targetFrameId,
          type: asset.type,
          storageKey,
          mimeType: asset.mimeType,
          fileSize: asset.fileSize,
          width: asset.width,
          height: asset.height,
        }),
      );
    }

    await this.frameAssetRepository.save(clonedAssets);

    this.applyPublicAssetUrls(targetFrame, clonedAssets);
    await this.frameRepository.save(targetFrame);
    await this.framesCacheService.invalidateFrame(
      targetFrame.id,
      targetFrame.slug,
    );
  }

  async deleteFrameAssets(frameId: string): Promise<void> {
    const [frame, assets] = await Promise.all([
      this.frameRepository.findOne({
        where: { id: frameId },
        select: ['id', 'slug'],
      }),
      this.frameAssetRepository.find({
        where: { frameId },
      }),
    ]);

    if (assets.length > 0) {
      await this.storageService.deleteObjects(
        assets.map((asset) => asset.storageKey),
      );
      await this.frameAssetRepository.delete({ frameId });
    }

    if (frame) {
      await this.framesCacheService.invalidateFrame(frame.id, frame.slug);
    }
  }

  async getSvgAssetInfo(frameId: string): Promise<FrameSvgAssetInfo> {
    const [frame, asset] = await Promise.all([
      this.frameRepository.findOne({
        where: { id: frameId },
        select: ['id', 'metadata'],
      }),
      this.frameAssetRepository.findOne({
        where: {
          frameId,
          type: FrameAssetType.SVG,
        },
      }),
    ]);

    if (!frame) {
      throw new NotFoundException({
        code: 'FRAME_NOT_FOUND',
        message: 'Frame with the specified ID does not exist.',
      });
    }

    if (!asset) {
      throw new NotFoundException({
        code: 'FRAME_ASSET_NOT_FOUND',
        message: 'Frame SVG asset is not available.',
      });
    }

    return {
      frameId: asset.frameId,
      storageKey: asset.storageKey,
      mimeType: asset.mimeType,
      fileSize: asset.fileSize,
      imagePlacement: snapshotFrameImagePlacement(
        resolveFrameImagePlacement(frame.metadata),
      ),
    };
  }

  async getFrameRenderSourceInfo(
    frameId: string,
  ): Promise<FrameRenderSourceInfo> {
    const frame = await this.frameRepository.findOne({
      where: { id: frameId },
      select: ['id', 'metadata', 'width', 'height'],
    });

    if (!frame) {
      throw new NotFoundException({
        code: 'FRAME_NOT_FOUND',
        message: 'Frame with the specified ID does not exist.',
      });
    }

    const renderMode = resolveFrameRenderMode(frame.metadata);
    if (renderMode === 'scene') {
      const placement = resolveFrameScenePlacement(frame.metadata);
      const asset = await this.frameAssetRepository.findOne({
        where: {
          frameId,
          type: FrameAssetType.SCENE_BASE_PNG,
        },
      });

      if (!asset || !placement) {
        throw new NotFoundException({
          code: 'FRAME_ASSET_NOT_FOUND',
          message: 'Scene frame render source is not available.',
        });
      }

      return {
        frameId: asset.frameId,
        renderMode,
        assetType: asset.type,
        storageKey: asset.storageKey,
        mimeType: asset.mimeType,
        fileSize: asset.fileSize,
        placement: snapshotFrameRenderPlacement(placement),
        canvas: {
          width: asset.width ?? frame.width,
          height: asset.height ?? frame.height,
        },
      };
    }

    const svgAsset = await this.getSvgAssetInfo(frameId);
    return {
      frameId: svgAsset.frameId,
      renderMode,
      assetType: FrameAssetType.SVG,
      storageKey: svgAsset.storageKey,
      mimeType: svgAsset.mimeType,
      fileSize: svgAsset.fileSize,
      placement: snapshotFrameRenderPlacement(svgAsset.imagePlacement),
      canvas: {
        width: frame.width,
        height: frame.height,
      },
    };
  }

  private applyConfiguredTitleOverlay(
    frame: Frame,
    svg: string,
    overrideTitleConfig?: FrameTitleConfig,
  ): string {
    const titleConfig = this.prepareFrameTitleConfig(
      frame,
      svg,
      overrideTitleConfig,
    );
    if (!titleConfig) {
      return svg;
    }

    return this.frameCompositorService.composeTitleOverlay(
      svg,
      titleConfig,
      frame.width,
      frame.height,
    );
  }

  private prepareFrameTitleConfig(
    frame: Frame,
    svg: string,
    overrideTitleConfig?: FrameTitleConfig,
  ): FrameTitleConfig | null {
    const originalMetadata = normalizeFrameMetadata(frame.metadata ?? {});
    const nextMetadata = normalizeFrameMetadata({
      ...originalMetadata,
      ...(overrideTitleConfig ? { titleConfig: overrideTitleConfig } : {}),
    });

    let imagePlacement = this.resolveConfiguredImagePlacement(nextMetadata);
    if (!imagePlacement) {
      const inferredPlacement =
        this.frameCompositorService.inferImagePlacementFromSvg(
          svg,
          frame.width,
          frame.height,
        );
      if (inferredPlacement) {
        nextMetadata.imagePlacement =
          snapshotFrameImagePlacement(inferredPlacement);
        imagePlacement = inferredPlacement;
      }
    }

    let titleConfig = resolveFrameTitleConfig(nextMetadata);
    if (titleConfig && imagePlacement) {
      titleConfig =
        this.frameCompositorService.normalizeTitleConfigForImagePlacement(
          titleConfig,
          imagePlacement,
        );
      nextMetadata.titleConfig = titleConfig;
    }

    if (JSON.stringify(originalMetadata) !== JSON.stringify(nextMetadata)) {
      frame.metadata = normalizeFrameMetadata(nextMetadata);
    }

    return titleConfig;
  }

  private resolveConfiguredImagePlacement(
    metadata: Frame['metadata'],
  ): FrameImagePlacement | null {
    if (
      !metadata ||
      typeof metadata !== 'object' ||
      metadata.imagePlacement === undefined
    ) {
      return null;
    }

    return resolveFrameImagePlacement(metadata);
  }

  private async persistRenderedAssets(
    frame: Frame,
    rendered: RenderedFrameAssetSet,
  ): Promise<{
    svgUrl: string;
    editorPreviewUrl: string;
    thumbnails: {
      small: string;
      medium: string;
      large: string;
    };
  }> {
    const originalUpload = await this.storageService.uploadBuffer(
      this.resolveStorageKey(frame.id, FrameAssetType.SVG),
      rendered.svgBuffer,
      'image/svg+xml',
    );

    const [smallUpload, mediumUpload, largeUpload, previewUpload] =
      await Promise.all([
        this.storageService.uploadBuffer(
          this.resolveStorageKey(frame.id, FrameAssetType.THUMBNAIL_SM),
          rendered.thumbnails.small.buffer,
          'image/png',
        ),
        this.storageService.uploadBuffer(
          this.resolveStorageKey(frame.id, FrameAssetType.THUMBNAIL_MD),
          rendered.thumbnails.medium.buffer,
          'image/png',
        ),
        this.storageService.uploadBuffer(
          this.resolveStorageKey(frame.id, FrameAssetType.THUMBNAIL_LG),
          rendered.thumbnails.large.buffer,
          'image/png',
        ),
        this.storageService.uploadBuffer(
          this.resolveStorageKey(frame.id, FrameAssetType.PREVIEW_PNG),
          rendered.preview.buffer,
          'image/png',
        ),
      ]);

    await this.frameAssetRepository.delete({ frameId: frame.id });

    const assets = this.frameAssetRepository.create([
      {
        frameId: frame.id,
        type: FrameAssetType.SVG,
        storageKey: originalUpload.key,
        mimeType: 'image/svg+xml',
        fileSize: originalUpload.size,
        width: Math.round(rendered.svgCanvas.width),
        height: Math.round(rendered.svgCanvas.height),
      },
      {
        frameId: frame.id,
        type: FrameAssetType.PREVIEW_PNG,
        storageKey: previewUpload.key,
        mimeType: 'image/png',
        fileSize: previewUpload.size,
        width: rendered.preview.width,
        height: rendered.preview.height,
      },
      {
        frameId: frame.id,
        type: FrameAssetType.THUMBNAIL_SM,
        storageKey: smallUpload.key,
        mimeType: 'image/png',
        fileSize: smallUpload.size,
        width: rendered.thumbnails.small.width,
        height: rendered.thumbnails.small.height,
      },
      {
        frameId: frame.id,
        type: FrameAssetType.THUMBNAIL_MD,
        storageKey: mediumUpload.key,
        mimeType: 'image/png',
        fileSize: mediumUpload.size,
        width: rendered.thumbnails.medium.width,
        height: rendered.thumbnails.medium.height,
      },
      {
        frameId: frame.id,
        type: FrameAssetType.THUMBNAIL_LG,
        storageKey: largeUpload.key,
        mimeType: 'image/png',
        fileSize: largeUpload.size,
        width: rendered.thumbnails.large.width,
        height: rendered.thumbnails.large.height,
      },
    ]);

    await this.frameAssetRepository.save(assets);

    this.applyPublicAssetUrls(frame, assets);
    await this.frameRepository.save(frame);

    await this.framesCacheService.invalidateFrame(frame.id, frame.slug);

    return {
      svgUrl: originalUpload.url,
      editorPreviewUrl: previewUpload.url,
      thumbnails: {
        small: smallUpload.url,
        medium: mediumUpload.url,
        large: largeUpload.url,
      },
    };
  }

  private async persistRenderedSceneAssets(
    frame: Frame,
    rendered: RenderedSceneAssetSet,
  ): Promise<{
    editorPreviewUrl: string;
    thumbnails: {
      small: string;
      medium: string;
      large: string;
    };
  }> {
    const [
      sourceUpload,
      smallUpload,
      mediumUpload,
      largeUpload,
      previewUpload,
    ] = await Promise.all([
      this.storageService.uploadBuffer(
        this.resolveStorageKey(frame.id, FrameAssetType.SCENE_BASE_PNG),
        rendered.sourceBuffer,
        'image/png',
      ),
      this.storageService.uploadBuffer(
        this.resolveStorageKey(frame.id, FrameAssetType.THUMBNAIL_SM),
        rendered.thumbnails.small.buffer,
        'image/png',
      ),
      this.storageService.uploadBuffer(
        this.resolveStorageKey(frame.id, FrameAssetType.THUMBNAIL_MD),
        rendered.thumbnails.medium.buffer,
        'image/png',
      ),
      this.storageService.uploadBuffer(
        this.resolveStorageKey(frame.id, FrameAssetType.THUMBNAIL_LG),
        rendered.thumbnails.large.buffer,
        'image/png',
      ),
      this.storageService.uploadBuffer(
        this.resolveStorageKey(frame.id, FrameAssetType.PREVIEW_PNG),
        rendered.preview.buffer,
        'image/png',
      ),
    ]);

    await this.frameAssetRepository.delete({ frameId: frame.id });

    const assets = this.frameAssetRepository.create([
      {
        frameId: frame.id,
        type: FrameAssetType.SCENE_BASE_PNG,
        storageKey: sourceUpload.key,
        mimeType: 'image/png',
        fileSize: sourceUpload.size,
        width: rendered.sourceCanvas.width,
        height: rendered.sourceCanvas.height,
      },
      {
        frameId: frame.id,
        type: FrameAssetType.PREVIEW_PNG,
        storageKey: previewUpload.key,
        mimeType: 'image/png',
        fileSize: previewUpload.size,
        width: rendered.preview.width,
        height: rendered.preview.height,
      },
      {
        frameId: frame.id,
        type: FrameAssetType.THUMBNAIL_SM,
        storageKey: smallUpload.key,
        mimeType: 'image/png',
        fileSize: smallUpload.size,
        width: rendered.thumbnails.small.width,
        height: rendered.thumbnails.small.height,
      },
      {
        frameId: frame.id,
        type: FrameAssetType.THUMBNAIL_MD,
        storageKey: mediumUpload.key,
        mimeType: 'image/png',
        fileSize: mediumUpload.size,
        width: rendered.thumbnails.medium.width,
        height: rendered.thumbnails.medium.height,
      },
      {
        frameId: frame.id,
        type: FrameAssetType.THUMBNAIL_LG,
        storageKey: largeUpload.key,
        mimeType: 'image/png',
        fileSize: largeUpload.size,
        width: rendered.thumbnails.large.width,
        height: rendered.thumbnails.large.height,
      },
    ]);

    await this.frameAssetRepository.save(assets);

    this.applyPublicAssetUrls(frame, assets);
    await this.frameRepository.save(frame);
    await this.framesCacheService.invalidateFrame(frame.id, frame.slug);

    return {
      editorPreviewUrl: previewUpload.url,
      thumbnails: {
        small: smallUpload.url,
        medium: mediumUpload.url,
        large: largeUpload.url,
      },
    };
  }

  private applyPublicAssetUrls(
    frame: Frame,
    assets: Array<Partial<FrameAsset>>,
  ): void {
    const svgAsset = assets.find((asset) => asset.type === FrameAssetType.SVG);
    const previewAsset = assets.find(
      (asset) => asset.type === FrameAssetType.PREVIEW_PNG,
    );
    const thumbnailAsset = assets.find(
      (asset) => asset.type === FrameAssetType.THUMBNAIL_MD,
    );

    frame.svgUrl = svgAsset?.storageKey
      ? this.storageService.getPublicUrl(svgAsset.storageKey)
      : null;
    frame.editorPreviewUrl = previewAsset?.storageKey
      ? this.storageService.getPublicUrl(previewAsset.storageKey)
      : null;
    frame.thumbnailUrl = thumbnailAsset?.storageKey
      ? this.storageService.getPublicUrl(thumbnailAsset.storageKey)
      : null;
  }

  private resolveStorageKey(frameId: string, type: FrameAssetType): string {
    switch (type) {
      case FrameAssetType.SVG:
        return `frames/${frameId}/original.svg`;
      case FrameAssetType.SCENE_BASE_PNG:
        return `frames/${frameId}/scene-base.png`;
      case FrameAssetType.PREVIEW_PNG:
        return `frames/${frameId}/editor-preview.png`;
      case FrameAssetType.THUMBNAIL_SM:
        return `frames/${frameId}/thumbnail-sm.png`;
      case FrameAssetType.THUMBNAIL_MD:
        return `frames/${frameId}/thumbnail-md.png`;
      case FrameAssetType.THUMBNAIL_LG:
        return `frames/${frameId}/thumbnail-lg.png`;
      default:
        return `frames/${frameId}/asset`;
    }
  }
}
