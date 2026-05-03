import { mkdirSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { FrameImagePlacement } from '../src/frames/utils/frame-metadata.util';
import { extractSvgCanvasDimensions } from '../src/frames/utils/svg-canvas.util';

type FramePalette = {
  frameStart: string;
  frameEnd: string;
  accent: string;
  accentSoft: string;
  shadow: string;
};

export type CategoryFrameSpec = {
  categorySlug: string;
  slug: string;
  fileName: string;
  width: number;
  height: number;
  palette: FramePalette;
  placement: FrameImagePlacement['window'];
};

export const DEFAULT_SAMPLE_DIR = resolve(process.cwd(), 'sample-svgs');

const PORTRAIT_PLACEMENT: FrameImagePlacement['window'] = {
  x: 0.1296296296,
  y: 0.1354166667,
  width: 0.7407407407,
  height: 0.7291666667,
};

const SQUARE_PLACEMENT: FrameImagePlacement['window'] = {
  x: 0.1296296296,
  y: 0.1296296296,
  width: 0.7407407407,
  height: 0.7407407407,
};

const LANDSCAPE_PLACEMENT: FrameImagePlacement['window'] = {
  x: 0.125,
  y: 0.1111111111,
  width: 0.75,
  height: 0.7777777778,
};

export const CATEGORY_FRAME_SPECS: CategoryFrameSpec[] = [
  {
    categorySlug: 'political',
    slug: 'political-banner-classic',
    fileName: 'political.svg',
    width: 1920,
    height: 1080,
    placement: LANDSCAPE_PLACEMENT,
    palette: {
      frameStart: '#0b132b',
      frameEnd: '#1d4ed8',
      accent: '#fbbf24',
      accentSoft: '#f8fafc',
      shadow: '#1d4ed8',
    },
  },
  {
    categorySlug: 'wedding',
    slug: 'wedding-floral-gold',
    fileName: 'wedding.svg',
    width: 1080,
    height: 1920,
    placement: PORTRAIT_PLACEMENT,
    palette: {
      frameStart: '#fff1f2',
      frameEnd: '#f472b6',
      accent: '#be185d',
      accentSoft: '#fbcfe8',
      shadow: '#f472b6',
    },
  },
  {
    categorySlug: 'movement',
    slug: 'movement-neon-pulse',
    fileName: 'movement.svg',
    width: 1080,
    height: 1080,
    placement: SQUARE_PLACEMENT,
    palette: {
      frameStart: '#0f172a',
      frameEnd: '#16a34a',
      accent: '#22c55e',
      accentSoft: '#e2e8f0',
      shadow: '#16a34a',
    },
  },
  {
    categorySlug: 'religion',
    slug: 'religion-minimal-light',
    fileName: 'religion.svg',
    width: 1080,
    height: 1920,
    placement: PORTRAIT_PLACEMENT,
    palette: {
      frameStart: '#f8fafc',
      frameEnd: '#f59e0b',
      accent: '#b45309',
      accentSoft: '#fde68a',
      shadow: '#d97706',
    },
  },
  {
    categorySlug: 'birthday',
    slug: 'birthday-confetti-pop',
    fileName: 'birthday.svg',
    width: 1080,
    height: 1080,
    placement: SQUARE_PLACEMENT,
    palette: {
      frameStart: '#fee2e2',
      frameEnd: '#fb7185',
      accent: '#7c3aed',
      accentSoft: '#fde68a',
      shadow: '#f43f5e',
    },
  },
  {
    categorySlug: 'graduation',
    slug: 'graduation-ribbon-honor',
    fileName: 'graduation.svg',
    width: 1920,
    height: 1080,
    placement: LANDSCAPE_PLACEMENT,
    palette: {
      frameStart: '#1e293b',
      frameEnd: '#0f172a',
      accent: '#f59e0b',
      accentSoft: '#f8fafc',
      shadow: '#334155',
    },
  },
  {
    categorySlug: 'holiday',
    slug: 'holiday-frost-sparkle',
    fileName: 'holiday.svg',
    width: 1080,
    height: 1920,
    placement: PORTRAIT_PLACEMENT,
    palette: {
      frameStart: '#0f766e',
      frameEnd: '#14b8a6',
      accent: '#e2e8f0',
      accentSoft: '#ccfbf1',
      shadow: '#115e59',
    },
  },
  {
    categorySlug: 'sports',
    slug: 'sports-arena-lights',
    fileName: 'sports.svg',
    width: 1920,
    height: 1080,
    placement: LANDSCAPE_PLACEMENT,
    palette: {
      frameStart: '#111827',
      frameEnd: '#374151',
      accent: '#f3f4f6',
      accentSoft: '#3b82f6',
      shadow: '#4b5563',
    },
  },
  {
    categorySlug: 'nature',
    slug: 'nature-forest-dew',
    fileName: 'nature.svg',
    width: 1080,
    height: 1920,
    placement: PORTRAIT_PLACEMENT,
    palette: {
      frameStart: '#14532d',
      frameEnd: '#4d7c0f',
      accent: '#dcfce7',
      accentSoft: '#86efac',
      shadow: '#166534',
    },
  },
  {
    categorySlug: 'abstract',
    slug: 'abstract-gradient-flow',
    fileName: 'abstract.svg',
    width: 1080,
    height: 1080,
    placement: SQUARE_PLACEMENT,
    palette: {
      frameStart: '#111827',
      frameEnd: '#7c3aed',
      accent: '#fda4af',
      accentSoft: '#bfdbfe',
      shadow: '#7c3aed',
    },
  },
];

export function normalizeCategorySelector(value: string): string {
  return value.trim().toLowerCase();
}

export function resolveCategoryFrameSpecs(
  selectors?: string[],
): CategoryFrameSpec[] {
  if (!selectors || selectors.length === 0) {
    return [...CATEGORY_FRAME_SPECS];
  }

  const normalizedSelectors = selectors.map(normalizeCategorySelector);
  const matched = CATEGORY_FRAME_SPECS.filter((spec) => {
    const baseName = spec.fileName.replace(/\.svg$/i, '');
    return normalizedSelectors.some(
      (selector) =>
        selector === spec.categorySlug ||
        selector === spec.slug ||
        selector === spec.fileName.toLowerCase() ||
        selector === baseName.toLowerCase(),
    );
  });

  if (matched.length !== normalizedSelectors.length) {
    const matchedSelectors = new Set<string>();
    for (const spec of matched) {
      matchedSelectors.add(spec.categorySlug);
      matchedSelectors.add(spec.slug);
      matchedSelectors.add(spec.fileName.toLowerCase());
      matchedSelectors.add(spec.fileName.replace(/\.svg$/i, '').toLowerCase());
    }

    const missing = normalizedSelectors.filter(
      (selector) => !matchedSelectors.has(selector),
    );

    if (missing.length > 0) {
      throw new Error(
        `Unknown category/frame selector(s): ${missing.join(', ')}. Available categories: ${CATEGORY_FRAME_SPECS.map((spec) => spec.categorySlug).join(', ')}`,
      );
    }
  }

  return matched;
}

export function buildCategoryFrameSvg(spec: CategoryFrameSpec): string {
  const placement = toPlacementPixels(spec.width, spec.height, spec.placement);
  const minSide = Math.min(spec.width, spec.height);
  const outerInset = Math.round(minSide * 0.028);
  const cornerRadius = Math.round(minSide * 0.045);
  const borderStroke = Math.max(10, Math.round(minSide * 0.012));
  const accentStroke = Math.max(8, Math.round(minSide * 0.008));
  const railWidth = Math.max(28, Math.round(minSide * 0.048));
  const railHeight = Math.max(
    120,
    Math.round(placement.height * (spec.width > spec.height ? 0.82 : 0.94)),
  );
  const railY = placement.top + Math.round((placement.height - railHeight) / 2);
  const topY = Math.round(minSide * 0.1);
  const bottomY = spec.height - Math.round(minSide * 0.12);
  const circleRadius = Math.max(18, Math.round(minSide * 0.026));
  const ringPath = `M0 0H${spec.width}V${spec.height}H0Z M${placement.left} ${placement.top}H${placement.right}V${placement.bottom}H${placement.left}Z`;

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${spec.width} ${spec.height}" width="${spec.width}" height="${spec.height}">
  <defs>
    <linearGradient id="frameFill" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="${spec.palette.frameStart}" />
      <stop offset="100%" stop-color="${spec.palette.frameEnd}" />
    </linearGradient>
    <linearGradient id="edgeGlow" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="${spec.palette.accent}" stop-opacity="0.9" />
      <stop offset="100%" stop-color="${spec.palette.accent}" stop-opacity="0.25" />
    </linearGradient>
  </defs>
  <path d="${ringPath}" fill="url(#frameFill)" fill-rule="evenodd" />
  <rect x="${outerInset}" y="${outerInset}" width="${spec.width - outerInset * 2}" height="${spec.height - outerInset * 2}" rx="${cornerRadius}" fill="none" stroke="url(#edgeGlow)" stroke-width="${borderStroke}" />
  <rect x="${placement.left}" y="${placement.top}" width="${placement.width}" height="${placement.height}" rx="${Math.round(cornerRadius * 0.6)}" fill="none" stroke="${spec.palette.accent}" stroke-opacity="0.75" stroke-width="${accentStroke}" />
  <rect x="${outerInset + 16}" y="${railY}" width="${railWidth}" height="${railHeight}" rx="${Math.round(railWidth / 2)}" fill="${spec.palette.shadow}" opacity="0.4" />
  <rect x="${spec.width - outerInset - railWidth - 16}" y="${railY}" width="${railWidth}" height="${railHeight}" rx="${Math.round(railWidth / 2)}" fill="${spec.palette.shadow}" opacity="0.4" />
  <circle cx="${Math.round(spec.width * 0.24)}" cy="${topY}" r="${circleRadius}" fill="${spec.palette.accentSoft}" opacity="0.72" />
  <circle cx="${Math.round(spec.width * 0.5)}" cy="${Math.round(topY * 0.92)}" r="${Math.round(circleRadius * 1.3)}" fill="${spec.palette.accent}" opacity="0.56" />
  <circle cx="${Math.round(spec.width * 0.76)}" cy="${topY}" r="${circleRadius}" fill="${spec.palette.accentSoft}" opacity="0.72" />
  <line x1="${Math.round(spec.width * 0.24)}" y1="${bottomY}" x2="${Math.round(spec.width * 0.76)}" y2="${bottomY}" stroke="${spec.palette.accentSoft}" stroke-width="${Math.max(6, Math.round(minSide * 0.007))}" stroke-linecap="round" opacity="0.55" />
  <line x1="${Math.round(spec.width * 0.3)}" y1="${bottomY + Math.round(minSide * 0.03)}" x2="${Math.round(spec.width * 0.7)}" y2="${bottomY + Math.round(minSide * 0.03)}" stroke="${spec.palette.accent}" stroke-width="${Math.max(4, Math.round(minSide * 0.005))}" stroke-linecap="round" opacity="0.5" />
</svg>
`;

  assertGeneratedSvgCanvas(spec, svg);
  return svg;
}

export function writeCategoryFrameSvgFiles(options?: {
  outputDir?: string;
  selectors?: string[];
}): Array<{ spec: CategoryFrameSpec; filePath: string }> {
  const outputDir = resolve(process.cwd(), options?.outputDir ?? 'sample-svgs');
  mkdirSync(outputDir, { recursive: true });

  return resolveCategoryFrameSpecs(options?.selectors).map((spec) => {
    const filePath = join(outputDir, spec.fileName);
    writeFileSync(filePath, buildCategoryFrameSvg(spec), 'utf8');
    return { spec, filePath };
  });
}

function toPlacementPixels(
  width: number,
  height: number,
  placement: FrameImagePlacement['window'],
): {
  left: number;
  top: number;
  right: number;
  bottom: number;
  width: number;
  height: number;
} {
  const left = Math.round(width * placement.x);
  const top = Math.round(height * placement.y);
  const right = Math.round(width * (placement.x + placement.width));
  const bottom = Math.round(height * (placement.y + placement.height));

  return {
    left,
    top,
    right,
    bottom,
    width: right - left,
    height: bottom - top,
  };
}

function assertGeneratedSvgCanvas(spec: CategoryFrameSpec, svg: string): void {
  if (!/\bviewBox=/.test(svg)) {
    throw new Error(
      `Generated SVG for ${spec.categorySlug} is missing a viewBox attribute.`,
    );
  }

  const canvas = extractSvgCanvasDimensions(svg);
  if (
    Math.round(canvas.width) !== spec.width ||
    Math.round(canvas.height) !== spec.height
  ) {
    throw new Error(
      `Generated SVG canvas mismatch for ${spec.categorySlug}: expected ${spec.width}x${spec.height}, received ${canvas.width}x${canvas.height}.`,
    );
  }
}
