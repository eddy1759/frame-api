import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import sharp from 'sharp';
import { DOMParser, XMLSerializer } from '@xmldom/xmldom';
import { Frame } from '../entities/frame.entity';
import { FrameAsset } from '../entities/frame-asset.entity';
import { FrameAssetType } from '../entities/frame-asset-type.enum';
import { StorageService } from '../../common/services';
import { FramesCacheService } from './frames-cache.service';

const MAX_SVG_SIZE_BYTES = 5 * 1024 * 1024;

interface UploadedSvgFile {
  buffer: Buffer;
  size: number;
  mimetype?: string;
  originalname?: string;
}

@Injectable()
export class FrameAssetsService {
  constructor(
    @InjectRepository(Frame)
    private readonly frameRepository: Repository<Frame>,
    @InjectRepository(FrameAsset)
    private readonly frameAssetRepository: Repository<FrameAsset>,
    private readonly storageService: StorageService,
    private readonly framesCacheService: FramesCacheService,
  ) {}

  async uploadSvgAsset(
    frameId: string,
    file: UploadedSvgFile,
  ): Promise<{
    svgUrl: string;
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
    const svgBuffer = Buffer.from(sanitizedSvg, 'utf8');

    const originalKey = `frames/${frameId}/original.svg`;
    const originalUpload = await this.storageService.uploadBuffer(
      originalKey,
      svgBuffer,
      'image/svg+xml',
    );

    const thumbnailSmall = await this.createThumbnail(svgBuffer, 150);
    const thumbnailMedium = await this.createThumbnail(svgBuffer, 300);
    const thumbnailLarge = await this.createThumbnail(svgBuffer, 600);

    const smallKey = `frames/${frameId}/thumbnail-sm.png`;
    const mediumKey = `frames/${frameId}/thumbnail-md.png`;
    const largeKey = `frames/${frameId}/thumbnail-lg.png`;

    const [smallUpload, mediumUpload, largeUpload] = await Promise.all([
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
    ]);

    await this.frameAssetRepository.delete({ frameId });

    const assets = this.frameAssetRepository.create([
      {
        frameId,
        type: FrameAssetType.SVG,
        storageKey: originalUpload.key,
        mimeType: 'image/svg+xml',
        fileSize: originalUpload.size,
        width: null,
        height: null,
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
    frame.thumbnailUrl = mediumUpload.url;
    await this.frameRepository.save(frame);

    await this.framesCacheService.invalidateFrame(frame.id, frame.slug);

    return {
      svgUrl: originalUpload.url,
      thumbnails: {
        small: smallUpload.url,
        medium: mediumUpload.url,
        large: largeUpload.url,
      },
    };
  }

  private sanitizeSvg(svg: string): string {
    const parseErrors: string[] = [];
    const parser = new DOMParser({
      errorHandler: {
        warning: () => undefined,
        error: (msg: unknown) => parseErrors.push(String(msg)),
        fatalError: (msg: unknown) => parseErrors.push(String(msg)),
      },
    });

    const document = parser.parseFromString(svg, 'image/svg+xml');

    if (
      parseErrors.length > 0 ||
      !document.documentElement ||
      document.documentElement.nodeName.toLowerCase() !== 'svg'
    ) {
      throw new BadRequestException({
        code: 'INVALID_SVG',
        message: 'Uploaded file is not valid SVG XML.',
      });
    }

    const blockedElements = new Set(['script', 'use', 'foreignobject']);

    const cleanseElement = (node: Node): void => {
      if (node.nodeType !== 1) {
        return;
      }

      const element = node as Element;
      const tagName = element.tagName.toLowerCase();

      if (blockedElements.has(tagName)) {
        if (element.parentNode) {
          element.parentNode.removeChild(element);
        }
        return;
      }

      const attrsToRemove: string[] = [];
      for (let i = 0; i < element.attributes.length; i += 1) {
        const attr = element.attributes.item(i);
        if (!attr) continue;

        const attrName = String(attr.name ?? '').toLowerCase();
        const attrValue = String(attr.value ?? '').trim();

        if (attrName.startsWith('on')) {
          attrsToRemove.push(String(attr.name));
          continue;
        }

        if (
          attrName === 'href' ||
          attrName === 'xlink:href' ||
          attrName === 'src'
        ) {
          if (this.isExternalReference(attrValue)) {
            attrsToRemove.push(String(attr.name));
          }
          continue;
        }

        if (attrName === 'style' && this.containsExternalCssUrl(attrValue)) {
          attrsToRemove.push(String(attr.name));
        }
      }

      for (const attrName of attrsToRemove) {
        element.removeAttribute(attrName);
      }

      if (tagName === 'style') {
        const styleContent = element.textContent ?? '';
        const sanitizedStyle = styleContent.replace(
          /url\(\s*(['"]?)(https?:\/\/|\/\/|javascript:)[^)]+\)/gi,
          'none',
        );
        element.textContent = sanitizedStyle;
      }

      const children: Node[] = [];
      for (let i = 0; i < element.childNodes.length; i += 1) {
        const child = element.childNodes.item(i);
        if (child) {
          children.push(child);
        }
      }

      for (const child of children) {
        cleanseElement(child);
      }
    };

    cleanseElement(document.documentElement);

    return new XMLSerializer().serializeToString(document);
  }

  private isExternalReference(value: string): boolean {
    const normalized = value.trim().replace(/^['"]|['"]$/g, '');

    if (!normalized) {
      return false;
    }

    if (normalized.startsWith('#')) {
      return false;
    }

    return (
      /^(https?:)?\/\//i.test(normalized) || /^javascript:/i.test(normalized)
    );
  }

  private containsExternalCssUrl(value: string): boolean {
    return /url\(\s*(['"]?)(https?:\/\/|\/\/|javascript:)/i.test(value);
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
}
