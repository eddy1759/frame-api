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
import { JSDOM } from 'jsdom';
import {
  FrameImagePlacement,
  resolveFrameImagePlacement,
  snapshotFrameImagePlacement,
} from '../utils/frame-metadata.util';
import {
  extractSvgCanvasDimensions,
  isAspectRatioCompatible,
} from '../utils/svg-canvas.util';

// eslint-disable-next-line @typescript-eslint/no-require-imports
const sharp: typeof import('sharp') = require('sharp');
// eslint-disable-next-line @typescript-eslint/no-require-imports
const createDOMPurify = require('dompurify');

const MAX_SVG_SIZE_BYTES = 5 * 1024 * 1024;

interface UploadedSvgFile {
  buffer: Buffer;
  size: number;
  mimetype?: string;
  originalname?: string;
}

const window = new JSDOM('').window;
const purify = createDOMPurify(window);

export interface FrameSvgAssetInfo {
  frameId: string;
  storageKey: string;
  mimeType: string;
  fileSize: number;
  imagePlacement: FrameImagePlacement;
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
    const sanitizedSvg = this.sanitizeSvg(rawSvg);
    let svgCanvas: { width: number; height: number };
    try {
      svgCanvas = extractSvgCanvasDimensions(sanitizedSvg);
    } catch (error) {
      throw new BadRequestException({
        code: 'INVALID_SVG',
        message:
          error instanceof Error
            ? error.message
            : 'SVG must define a usable canvas.',
      });
    }
    const frameCanvas = {
      width: frame.width,
      height: frame.height,
    };

    if (!isAspectRatioCompatible(frameCanvas, svgCanvas)) {
      throw new BadRequestException({
        code: 'INVALID_SVG_ASPECT_RATIO',
        message:
          'SVG canvas aspect ratio does not match the target frame dimensions.',
      });
    }

    const svgBuffer = Buffer.from(sanitizedSvg, 'utf8');

    const originalKey = `frames/${frameId}/original.svg`;
    const originalUpload = await this.storageService.uploadBuffer(
      originalKey,
      svgBuffer,
      'image/svg+xml',
    );

    const [thumbnailSmall, thumbnailMedium, thumbnailLarge, previewOverlay] =
      await Promise.all([
        this.createThumbnail(svgBuffer, 150),
        this.createThumbnail(svgBuffer, 300),
        this.createThumbnail(svgBuffer, 600),
        this.createEditorPreview(svgBuffer, frame.width, frame.height),
      ]);

    const smallKey = `frames/${frameId}/thumbnail-sm.png`;
    const mediumKey = `frames/${frameId}/thumbnail-md.png`;
    const largeKey = `frames/${frameId}/thumbnail-lg.png`;
    const previewKey = `frames/${frameId}/editor-preview.png`;

    const [smallUpload, mediumUpload, largeUpload, previewUpload] =
      await Promise.all([
        this.storageService.uploadBuffer(
          smallKey,
          thumbnailSmall.buffer,
          'image/png',
        ),
        this.storageService.uploadBuffer(
          mediumKey,
          thumbnailMedium.buffer,
          'image/png',
        ),
        this.storageService.uploadBuffer(
          largeKey,
          thumbnailLarge.buffer,
          'image/png',
        ),
        this.storageService.uploadBuffer(
          previewKey,
          previewOverlay.buffer,
          'image/png',
        ),
      ]);

    await this.frameAssetRepository.delete({ frameId });

    const assets = this.frameAssetRepository.create([
      {
        frameId,
        type: FrameAssetType.SVG,
        storageKey: originalUpload.key,
        mimeType: 'image/svg+xml',
        fileSize: originalUpload.size,
        width: Math.round(svgCanvas.width),
        height: Math.round(svgCanvas.height),
      },
      {
        frameId,
        type: FrameAssetType.PREVIEW_PNG,
        storageKey: previewUpload.key,
        mimeType: 'image/png',
        fileSize: previewUpload.size,
        width: previewOverlay.width,
        height: previewOverlay.height,
      },
      {
        frameId,
        type: FrameAssetType.THUMBNAIL_SM,
        storageKey: smallUpload.key,
        mimeType: 'image/png',
        fileSize: smallUpload.size,
        width: thumbnailSmall.width,
        height: thumbnailSmall.height,
      },
      {
        frameId,
        type: FrameAssetType.THUMBNAIL_MD,
        storageKey: mediumUpload.key,
        mimeType: 'image/png',
        fileSize: mediumUpload.size,
        width: thumbnailMedium.width,
        height: thumbnailMedium.height,
      },
      {
        frameId,
        type: FrameAssetType.THUMBNAIL_LG,
        storageKey: largeUpload.key,
        mimeType: 'image/png',
        fileSize: largeUpload.size,
        width: thumbnailLarge.width,
        height: thumbnailLarge.height,
      },
    ]);

    await this.frameAssetRepository.save(assets);

    frame.svgUrl = originalUpload.url;
    frame.editorPreviewUrl = previewUpload.url;
    frame.thumbnailUrl = mediumUpload.url;
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

  private sanitizeSvg(svg: string): string {
    if (!svg || typeof svg !== 'string') {
      throw new BadRequestException({
        code: 'INVALID_SVG',
        message: 'An SVG file is required.',
      });
    }

    // Block dangerous XML constructs early
    if (/<!DOCTYPE/i.test(svg)) {
      throw new BadRequestException({
        code: 'INVALID_SVG',
        message: 'DOCTYPE is not allowed in SVG uploads.',
      });
    }

    // Strict DOMPurify sanitization (allowlist only)
    const clean = purify.sanitize(svg, {
      USE_PROFILES: { svg: true },

      // Only allow safe structural SVG elements
      ALLOWED_TAGS: [
        'svg',
        'defs',
        'g',
        'path',
        'circle',
        'rect',
        'line',
        'polyline',
        'polygon',
        'ellipse',
        'linearGradient',
        'radialGradient',
        'stop',
      ],

      // Only allow safe visual attributes
      ALLOWED_ATTR: [
        'd',
        'fill',
        'stroke',
        'stroke-width',
        'fill-rule',
        'fill-opacity',
        'stroke-opacity',
        'stroke-linecap',
        'stroke-linejoin',
        'opacity',
        'viewBox',
        'width',
        'height',
        'id',
        'cx',
        'cy',
        'r',
        'x',
        'y',
        'rx',
        'ry',
        'points',
        'x1',
        'y1',
        'x2',
        'y2',
        'offset',
        'stop-color',
        'stop-opacity',
        'gradientUnits',
        'gradientTransform',
      ],

      // Explicitly block all risky surfaces
      FORBID_TAGS: [
        'script',
        'style',
        'foreignObject',
        'iframe',
        'object',
        'embed',
        'use',
        'image',
        'feImage',
      ],

      FORBID_ATTR: ['on*', 'href', 'xlink:href', 'src', 'style'],

      ALLOW_DATA_ATTR: false,
      ALLOW_UNKNOWN_PROTOCOLS: false,
      KEEP_CONTENT: false,
      RETURN_TRUSTED_TYPE: false,
    });

    // Structural validation (post-sanitize)
    const dom = new JSDOM(clean, { contentType: 'image/svg+xml' });
    const root = dom.window.document.documentElement;

    if (!root || root.nodeName.toLowerCase() !== 'svg') {
      throw new BadRequestException({
        code: 'INVALID_SVG',
        message: 'Uploaded file is not a valid SVG.',
      });
    }

    // Final hard check: kill any protocol usage
    const serialized = new dom.window.XMLSerializer().serializeToString(
      dom.window.document,
    );

    if (/(javascript:|data:|blob:|file:)/i.test(serialized)) {
      throw new BadRequestException({
        code: 'INVALID_SVG',
        message: 'SVG contains unsafe references.',
      });
    }

    if (!serialized.includes('<svg')) {
      throw new BadRequestException({
        code: 'SANITIZATION_FAILED',
        message: 'SVG could not be sanitized.',
      });
    }

    return serialized;
  }

  private async createThumbnail(
    svgBuffer: Buffer,
    size: number,
  ): Promise<{ buffer: Buffer; width: number; height: number }> {
    const transformer = sharp(svgBuffer).resize(size, size, {
      fit: 'inside',
      withoutEnlargement: false,
    });

    const pngBuffer = await transformer.png().toBuffer();
    const metadata = await sharp(pngBuffer).metadata();

    return {
      buffer: pngBuffer,
      width: metadata.width ?? size,
      height: metadata.height ?? size,
    };
  }

  private async createEditorPreview(
    svgBuffer: Buffer,
    width: number,
    height: number,
  ): Promise<{ buffer: Buffer; width: number; height: number }> {
    const pngBuffer = await sharp(svgBuffer, { density: 300 })
      .resize(width, height, {
        fit: 'fill',
        withoutEnlargement: false,
        background: { r: 0, g: 0, b: 0, alpha: 0 },
      })
      .png()
      .toBuffer();
    const metadata = await sharp(pngBuffer).metadata();

    return {
      buffer: pngBuffer,
      width: metadata.width ?? width,
      height: metadata.height ?? height,
    };
  }
}
