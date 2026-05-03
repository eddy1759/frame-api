/* eslint-disable @typescript-eslint/no-require-imports */
import { BadRequestException, Injectable } from '@nestjs/common';
import { JSDOM } from 'jsdom';
import {
  FrameImagePlacement,
  FrameMetadata,
  FrameTitleConfig,
  normalizeFrameTitleConfig,
} from '../utils/frame-metadata.util';
import {
  extractSvgCanvasDimensions,
  isAspectRatioCompatible,
} from '../utils/svg-canvas.util';

const sharp: typeof import('sharp') = require('sharp');
const createDOMPurify = require('dompurify');

const window = new JSDOM('').window;
const purify = createDOMPurify(window);
const TITLE_LAYER_ID = '__frame_api_title_layer__';
const AVERAGE_GLYPH_WIDTH_RATIO = 0.58;
const SVG_NUMBER_TOLERANCE = 1;
const RECTANGULAR_APERTURE_PATH_PATTERN =
  /M\s*0(?:\.0+)?\s+0(?:\.0+)?\s*H\s*([0-9.]+)\s*V\s*([0-9.]+)\s*H\s*0(?:\.0+)?\s*Z\s*M\s*([0-9.]+)\s+([0-9.]+)\s*H\s*([0-9.]+)\s*V\s*([0-9.]+)\s*H\s*([0-9.]+)\s*Z/i;

export interface RenderedFrameAssetSet {
  svgBuffer: Buffer;
  svgCanvas: {
    width: number;
    height: number;
  };
  preview: {
    buffer: Buffer;
    width: number;
    height: number;
  };
  thumbnails: {
    small: {
      buffer: Buffer;
      width: number;
      height: number;
    };
    medium: {
      buffer: Buffer;
      width: number;
      height: number;
    };
    large: {
      buffer: Buffer;
      width: number;
      height: number;
    };
  };
}

export interface RenderedSceneAssetSet {
  sourceBuffer: Buffer;
  sourceCanvas: {
    width: number;
    height: number;
  };
  preview: {
    buffer: Buffer;
    width: number;
    height: number;
  };
  thumbnails: {
    small: {
      buffer: Buffer;
      width: number;
      height: number;
    };
    medium: {
      buffer: Buffer;
      width: number;
      height: number;
    };
    large: {
      buffer: Buffer;
      width: number;
      height: number;
    };
  };
}

@Injectable()
export class FrameCompositorService {
  sanitizeUploadedSvg(svg: string): string {
    if (!svg || typeof svg !== 'string') {
      throw new BadRequestException({
        code: 'INVALID_SVG',
        message: 'An SVG file is required.',
      });
    }

    if (/<!DOCTYPE/i.test(svg)) {
      throw new BadRequestException({
        code: 'INVALID_SVG',
        message: 'DOCTYPE is not allowed in SVG uploads.',
      });
    }

    const clean = purify.sanitize(svg, {
      USE_PROFILES: { svg: true },
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

    return this.validateSvgSerialization(clean, false);
  }

  sanitizeGeneratedSvg(svg: string): string {
    if (!svg || typeof svg !== 'string') {
      throw new BadRequestException({
        code: 'AI_FRAME_SVG_SANITIZATION_FAILED',
        message: 'Generated SVG is empty.',
      });
    }

    if (
      /<!DOCTYPE/i.test(svg) ||
      /<script/i.test(svg) ||
      /<foreignObject/i.test(svg)
    ) {
      throw new BadRequestException({
        code: 'AI_FRAME_SVG_SANITIZATION_FAILED',
        message: 'Generated SVG contains unsafe markup.',
      });
    }

    return this.validateSvgSerialization(svg, true);
  }

  validateAspectRatio(
    svg: string,
    frameWidth: number,
    frameHeight: number,
  ): { width: number; height: number } {
    let svgCanvas: { width: number; height: number };
    try {
      svgCanvas = extractSvgCanvasDimensions(svg);
    } catch (error) {
      throw new BadRequestException({
        code: 'INVALID_SVG',
        message:
          error instanceof Error
            ? error.message
            : 'SVG must define a usable canvas.',
      });
    }

    if (
      !isAspectRatioCompatible(
        { width: frameWidth, height: frameHeight },
        svgCanvas,
      )
    ) {
      throw new BadRequestException({
        code: 'INVALID_SVG_ASPECT_RATIO',
        message:
          'SVG canvas aspect ratio does not match the target frame dimensions.',
      });
    }

    return svgCanvas;
  }

  async renderFrameAssetSet(
    svg: string | Buffer,
  ): Promise<RenderedFrameAssetSet> {
    const svgBuffer = Buffer.isBuffer(svg) ? svg : Buffer.from(svg, 'utf8');
    const svgCanvas = extractSvgCanvasDimensions(svgBuffer);

    const [small, medium, large, preview] = await Promise.all([
      this.createThumbnail(svgBuffer, 150),
      this.createThumbnail(svgBuffer, 300),
      this.createThumbnail(svgBuffer, 600),
      this.createEditorPreview(svgBuffer, svgCanvas.width, svgCanvas.height),
    ]);

    return {
      svgBuffer,
      svgCanvas,
      preview,
      thumbnails: {
        small,
        medium,
        large,
      },
    };
  }

  async renderSceneAssetSet(
    imageBuffer: Buffer,
    width: number,
    height: number,
  ): Promise<RenderedSceneAssetSet> {
    const normalizedBuffer = await sharp(imageBuffer)
      .resize(width, height, {
        fit: 'cover',
        withoutEnlargement: false,
      })
      .png()
      .toBuffer();

    const metadata = await sharp(normalizedBuffer).metadata();
    const canvasWidth = metadata.width ?? width;
    const canvasHeight = metadata.height ?? height;
    const [small, medium, large, preview] = await Promise.all([
      this.createThumbnail(normalizedBuffer, 150),
      this.createThumbnail(normalizedBuffer, 300),
      this.createThumbnail(normalizedBuffer, 600),
      this.createEditorPreview(normalizedBuffer, canvasWidth, canvasHeight),
    ]);

    return {
      sourceBuffer: normalizedBuffer,
      sourceCanvas: {
        width: canvasWidth,
        height: canvasHeight,
      },
      preview,
      thumbnails: {
        small,
        medium,
        large,
      },
    };
  }

  composeTitleOverlay(
    svg: string,
    titleConfig: FrameTitleConfig,
    frameWidth?: number,
    frameHeight?: number,
  ): string {
    if (!svg || typeof svg !== 'string') {
      throw new BadRequestException({
        code: 'INVALID_SVG',
        message: 'A valid SVG string is required to render frame titles.',
      });
    }

    const normalizedTitleConfig = normalizeFrameTitleConfig(titleConfig);
    const svgCanvas = extractSvgCanvasDimensions(svg);
    const targetWidth = frameWidth ?? svgCanvas.width;
    const targetHeight = frameHeight ?? svgCanvas.height;
    const svgWithoutExistingTitle = svg.replace(
      new RegExp(`<g[^>]*id=["']${TITLE_LAYER_ID}["'][\\s\\S]*?<\\/g>`, 'gi'),
      '',
    );

    if (
      !isAspectRatioCompatible(
        { width: targetWidth, height: targetHeight },
        svgCanvas,
      )
    ) {
      throw new BadRequestException({
        code: 'INVALID_SVG_ASPECT_RATIO',
        message:
          'SVG canvas aspect ratio does not match the target frame dimensions.',
      });
    }

    const dom = new JSDOM(svgWithoutExistingTitle, {
      contentType: 'image/svg+xml',
    });
    const document = dom.window.document;
    const root = document.documentElement;

    if (!root || root.nodeName.toLowerCase() !== 'svg') {
      throw new BadRequestException({
        code: 'INVALID_SVG',
        message: 'Uploaded file is not a valid SVG.',
      });
    }

    this.removeDuplicateConfiguredTitleText(
      root,
      normalizedTitleConfig,
      targetWidth,
      targetHeight,
    );

    const boxX = targetWidth * normalizedTitleConfig.position.x;
    const boxY = targetHeight * normalizedTitleConfig.position.y;
    const boxWidth = targetWidth * normalizedTitleConfig.position.width;
    const boxHeight = targetHeight * normalizedTitleConfig.position.height;
    const fontSize =
      Math.min(targetWidth, targetHeight) * normalizedTitleConfig.fontSizeRatio;
    const horizontalPadding = Math.max(fontSize * 0.18, targetWidth * 0.01);
    const maxTextWidth = Math.max(1, boxWidth - horizontalPadding * 2);
    const titleText = this.ellipsizeTitleText(
      normalizedTitleConfig.text,
      maxTextWidth,
      fontSize,
    );
    const estimatedWidth =
      titleText.length * fontSize * AVERAGE_GLYPH_WIDTH_RATIO;

    const textAnchor =
      normalizedTitleConfig.align === 'left'
        ? 'start'
        : normalizedTitleConfig.align === 'right'
          ? 'end'
          : 'middle';
    const textX =
      normalizedTitleConfig.align === 'left'
        ? boxX + horizontalPadding
        : normalizedTitleConfig.align === 'right'
          ? boxX + boxWidth - horizontalPadding
          : boxX + boxWidth / 2;

    const titleAttributes = [
      `fill="${normalizedTitleConfig.color}"`,
      `font-family="${normalizedTitleConfig.fontFamily}"`,
      `font-size="${this.formatSvgNumber(fontSize)}"`,
      'dominant-baseline="middle"',
      `text-anchor="${textAnchor}"`,
      `x="${this.formatSvgNumber(textX)}"`,
      `y="${this.formatSvgNumber(boxY + boxHeight / 2)}"`,
    ];

    if (normalizedTitleConfig.fontWeight !== undefined) {
      titleAttributes.push(
        `font-weight="${String(normalizedTitleConfig.fontWeight)}"`,
      );
    }

    if (estimatedWidth > maxTextWidth) {
      titleAttributes.push('lengthAdjust="spacingAndGlyphs"');
      titleAttributes.push(
        `textLength="${this.formatSvgNumber(maxTextWidth)}"`,
      );
    }

    const svgWithoutDuplicateTitle =
      new dom.window.XMLSerializer().serializeToString(dom.window.document);

    const titleMarkup = [
      `<g id="${TITLE_LAYER_ID}">`,
      `  <text ${titleAttributes.join(' ')}>${this.escapeXml(titleText)}</text>`,
      '</g>',
    ].join('\n');
    const composedSvg = svgWithoutDuplicateTitle.replace(
      /<\/svg>\s*$/i,
      `${titleMarkup}\n</svg>`,
    );

    if (composedSvg === svgWithoutDuplicateTitle) {
      throw new BadRequestException({
        code: 'INVALID_SVG',
        message: 'Uploaded file is not a valid SVG.',
      });
    }

    return this.sanitizeGeneratedSvg(composedSvg);
  }

  inferImagePlacementFromSvg(
    svg: string,
    frameWidth?: number,
    frameHeight?: number,
  ): FrameImagePlacement | null {
    if (!svg || typeof svg !== 'string') {
      return null;
    }

    let svgCanvas: { width: number; height: number };
    try {
      svgCanvas = extractSvgCanvasDimensions(svg);
    } catch {
      return null;
    }

    const targetWidth = frameWidth ?? svgCanvas.width;
    const targetHeight = frameHeight ?? svgCanvas.height;
    const dom = new JSDOM(svg, {
      contentType: 'image/svg+xml',
    });
    const root = dom.window.document.documentElement;

    if (!root || root.nodeName.toLowerCase() !== 'svg') {
      return null;
    }

    const pathNodes = Array.from(root.querySelectorAll('path'));
    for (const pathNode of pathNodes) {
      const fillRule = (pathNode.getAttribute('fill-rule') ?? '')
        .trim()
        .toLowerCase();
      if (fillRule !== 'evenodd') {
        continue;
      }

      const placement = this.tryParseRectangularAperturePath(
        pathNode.getAttribute('d') ?? '',
        svgCanvas.width,
        svgCanvas.height,
        targetWidth,
        targetHeight,
      );
      if (placement) {
        return placement;
      }
    }

    return null;
  }

  normalizeTitleConfigForImagePlacement(
    titleConfig: FrameTitleConfig,
    imagePlacement: FrameImagePlacement,
  ): FrameTitleConfig {
    const normalizedTitleConfig = normalizeFrameTitleConfig(titleConfig);
    const windowTop = imagePlacement.window.y;
    const windowBottom = imagePlacement.window.y + imagePlacement.window.height;
    const titleBaselineY =
      normalizedTitleConfig.position.y +
      normalizedTitleConfig.position.height / 2;

    if (titleBaselineY < windowTop || titleBaselineY > windowBottom) {
      return normalizedTitleConfig;
    }

    const preferredBand =
      normalizedTitleConfig.position.y >= windowTop ? 'below' : 'above';
    const adjustedPosition = this.resolveSafeTitlePosition(
      normalizedTitleConfig.position,
      imagePlacement.window,
      preferredBand,
    );

    if (!adjustedPosition) {
      return normalizedTitleConfig;
    }

    return {
      ...normalizedTitleConfig,
      position: adjustedPosition,
    };
  }

  buildGeneratedFrameSvg(
    rawImageBuffer: Buffer,
    width: number,
    height: number,
    insetPct: number,
  ): { svg: string; metadata: FrameMetadata } {
    const imagePlacement = this.buildImagePlacement(insetPct);
    const x = Math.round(width * imagePlacement.window.x);
    const y = Math.round(height * imagePlacement.window.y);
    const apertureWidth = Math.round(width * imagePlacement.window.width);
    const apertureHeight = Math.round(height * imagePlacement.window.height);
    const radius = Math.max(
      16,
      Math.round(Math.min(apertureWidth, apertureHeight) * 0.04),
    );
    const strokeWidth = Math.max(
      6,
      Math.round(Math.min(width, height) * 0.006),
    );
    const encodedImage = rawImageBuffer.toString('base64');

    const svg = [
      `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">`,
      '  <defs>',
      '    <mask id="frame-mask">',
      `      <rect x="0" y="0" width="${width}" height="${height}" fill="white" />`,
      `      <rect x="${x}" y="${y}" width="${apertureWidth}" height="${apertureHeight}" rx="${radius}" ry="${radius}" fill="black" />`,
      '    </mask>',
      '  </defs>',
      `  <image x="0" y="0" width="${width}" height="${height}" preserveAspectRatio="xMidYMid slice" href="data:image/png;base64,${encodedImage}" mask="url(#frame-mask)" />`,
      `  <rect x="${x}" y="${y}" width="${apertureWidth}" height="${apertureHeight}" rx="${radius}" ry="${radius}" fill="none" stroke="rgba(255,255,255,0.85)" stroke-width="${strokeWidth}" />`,
      '</svg>',
    ].join('\n');

    return {
      svg: this.sanitizeGeneratedSvg(svg),
      metadata: {
        imagePlacement,
      },
    };
  }

  buildImagePlacement(insetPct: number) {
    const clampedInset = Math.min(Math.max(insetPct, 0.05), 0.35);
    const windowSize = 1 - clampedInset * 2;

    return {
      version: 1 as const,
      fit: 'cover' as const,
      window: {
        x: clampedInset,
        y: clampedInset,
        width: windowSize,
        height: windowSize,
      },
    };
  }

  private validateSvgSerialization(
    svg: string,
    allowEmbeddedImages: boolean,
  ): string {
    const dom = new JSDOM(svg, { contentType: 'image/svg+xml' });
    const root = dom.window.document.documentElement;

    if (!root || root.nodeName.toLowerCase() !== 'svg') {
      throw new BadRequestException({
        code: allowEmbeddedImages
          ? 'AI_FRAME_SVG_SANITIZATION_FAILED'
          : 'INVALID_SVG',
        message: 'Uploaded file is not a valid SVG.',
      });
    }

    const elements = [
      root,
      ...Array.from(dom.window.document.querySelectorAll('*')),
    ];

    for (const element of elements) {
      for (const attr of Array.from(element.attributes)) {
        const name = attr.name.toLowerCase();
        const value = attr.value.trim();

        if (name.startsWith('on')) {
          element.removeAttribute(attr.name);
          continue;
        }

        if (
          (name === 'href' || name === 'xlink:href' || name === 'src') &&
          value
        ) {
          if (
            allowEmbeddedImages &&
            element.tagName.toLowerCase() === 'image' &&
            /^data:image\/(?:png|jpeg|jpg|webp);base64,[a-z0-9+/=\s]+$/i.test(
              value,
            )
          ) {
            continue;
          }

          element.removeAttribute(attr.name);
        }

        if (name === 'style') {
          element.removeAttribute(attr.name);
          continue;
        }

        if (
          !this.isPermittedSvgReferenceAttribute(
            name,
            value,
            allowEmbeddedImages,
            element.tagName.toLowerCase(),
          )
        ) {
          throw new BadRequestException({
            code: allowEmbeddedImages
              ? 'AI_FRAME_SVG_SANITIZATION_FAILED'
              : 'INVALID_SVG',
            message: 'SVG contains unsafe references.',
          });
        }
      }
    }

    const serialized = new dom.window.XMLSerializer().serializeToString(
      dom.window.document,
    );

    if (/(javascript:|blob:|file:)/i.test(serialized)) {
      throw new BadRequestException({
        code: allowEmbeddedImages
          ? 'AI_FRAME_SVG_SANITIZATION_FAILED'
          : 'INVALID_SVG',
        message: 'SVG contains unsafe references.',
      });
    }

    return serialized;
  }

  private isPermittedSvgReferenceAttribute(
    name: string,
    value: string,
    allowEmbeddedImages: boolean,
    tagName: string,
  ): boolean {
    if (!value) {
      return true;
    }

    if (['xmlns', 'xmlns:xlink'].includes(name)) {
      return true;
    }

    if (/(javascript:|blob:|file:)/i.test(value)) {
      return false;
    }

    if (
      ['href', 'xlink:href', 'src'].includes(name) &&
      allowEmbeddedImages &&
      tagName === 'image'
    ) {
      return /^data:image\/(?:png|jpeg|jpg|webp);base64,[a-z0-9+/=\s]+$/i.test(
        value,
      );
    }

    if (/^(data:|https?:\/\/|\/\/)/i.test(value)) {
      return false;
    }

    if (/\burl\(\s*(['"]?)(data:|https?:\/\/|\/\/)/i.test(value)) {
      return false;
    }

    return true;
  }

  private ellipsizeTitleText(
    text: string,
    maxTextWidth: number,
    fontSize: number,
  ): string {
    const normalized = text.trim().replace(/\s+/g, ' ');
    if (!normalized) {
      throw new BadRequestException({
        code: 'INVALID_FRAME_METADATA',
        message: 'frame.metadata.titleConfig.text must not be empty.',
      });
    }

    const maxChars = Math.max(
      1,
      Math.floor(
        maxTextWidth / Math.max(fontSize * AVERAGE_GLYPH_WIDTH_RATIO, 1),
      ),
    );

    if (normalized.length <= maxChars) {
      return normalized;
    }

    if (maxChars <= 3) {
      return normalized.slice(0, maxChars);
    }

    return `${normalized.slice(0, maxChars - 3).trimEnd()}...`;
  }

  private removeDuplicateConfiguredTitleText(
    root: Element,
    titleConfig: FrameTitleConfig,
    targetWidth: number,
    targetHeight: number,
  ): void {
    const expectedText = this.normalizeSvgTextContent(titleConfig.text);
    const expectedX =
      (titleConfig.position.x +
        (titleConfig.align === 'center'
          ? titleConfig.position.width / 2
          : titleConfig.align === 'right'
            ? titleConfig.position.width
            : 0)) *
      targetWidth;
    const expectedY =
      (titleConfig.position.y + titleConfig.position.height / 2) * targetHeight;
    const expectedFontSize = titleConfig.fontSizeRatio * targetWidth;
    const expectedAnchor =
      titleConfig.align === 'center'
        ? 'middle'
        : titleConfig.align === 'right'
          ? 'end'
          : 'start';
    const expectedFontFamily = titleConfig.fontFamily.trim();
    const expectedColor = titleConfig.color.trim().toLowerCase();

    const textNodes = Array.from(root.querySelectorAll('text'));
    for (const textNode of textNodes) {
      if (
        this.isFrontendGeneratedDuplicateTitleNode(textNode, {
          expectedAnchor,
          expectedColor,
          expectedFontFamily,
          expectedFontSize,
          expectedText,
          expectedX,
          expectedY,
        })
      ) {
        textNode.remove();
      }
    }
  }

  private isFrontendGeneratedDuplicateTitleNode(
    textNode: Element,
    expected: {
      expectedAnchor: string;
      expectedColor: string;
      expectedFontFamily: string;
      expectedFontSize: number;
      expectedText: string;
      expectedX: number;
      expectedY: number;
    },
  ): boolean {
    if (
      this.normalizeSvgTextContent(textNode.textContent ?? '') !==
      expected.expectedText
    ) {
      return false;
    }

    const x = this.readSvgNumberAttribute(textNode, 'x');
    const y = this.readSvgNumberAttribute(textNode, 'y');
    const fontSize = this.readSvgNumberAttribute(textNode, 'font-size');

    if (x === null || y === null || fontSize === null) {
      return false;
    }

    if (
      !this.svgNumbersMatch(x, expected.expectedX) ||
      !this.svgNumbersMatch(y, expected.expectedY) ||
      !this.svgNumbersMatch(fontSize, expected.expectedFontSize)
    ) {
      return false;
    }

    if (
      (textNode.getAttribute('text-anchor') ?? '').trim() !==
      expected.expectedAnchor
    ) {
      return false;
    }

    if (
      (textNode.getAttribute('font-family') ?? '').trim() !==
      expected.expectedFontFamily
    ) {
      return false;
    }

    if (
      (textNode.getAttribute('fill') ?? '').trim().toLowerCase() !==
      expected.expectedColor
    ) {
      return false;
    }

    return true;
  }

  private normalizeSvgTextContent(value: string): string {
    return value.trim().replace(/\s+/g, ' ');
  }

  private tryParseRectangularAperturePath(
    pathData: string,
    svgWidth: number,
    svgHeight: number,
    targetWidth: number,
    targetHeight: number,
  ): FrameImagePlacement | null {
    const match = pathData.match(RECTANGULAR_APERTURE_PATH_PATTERN);
    if (!match) {
      return null;
    }

    const [
      ,
      outerWidthRaw,
      outerHeightRaw,
      leftRaw,
      topRaw,
      rightRaw,
      bottomRaw,
      leftRepeatRaw,
    ] = match;
    const outerWidth = parseFloat(outerWidthRaw);
    const outerHeight = parseFloat(outerHeightRaw);
    const left = parseFloat(leftRaw);
    const top = parseFloat(topRaw);
    const right = parseFloat(rightRaw);
    const bottom = parseFloat(bottomRaw);
    const leftRepeat = parseFloat(leftRepeatRaw);

    const apertureCoordinates = [
      outerWidth,
      outerHeight,
      left,
      top,
      right,
      bottom,
      leftRepeat,
    ];
    if (!apertureCoordinates.every(Number.isFinite)) {
      return null;
    }

    if (
      !this.svgNumbersMatch(left, leftRepeat) ||
      !this.svgNumbersMatch(outerWidth, svgWidth) ||
      !this.svgNumbersMatch(outerHeight, svgHeight) ||
      Math.abs(outerWidth / outerHeight - targetWidth / targetHeight) > 0.01
    ) {
      return null;
    }

    const apertureWidth = right - left;
    const apertureHeight = bottom - top;
    if (apertureWidth <= 0 || apertureHeight <= 0) {
      return null;
    }

    return {
      version: 1,
      fit: 'cover',
      window: {
        x: this.roundNormalizedCoordinate(left / outerWidth),
        y: this.roundNormalizedCoordinate(top / outerHeight),
        width: this.roundNormalizedCoordinate(apertureWidth / outerWidth),
        height: this.roundNormalizedCoordinate(apertureHeight / outerHeight),
      },
    };
  }

  private resolveSafeTitlePosition(
    position: FrameTitleConfig['position'],
    imageWindow: FrameImagePlacement['window'],
    preferredBand: 'above' | 'below',
  ): FrameTitleConfig['position'] | null {
    const candidateBands =
      preferredBand === 'below'
        ? [
            {
              y: imageWindow.y + imageWindow.height,
              height: 1 - (imageWindow.y + imageWindow.height),
            },
            {
              y: 0,
              height: imageWindow.y,
            },
          ]
        : [
            {
              y: 0,
              height: imageWindow.y,
            },
            {
              y: imageWindow.y + imageWindow.height,
              height: 1 - (imageWindow.y + imageWindow.height),
            },
          ];

    for (const band of candidateBands) {
      if (band.height <= 0) {
        continue;
      }

      const nextHeight = Math.min(position.height, band.height);
      if (nextHeight <= 0) {
        continue;
      }

      return {
        ...position,
        y: this.roundNormalizedCoordinate(
          band.y + (band.height - nextHeight) / 2,
        ),
        height: this.roundNormalizedCoordinate(nextHeight),
      };
    }

    return null;
  }

  private readSvgNumberAttribute(
    element: Element,
    name: string,
  ): number | null {
    const raw = element.getAttribute(name);
    if (!raw) {
      return null;
    }

    const parsed = parseFloat(raw);
    return Number.isFinite(parsed) ? parsed : null;
  }

  private svgNumbersMatch(actual: number, expected: number): boolean {
    return Math.abs(actual - expected) <= SVG_NUMBER_TOLERANCE;
  }

  private roundNormalizedCoordinate(value: number): number {
    return Number(value.toFixed(10));
  }

  private formatSvgNumber(value: number): string {
    if (Number.isInteger(value)) {
      return String(value);
    }

    return value.toFixed(3).replace(/\.?0+$/, '');
  }

  private escapeXml(value: string): string {
    return value
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&apos;');
  }

  private async createThumbnail(
    imageBuffer: Buffer,
    size: number,
  ): Promise<{ buffer: Buffer; width: number; height: number }> {
    const transformer = sharp(imageBuffer).resize(size, size, {
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
    imageBuffer: Buffer,
    width: number,
    height: number,
  ): Promise<{ buffer: Buffer; width: number; height: number }> {
    const pngBuffer = await sharp(imageBuffer, { density: 300 })
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
