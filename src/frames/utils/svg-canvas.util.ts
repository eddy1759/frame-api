import { DOMParser } from '@xmldom/xmldom';

export interface SvgCanvasDimensions {
  width: number;
  height: number;
}

export const SVG_ASPECT_RATIO_TOLERANCE = 0.02;

function parseLength(raw: string | null): number | null {
  if (!raw) {
    return null;
  }

  const trimmed = raw.trim();
  const match = trimmed.match(/^([+-]?\d*\.?\d+)(px)?$/i);
  if (!match) {
    return null;
  }

  const value = Number(match[1]);
  return Number.isFinite(value) && value > 0 ? value : null;
}

export function extractSvgCanvasDimensions(
  svg: string | Buffer,
): SvgCanvasDimensions {
  const content = Buffer.isBuffer(svg) ? svg.toString('utf8') : svg;
  const document = new DOMParser().parseFromString(content, 'image/svg+xml');
  const root = document.documentElement;

  if (!root || root.nodeName.toLowerCase() !== 'svg') {
    throw new Error('SVG root element is missing.');
  }

  const viewBox = root.getAttribute('viewBox');
  if (viewBox) {
    const parts = viewBox
      .trim()
      .split(/[\s,]+/)
      .map((value) => Number(value));
    if (
      parts.length === 4 &&
      parts.every((value) => Number.isFinite(value)) &&
      parts[2] > 0 &&
      parts[3] > 0
    ) {
      return {
        width: parts[2],
        height: parts[3],
      };
    }
  }

  const width = parseLength(root.getAttribute('width'));
  const height = parseLength(root.getAttribute('height'));

  if (width && height) {
    return { width, height };
  }

  throw new Error(
    'SVG must define a positive viewBox or explicit width and height.',
  );
}

export function isAspectRatioCompatible(
  expected: SvgCanvasDimensions,
  actual: SvgCanvasDimensions,
  tolerance = SVG_ASPECT_RATIO_TOLERANCE,
): boolean {
  const expectedRatio = expected.width / expected.height;
  const actualRatio = actual.width / actual.height;
  return Math.abs(actualRatio - expectedRatio) / expectedRatio <= tolerance;
}
