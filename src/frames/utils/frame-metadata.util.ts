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

export interface FrameMetadata extends Record<string, unknown> {
  imagePlacement?: FrameImagePlacement;
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

export function snapshotFrameImagePlacement(
  placement: FrameImagePlacement,
): FrameImagePlacement {
  return clonePlacement(placement);
}
