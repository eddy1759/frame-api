import { BadRequestException } from '@nestjs/common';

export interface FrameImagePlacementWindow {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface FrameImagePlacement {
  version: 1;
  fit: 'cover';
  window: FrameImagePlacementWindow;
}

export interface FrameScenePoint {
  x: number;
  y: number;
}

export interface FrameScenePlacementCorners {
  topLeft: FrameScenePoint;
  topRight: FrameScenePoint;
  bottomRight: FrameScenePoint;
  bottomLeft: FrameScenePoint;
}

export interface FrameScenePlacement {
  version: 1;
  transform: 'affine-quad';
  fit: 'cover';
  corners: FrameScenePlacementCorners;
}

export type FrameRenderMode = 'overlay' | 'scene';
export type FrameScenePlacementStatus = 'pending_annotation' | 'ready';
export type FrameRenderPlacement = FrameImagePlacement | FrameScenePlacement;

export interface FrameTitlePosition {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface FrameTitleConfig {
  text: string;
  fontFamily: string;
  fontWeight?: string | number;
  fontSizeRatio: number;
  color: string;
  position: FrameTitlePosition;
  align: 'left' | 'center' | 'right';
}

export interface FramePersonalizationMetadata {
  kind: 'title-customization';
  sourceFrameId: string;
  customTitle: string;
}

export interface FrameMetadata extends Record<string, unknown> {
  renderMode?: FrameRenderMode;
  imagePlacement?: FrameImagePlacement;
  scenePlacement?: FrameScenePlacement;
  scenePlacementStatus?: FrameScenePlacementStatus;
  titleConfig?: FrameTitleConfig;
  personalization?: FramePersonalizationMetadata;
}

export const DEFAULT_FRAME_IMAGE_PLACEMENT: FrameImagePlacement = Object.freeze(
  {
    version: 1,
    fit: 'cover',
    window: {
      x: 0,
      y: 0,
      width: 1,
      height: 1,
    },
  },
);

const UUID_V4_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const SAFE_FONT_FAMILY_PATTERN = /^[a-z0-9 ,'"_-]+$/i;
const SAFE_COLOR_PATTERN =
  /^(#[0-9a-f]{3,8}|rgba?\([^)]*\)|hsla?\([^)]*\)|[a-z]+)$/i;
const MAX_SCENE_AFFINE_ERROR = 0.06;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function assertFiniteNumber(value: unknown, field: string): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new BadRequestException({
      code: 'INVALID_FRAME_METADATA',
      message: `frame.metadata.imagePlacement.${field} must be a finite number.`,
    });
  }

  return value;
}

function assertFiniteMetadataNumber(value: unknown, fieldPath: string): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new BadRequestException({
      code: 'INVALID_FRAME_METADATA',
      message: `${fieldPath} must be a finite number.`,
    });
  }

  return value;
}

function assertOptionalSafeString(
  value: unknown,
  field: string,
  pattern: RegExp,
  message: string,
): string {
  if (typeof value !== 'string') {
    throw new BadRequestException({
      code: 'INVALID_FRAME_METADATA',
      message: `frame.metadata.${field} must be a string.`,
    });
  }

  const normalized = value.trim();
  if (!normalized || !pattern.test(normalized)) {
    throw new BadRequestException({
      code: 'INVALID_FRAME_METADATA',
      message,
    });
  }

  return normalized;
}

export function normalizeFrameTitleText(
  value: unknown,
  fieldPath = 'frame.metadata.titleConfig.text',
): string {
  if (typeof value !== 'string') {
    throw new BadRequestException({
      code: 'INVALID_FRAME_METADATA',
      message: `${fieldPath} must be a string.`,
    });
  }

  const normalized = value.trim().replace(/\s+/g, ' ');
  if (!normalized) {
    throw new BadRequestException({
      code: 'INVALID_FRAME_METADATA',
      message: `${fieldPath} must not be empty.`,
    });
  }

  if (normalized.length > 255) {
    throw new BadRequestException({
      code: 'INVALID_FRAME_METADATA',
      message: `${fieldPath} must be at most 255 characters long.`,
    });
  }

  return normalized;
}

function clonePlacement(placement: FrameImagePlacement): FrameImagePlacement {
  return {
    version: placement.version,
    fit: placement.fit,
    window: {
      x: placement.window.x,
      y: placement.window.y,
      width: placement.window.width,
      height: placement.window.height,
    },
  };
}

function cloneScenePlacement(
  placement: FrameScenePlacement,
): FrameScenePlacement {
  return {
    version: placement.version,
    transform: placement.transform,
    fit: placement.fit,
    corners: {
      topLeft: { ...placement.corners.topLeft },
      topRight: { ...placement.corners.topRight },
      bottomRight: { ...placement.corners.bottomRight },
      bottomLeft: { ...placement.corners.bottomLeft },
    },
  };
}

function normalizeScenePoint(
  value: unknown,
  fieldPath: string,
): FrameScenePoint {
  if (!isRecord(value)) {
    throw new BadRequestException({
      code: 'INVALID_FRAME_METADATA',
      message: `${fieldPath} must be an object.`,
    });
  }

  const x = assertFiniteMetadataNumber(value.x, `${fieldPath}.x`);
  const y = assertFiniteMetadataNumber(value.y, `${fieldPath}.y`);

  if (x < 0 || x > 1 || y < 0 || y > 1) {
    throw new BadRequestException({
      code: 'INVALID_FRAME_METADATA',
      message: `${fieldPath} coordinates must be between 0 and 1.`,
    });
  }

  return { x, y };
}

function polygonSignedArea(points: FrameScenePoint[]): number {
  let area = 0;
  for (let index = 0; index < points.length; index += 1) {
    const current = points[index];
    const next = points[(index + 1) % points.length];
    area += current.x * next.y - next.x * current.y;
  }

  return area / 2;
}

function crossProduct(
  a: FrameScenePoint,
  b: FrameScenePoint,
  c: FrameScenePoint,
): number {
  return (b.x - a.x) * (c.y - b.y) - (b.y - a.y) * (c.x - b.x);
}

function distance(a: FrameScenePoint, b: FrameScenePoint): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

function assertConvexScenePlacement(points: FrameScenePoint[]): void {
  const area = Math.abs(polygonSignedArea(points));
  if (area < 0.0005) {
    throw new BadRequestException({
      code: 'SCENE_PLACEMENT_UNSUPPORTED',
      message:
        'Scene placement is too small or degenerate to support affine rendering.',
    });
  }

  const signs = points.map((point, index) => {
    const previous = points[index];
    const current = points[(index + 1) % points.length];
    const next = points[(index + 2) % points.length];
    return crossProduct(previous, current, next);
  });

  if (signs.some((value) => value === 0)) {
    throw new BadRequestException({
      code: 'SCENE_PLACEMENT_UNSUPPORTED',
      message:
        'Scene placement edges must form a convex quadrilateral for affine rendering.',
    });
  }

  const allPositive = signs.every((value) => value > 0);
  const allNegative = signs.every((value) => value < 0);
  if (!allPositive && !allNegative) {
    throw new BadRequestException({
      code: 'SCENE_PLACEMENT_UNSUPPORTED',
      message:
        'Scene placement edges must form a convex quadrilateral for affine rendering.',
    });
  }
}

function assertAffineFriendlyScenePlacement(
  placement: FrameScenePlacement,
): void {
  const { topLeft, topRight, bottomRight, bottomLeft } = placement.corners;
  const expectedBottomRight = {
    x: topRight.x + bottomLeft.x - topLeft.x,
    y: topRight.y + bottomLeft.y - topLeft.y,
  };
  const affineError = distance(bottomRight, expectedBottomRight);
  const topWidth = distance(topLeft, topRight);
  const bottomWidth = distance(bottomLeft, bottomRight);
  const leftHeight = distance(topLeft, bottomLeft);
  const rightHeight = distance(topRight, bottomRight);

  if (
    affineError > MAX_SCENE_AFFINE_ERROR ||
    topWidth <= 0 ||
    bottomWidth <= 0 ||
    leftHeight <= 0 ||
    rightHeight <= 0 ||
    Math.max(topWidth, bottomWidth) / Math.min(topWidth, bottomWidth) > 1.25 ||
    Math.max(leftHeight, rightHeight) / Math.min(leftHeight, rightHeight) > 1.25
  ) {
    throw new BadRequestException({
      code: 'SCENE_PLACEMENT_UNSUPPORTED',
      message:
        'Scene placement must remain near-affine with mild perspective only.',
    });
  }
}

export function normalizeFrameImagePlacement(
  value: unknown,
): FrameImagePlacement {
  if (!isRecord(value)) {
    throw new BadRequestException({
      code: 'INVALID_FRAME_METADATA',
      message: 'frame.metadata.imagePlacement must be an object.',
    });
  }

  if (value.version !== 1) {
    throw new BadRequestException({
      code: 'INVALID_FRAME_METADATA',
      message: 'frame.metadata.imagePlacement.version must be 1.',
    });
  }

  if (value.fit !== 'cover') {
    throw new BadRequestException({
      code: 'INVALID_FRAME_METADATA',
      message: 'frame.metadata.imagePlacement.fit must be "cover".',
    });
  }

  if (!isRecord(value.window)) {
    throw new BadRequestException({
      code: 'INVALID_FRAME_METADATA',
      message: 'frame.metadata.imagePlacement.window must be an object.',
    });
  }

  const x = assertFiniteNumber(value.window.x, 'window.x');
  const y = assertFiniteNumber(value.window.y, 'window.y');
  const width = assertFiniteNumber(value.window.width, 'window.width');
  const height = assertFiniteNumber(value.window.height, 'window.height');

  if (x < 0 || x > 1 || y < 0 || y > 1) {
    throw new BadRequestException({
      code: 'INVALID_FRAME_METADATA',
      message:
        'frame.metadata.imagePlacement.window x and y must be between 0 and 1.',
    });
  }

  if (width <= 0 || width > 1 || height <= 0 || height > 1) {
    throw new BadRequestException({
      code: 'INVALID_FRAME_METADATA',
      message:
        'frame.metadata.imagePlacement.window width and height must be greater than 0 and at most 1.',
    });
  }

  if (x + width > 1 || y + height > 1) {
    throw new BadRequestException({
      code: 'INVALID_FRAME_METADATA',
      message:
        'frame.metadata.imagePlacement.window must remain within the frame canvas.',
    });
  }

  return {
    version: 1,
    fit: 'cover',
    window: {
      x,
      y,
      width,
      height,
    },
  };
}

export function normalizeFrameScenePlacement(
  value: unknown,
): FrameScenePlacement {
  if (!isRecord(value)) {
    throw new BadRequestException({
      code: 'INVALID_FRAME_METADATA',
      message: 'frame.metadata.scenePlacement must be an object.',
    });
  }

  if (value.version !== 1) {
    throw new BadRequestException({
      code: 'INVALID_FRAME_METADATA',
      message: 'frame.metadata.scenePlacement.version must be 1.',
    });
  }

  if (value.transform !== 'affine-quad') {
    throw new BadRequestException({
      code: 'INVALID_FRAME_METADATA',
      message: 'frame.metadata.scenePlacement.transform must be "affine-quad".',
    });
  }

  if (value.fit !== 'cover') {
    throw new BadRequestException({
      code: 'INVALID_FRAME_METADATA',
      message: 'frame.metadata.scenePlacement.fit must be "cover".',
    });
  }

  if (!isRecord(value.corners)) {
    throw new BadRequestException({
      code: 'INVALID_FRAME_METADATA',
      message: 'frame.metadata.scenePlacement.corners must be an object.',
    });
  }

  const placement: FrameScenePlacement = {
    version: 1,
    transform: 'affine-quad',
    fit: 'cover',
    corners: {
      topLeft: normalizeScenePoint(
        value.corners.topLeft,
        'frame.metadata.scenePlacement.corners.topLeft',
      ),
      topRight: normalizeScenePoint(
        value.corners.topRight,
        'frame.metadata.scenePlacement.corners.topRight',
      ),
      bottomRight: normalizeScenePoint(
        value.corners.bottomRight,
        'frame.metadata.scenePlacement.corners.bottomRight',
      ),
      bottomLeft: normalizeScenePoint(
        value.corners.bottomLeft,
        'frame.metadata.scenePlacement.corners.bottomLeft',
      ),
    },
  };

  assertConvexScenePlacement([
    placement.corners.topLeft,
    placement.corners.topRight,
    placement.corners.bottomRight,
    placement.corners.bottomLeft,
  ]);
  assertAffineFriendlyScenePlacement(placement);

  return placement;
}

export function normalizeFrameTitleConfig(value: unknown): FrameTitleConfig {
  if (!isRecord(value)) {
    throw new BadRequestException({
      code: 'INVALID_FRAME_METADATA',
      message: 'frame.metadata.titleConfig must be an object.',
    });
  }

  const text = normalizeFrameTitleText(value.text);
  const fontFamily = assertOptionalSafeString(
    value.fontFamily,
    'titleConfig.fontFamily',
    SAFE_FONT_FAMILY_PATTERN,
    'frame.metadata.titleConfig.fontFamily contains unsupported characters.',
  );
  const color = assertOptionalSafeString(
    value.color,
    'titleConfig.color',
    SAFE_COLOR_PATTERN,
    'frame.metadata.titleConfig.color must be a simple color value.',
  );
  const fontSizeRatio = assertFiniteNumber(
    value.fontSizeRatio,
    'titleConfig.fontSizeRatio',
  );

  if (fontSizeRatio <= 0 || fontSizeRatio > 0.5) {
    throw new BadRequestException({
      code: 'INVALID_FRAME_METADATA',
      message:
        'frame.metadata.titleConfig.fontSizeRatio must be greater than 0 and at most 0.5.',
    });
  }

  if (!isRecord(value.position)) {
    throw new BadRequestException({
      code: 'INVALID_FRAME_METADATA',
      message: 'frame.metadata.titleConfig.position must be an object.',
    });
  }

  const x = assertFiniteNumber(value.position.x, 'titleConfig.position.x');
  const y = assertFiniteNumber(value.position.y, 'titleConfig.position.y');
  const width = assertFiniteNumber(
    value.position.width,
    'titleConfig.position.width',
  );
  const height = assertFiniteNumber(
    value.position.height,
    'titleConfig.position.height',
  );

  if (x < 0 || x > 1 || y < 0 || y > 1) {
    throw new BadRequestException({
      code: 'INVALID_FRAME_METADATA',
      message:
        'frame.metadata.titleConfig.position x and y must be between 0 and 1.',
    });
  }

  if (width <= 0 || width > 1 || height <= 0 || height > 1) {
    throw new BadRequestException({
      code: 'INVALID_FRAME_METADATA',
      message:
        'frame.metadata.titleConfig.position width and height must be greater than 0 and at most 1.',
    });
  }

  if (x + width > 1 || y + height > 1) {
    throw new BadRequestException({
      code: 'INVALID_FRAME_METADATA',
      message:
        'frame.metadata.titleConfig.position must remain within the frame canvas.',
    });
  }

  let fontWeight: string | number | undefined;
  if (value.fontWeight !== undefined && value.fontWeight !== null) {
    if (typeof value.fontWeight === 'number') {
      if (
        !Number.isInteger(value.fontWeight) ||
        value.fontWeight < 100 ||
        value.fontWeight > 900 ||
        value.fontWeight % 100 !== 0
      ) {
        throw new BadRequestException({
          code: 'INVALID_FRAME_METADATA',
          message:
            'frame.metadata.titleConfig.fontWeight must be a multiple of 100 between 100 and 900.',
        });
      }
      fontWeight = value.fontWeight;
    } else if (typeof value.fontWeight === 'string') {
      const normalizedWeight = value.fontWeight.trim().toLowerCase();
      if (!/^(normal|bold|bolder|lighter|[1-9]00)$/.test(normalizedWeight)) {
        throw new BadRequestException({
          code: 'INVALID_FRAME_METADATA',
          message:
            'frame.metadata.titleConfig.fontWeight must be a CSS weight keyword or 100-900.',
        });
      }
      fontWeight = normalizedWeight;
    } else {
      throw new BadRequestException({
        code: 'INVALID_FRAME_METADATA',
        message:
          'frame.metadata.titleConfig.fontWeight must be a string or number.',
      });
    }
  }

  if (
    value.align !== 'left' &&
    value.align !== 'center' &&
    value.align !== 'right'
  ) {
    throw new BadRequestException({
      code: 'INVALID_FRAME_METADATA',
      message:
        'frame.metadata.titleConfig.align must be one of "left", "center", or "right".',
    });
  }

  return {
    text,
    fontFamily,
    fontWeight,
    fontSizeRatio,
    color,
    position: {
      x,
      y,
      width,
      height,
    },
    align: value.align,
  };
}

export function normalizeFramePersonalizationMetadata(
  value: unknown,
): FramePersonalizationMetadata {
  if (!isRecord(value)) {
    throw new BadRequestException({
      code: 'INVALID_FRAME_METADATA',
      message: 'frame.metadata.personalization must be an object.',
    });
  }

  if (value.kind !== 'title-customization') {
    throw new BadRequestException({
      code: 'INVALID_FRAME_METADATA',
      message:
        'frame.metadata.personalization.kind must be "title-customization".',
    });
  }

  if (
    typeof value.sourceFrameId !== 'string' ||
    !UUID_V4_PATTERN.test(value.sourceFrameId)
  ) {
    throw new BadRequestException({
      code: 'INVALID_FRAME_METADATA',
      message:
        'frame.metadata.personalization.sourceFrameId must be a valid UUID.',
    });
  }

  return {
    kind: 'title-customization',
    sourceFrameId: value.sourceFrameId,
    customTitle: normalizeFrameTitleText(
      value.customTitle,
      'frame.metadata.personalization.customTitle',
    ),
  };
}

export function normalizeFrameMetadata(value: unknown): FrameMetadata {
  if (value === undefined || value === null) {
    return {};
  }

  if (!isRecord(value)) {
    throw new BadRequestException({
      code: 'INVALID_FRAME_METADATA',
      message: 'frame.metadata must be a JSON object.',
    });
  }

  const metadata: FrameMetadata = { ...value };

  if (
    (metadata.scenePlacement !== undefined ||
      metadata.scenePlacementStatus !== undefined) &&
    metadata.renderMode === undefined
  ) {
    metadata.renderMode = 'scene';
  }

  if ('renderMode' in metadata) {
    if (
      metadata.renderMode !== undefined &&
      metadata.renderMode !== null &&
      metadata.renderMode !== 'overlay' &&
      metadata.renderMode !== 'scene'
    ) {
      throw new BadRequestException({
        code: 'INVALID_FRAME_METADATA',
        message: 'frame.metadata.renderMode must be "overlay" or "scene".',
      });
    }

    if (metadata.renderMode === null || metadata.renderMode === undefined) {
      delete metadata.renderMode;
    }
  }

  if ('imagePlacement' in metadata) {
    if (
      metadata.imagePlacement === null ||
      metadata.imagePlacement === undefined
    ) {
      delete metadata.imagePlacement;
    } else {
      metadata.imagePlacement = normalizeFrameImagePlacement(
        metadata.imagePlacement,
      );
    }
  }

  if ('scenePlacement' in metadata) {
    if (
      metadata.scenePlacement === null ||
      metadata.scenePlacement === undefined
    ) {
      delete metadata.scenePlacement;
    } else {
      metadata.scenePlacement = normalizeFrameScenePlacement(
        metadata.scenePlacement,
      );
    }
  }

  if ('scenePlacementStatus' in metadata) {
    if (
      metadata.scenePlacementStatus === null ||
      metadata.scenePlacementStatus === undefined
    ) {
      delete metadata.scenePlacementStatus;
    } else if (
      metadata.scenePlacementStatus !== 'pending_annotation' &&
      metadata.scenePlacementStatus !== 'ready'
    ) {
      throw new BadRequestException({
        code: 'INVALID_FRAME_METADATA',
        message:
          'frame.metadata.scenePlacementStatus must be "pending_annotation" or "ready".',
      });
    }
  }

  if ('titleConfig' in metadata) {
    if (metadata.titleConfig === null || metadata.titleConfig === undefined) {
      delete metadata.titleConfig;
    } else {
      metadata.titleConfig = normalizeFrameTitleConfig(metadata.titleConfig);
    }
  }

  if ('personalization' in metadata) {
    if (
      metadata.personalization === null ||
      metadata.personalization === undefined
    ) {
      delete metadata.personalization;
    } else {
      metadata.personalization = normalizeFramePersonalizationMetadata(
        metadata.personalization,
      );
    }
  }

  if (metadata.renderMode === 'scene') {
    if (
      metadata.scenePlacement &&
      metadata.scenePlacementStatus === undefined
    ) {
      metadata.scenePlacementStatus = 'ready';
    }

    if (
      metadata.scenePlacement === undefined &&
      metadata.scenePlacementStatus === undefined
    ) {
      metadata.scenePlacementStatus = 'pending_annotation';
    }
  } else if (
    metadata.scenePlacement !== undefined ||
    metadata.scenePlacementStatus !== undefined
  ) {
    throw new BadRequestException({
      code: 'INVALID_FRAME_METADATA',
      message:
        'frame.metadata.scenePlacement and scenePlacementStatus require renderMode "scene".',
    });
  }

  return metadata;
}

export function resolveFrameImagePlacement(
  metadata: unknown,
): FrameImagePlacement {
  if (!isRecord(metadata) || metadata.imagePlacement === undefined) {
    return clonePlacement(DEFAULT_FRAME_IMAGE_PLACEMENT);
  }

  try {
    return normalizeFrameImagePlacement(metadata.imagePlacement);
  } catch {
    return clonePlacement(DEFAULT_FRAME_IMAGE_PLACEMENT);
  }
}

export function resolveFrameRenderMode(metadata: unknown): FrameRenderMode {
  if (!isRecord(metadata) || metadata.renderMode === undefined) {
    return 'overlay';
  }

  return metadata.renderMode === 'scene' ? 'scene' : 'overlay';
}

export function resolveFrameScenePlacement(
  metadata: unknown,
): FrameScenePlacement | null {
  if (!isRecord(metadata) || metadata.scenePlacement === undefined) {
    return null;
  }

  try {
    return normalizeFrameScenePlacement(metadata.scenePlacement);
  } catch {
    return null;
  }
}

export function resolveFrameScenePlacementStatus(
  metadata: unknown,
): FrameScenePlacementStatus | null {
  if (!isRecord(metadata)) {
    return null;
  }

  if (
    metadata.scenePlacementStatus === 'pending_annotation' ||
    metadata.scenePlacementStatus === 'ready'
  ) {
    return metadata.scenePlacementStatus;
  }

  if (resolveFrameRenderMode(metadata) === 'scene') {
    return resolveFrameScenePlacement(metadata)
      ? 'ready'
      : 'pending_annotation';
  }

  return null;
}

export function resolveFrameTitleConfig(
  metadata: unknown,
): FrameTitleConfig | null {
  if (!isRecord(metadata) || metadata.titleConfig === undefined) {
    return null;
  }

  try {
    return normalizeFrameTitleConfig(metadata.titleConfig);
  } catch {
    return null;
  }
}

export function snapshotFrameImagePlacement(
  placement: FrameImagePlacement,
): FrameImagePlacement {
  return clonePlacement(placement);
}

export function snapshotFrameRenderPlacement(
  placement: FrameRenderPlacement,
): FrameRenderPlacement {
  if ('window' in placement) {
    return clonePlacement(placement);
  }

  return cloneScenePlacement(placement);
}

export function isFrameScenePlacement(
  placement: FrameRenderPlacement | null | undefined,
): placement is FrameScenePlacement {
  return Boolean(placement && 'corners' in placement);
}

export function isDefaultFrameImagePlacement(
  placement: FrameImagePlacement | null | undefined,
): boolean {
  if (!placement) {
    return false;
  }

  return (
    placement.version === DEFAULT_FRAME_IMAGE_PLACEMENT.version &&
    placement.fit === DEFAULT_FRAME_IMAGE_PLACEMENT.fit &&
    placement.window.x === DEFAULT_FRAME_IMAGE_PLACEMENT.window.x &&
    placement.window.y === DEFAULT_FRAME_IMAGE_PLACEMENT.window.y &&
    placement.window.width === DEFAULT_FRAME_IMAGE_PLACEMENT.window.width &&
    placement.window.height === DEFAULT_FRAME_IMAGE_PLACEMENT.window.height
  );
}
