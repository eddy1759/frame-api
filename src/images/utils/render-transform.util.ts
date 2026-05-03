export const RENDER_TRANSFORM_VERSION = 1;
export const MIN_RENDER_TRANSFORM_ZOOM = 1;
export const MAX_RENDER_TRANSFORM_ZOOM = 6;
export const MIN_RENDER_TRANSFORM_OFFSET = -1;
export const MAX_RENDER_TRANSFORM_OFFSET = 1;
export const MIN_RENDER_TRANSFORM_ROTATION = -180;
export const MAX_RENDER_TRANSFORM_ROTATION = 180;
export const RENDER_TRANSFORM_PRECISION = 1_000_000;

export interface RenderTransformV1 {
  version: typeof RENDER_TRANSFORM_VERSION;
  zoom: number;
  offsetX: number;
  offsetY: number;
  rotation: number;
}

export interface TransformPlacementInput {
  sourceWidth: number;
  sourceHeight: number;
  windowWidth: number;
  windowHeight: number;
  transform?: RenderTransformV1 | null;
}

export interface TransformPlacementResult {
  transform: RenderTransformV1;
  theta: number;
  baseScale: number;
  scale: number;
  scaledSourceWidth: number;
  scaledSourceHeight: number;
  rotatedWidth: number;
  rotatedHeight: number;
  maxTx: number;
  maxTy: number;
  tx: number;
  ty: number;
  left: number;
  top: number;
}

export const DEFAULT_RENDER_TRANSFORM: RenderTransformV1 = Object.freeze({
  version: RENDER_TRANSFORM_VERSION,
  zoom: 1,
  offsetX: 0,
  offsetY: 0,
  rotation: 0,
});

interface DimensionsLike {
  width?: number | null;
  height?: number | null;
  orientation?: number | null;
}

export function normalizeRenderTransform(
  transform?: Partial<RenderTransformV1> | null,
): RenderTransformV1 {
  const source = transform ?? DEFAULT_RENDER_TRANSFORM;

  return {
    version: RENDER_TRANSFORM_VERSION,
    zoom: roundToPrecision(
      clampFinite(
        source.zoom,
        DEFAULT_RENDER_TRANSFORM.zoom,
        MIN_RENDER_TRANSFORM_ZOOM,
        MAX_RENDER_TRANSFORM_ZOOM,
      ),
    ),
    offsetX: roundToPrecision(
      clampFinite(
        source.offsetX,
        DEFAULT_RENDER_TRANSFORM.offsetX,
        MIN_RENDER_TRANSFORM_OFFSET,
        MAX_RENDER_TRANSFORM_OFFSET,
      ),
    ),
    offsetY: roundToPrecision(
      clampFinite(
        source.offsetY,
        DEFAULT_RENDER_TRANSFORM.offsetY,
        MIN_RENDER_TRANSFORM_OFFSET,
        MAX_RENDER_TRANSFORM_OFFSET,
      ),
    ),
    rotation: roundToPrecision(
      clampFinite(
        source.rotation,
        DEFAULT_RENDER_TRANSFORM.rotation,
        MIN_RENDER_TRANSFORM_ROTATION,
        MAX_RENDER_TRANSFORM_ROTATION,
      ),
    ),
  };
}

export function resolveRenderTransform(
  transform?: RenderTransformV1 | null,
): RenderTransformV1 {
  return normalizeRenderTransform(transform);
}

export function areRenderTransformsEqual(
  left?: RenderTransformV1 | null,
  right?: RenderTransformV1 | null,
): boolean {
  const normalizedLeft = resolveRenderTransform(left);
  const normalizedRight = resolveRenderTransform(right);

  return (
    normalizedLeft.version === normalizedRight.version &&
    normalizedLeft.zoom === normalizedRight.zoom &&
    normalizedLeft.offsetX === normalizedRight.offsetX &&
    normalizedLeft.offsetY === normalizedRight.offsetY &&
    normalizedLeft.rotation === normalizedRight.rotation
  );
}

export function resolveTransformPlacement(
  input: TransformPlacementInput,
): TransformPlacementResult {
  const transform = resolveRenderTransform(input.transform);
  const sourceWidth = Math.max(1, Math.round(input.sourceWidth));
  const sourceHeight = Math.max(1, Math.round(input.sourceHeight));
  const windowWidth = Math.max(1, Math.round(input.windowWidth));
  const windowHeight = Math.max(1, Math.round(input.windowHeight));
  const theta = (transform.rotation * Math.PI) / 180;
  const cosTheta = Math.cos(theta);
  const sinTheta = Math.sin(theta);
  const unitRotatedWidth =
    Math.abs(sourceWidth * cosTheta) + Math.abs(sourceHeight * sinTheta);
  const unitRotatedHeight =
    Math.abs(sourceWidth * sinTheta) + Math.abs(sourceHeight * cosTheta);
  const baseScale = Math.max(
    windowWidth / Math.max(1, unitRotatedWidth),
    windowHeight / Math.max(1, unitRotatedHeight),
  );
  const scale = baseScale * transform.zoom;
  const scaledSourceWidth = Math.max(1, Math.ceil(sourceWidth * scale));
  const scaledSourceHeight = Math.max(1, Math.ceil(sourceHeight * scale));
  const rotatedWidth =
    Math.abs(scaledSourceWidth * cosTheta) +
    Math.abs(scaledSourceHeight * sinTheta);
  const rotatedHeight =
    Math.abs(scaledSourceWidth * sinTheta) +
    Math.abs(scaledSourceHeight * cosTheta);
  const maxTx = Math.max(0, (rotatedWidth - windowWidth) / 2);
  const maxTy = Math.max(0, (rotatedHeight - windowHeight) / 2);
  const effectiveOffsetX = maxTx > 0 ? transform.offsetX : 0;
  const effectiveOffsetY = maxTy > 0 ? transform.offsetY : 0;
  const tx = effectiveOffsetX * maxTx;
  const ty = effectiveOffsetY * maxTy;

  return {
    transform: {
      ...transform,
      offsetX: roundToPrecision(effectiveOffsetX),
      offsetY: roundToPrecision(effectiveOffsetY),
    },
    theta,
    baseScale,
    scale,
    scaledSourceWidth,
    scaledSourceHeight,
    rotatedWidth,
    rotatedHeight,
    maxTx,
    maxTy,
    tx,
    ty,
    left: Math.round((windowWidth - rotatedWidth) / 2 + tx),
    top: Math.round((windowHeight - rotatedHeight) / 2 + ty),
  };
}

export function resolveAutoOrientedDimensions(input: DimensionsLike): {
  width: number;
  height: number;
} {
  const width = Math.max(1, Math.round(Number(input.width ?? 0)));
  const height = Math.max(1, Math.round(Number(input.height ?? 0)));
  const orientation = Number(input.orientation ?? 1);

  if ([5, 6, 7, 8].includes(orientation)) {
    return { width: height, height: width };
  }

  return { width, height };
}

function clampFinite(
  value: number | undefined,
  fallback: number,
  min: number,
  max: number,
): number {
  if (!Number.isFinite(value)) {
    return fallback;
  }

  const finiteValue = value as number;
  return Math.min(Math.max(finiteValue, min), max);
}

function roundToPrecision(value: number): number {
  return (
    Math.round(value * RENDER_TRANSFORM_PRECISION) / RENDER_TRANSFORM_PRECISION
  );
}
