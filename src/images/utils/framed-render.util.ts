import { FrameImagePlacement } from '../../frames/utils/frame-metadata.util';
import { SvgCanvasDimensions } from '../../frames/utils/svg-canvas.util';

export interface RenderDimensions {
  width: number;
  height: number;
}

export interface PlacementRect {
  left: number;
  top: number;
  width: number;
  height: number;
}

export interface CompositeCropInput {
  overlayLeft: number;
  overlayTop: number;
  overlayWidth: number;
  overlayHeight: number;
  canvasWidth: number;
  canvasHeight: number;
}

export interface CompositeCropResult {
  inputLeft: number;
  inputTop: number;
  inputWidth: number;
  inputHeight: number;
  targetLeft: number;
  targetTop: number;
}

export function resolveFramedRenderDimensions(
  frameCanvas: SvgCanvasDimensions,
  maxWidth: number,
  maxHeight: number,
): RenderDimensions {
  const aspectRatio = frameCanvas.width / frameCanvas.height;

  let width = Math.min(maxWidth, Math.round(maxHeight * aspectRatio));
  let height = Math.max(1, Math.round(width / aspectRatio));

  if (height > maxHeight) {
    height = maxHeight;
    width = Math.max(1, Math.round(height * aspectRatio));
  }

  return {
    width: Math.max(1, width),
    height: Math.max(1, height),
  };
}

export function resolvePlacementRect(
  output: RenderDimensions,
  placement: FrameImagePlacement,
): PlacementRect {
  const left = clamp(
    Math.round(output.width * placement.window.x),
    0,
    output.width - 1,
  );
  const top = clamp(
    Math.round(output.height * placement.window.y),
    0,
    output.height - 1,
  );
  const right = clamp(
    Math.round(output.width * (placement.window.x + placement.window.width)),
    left + 1,
    output.width,
  );
  const bottom = clamp(
    Math.round(output.height * (placement.window.y + placement.window.height)),
    top + 1,
    output.height,
  );

  return {
    left,
    top,
    width: Math.max(1, right - left),
    height: Math.max(1, bottom - top),
  };
}

export function resolveCompositeCrop(
  input: CompositeCropInput,
): CompositeCropResult | null {
  const overlayWidth = Math.max(1, Math.round(input.overlayWidth));
  const overlayHeight = Math.max(1, Math.round(input.overlayHeight));
  const canvasWidth = Math.max(1, Math.round(input.canvasWidth));
  const canvasHeight = Math.max(1, Math.round(input.canvasHeight));
  const overlayLeft = Math.round(input.overlayLeft);
  const overlayTop = Math.round(input.overlayTop);

  const targetLeft = clamp(overlayLeft, 0, canvasWidth);
  const targetTop = clamp(overlayTop, 0, canvasHeight);
  const inputLeft = clamp(-overlayLeft, 0, overlayWidth);
  const inputTop = clamp(-overlayTop, 0, overlayHeight);
  const inputWidth = Math.min(
    overlayWidth - inputLeft,
    canvasWidth - targetLeft,
  );
  const inputHeight = Math.min(
    overlayHeight - inputTop,
    canvasHeight - targetTop,
  );

  if (inputWidth <= 0 || inputHeight <= 0) {
    return null;
  }

  return {
    inputLeft,
    inputTop,
    inputWidth,
    inputHeight,
    targetLeft,
    targetTop,
  };
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}
