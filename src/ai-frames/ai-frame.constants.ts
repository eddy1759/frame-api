import { FrameOrientation } from '../frames/entities/frame-orientation.enum';

export const AI_FRAME_PROVIDER_DALLE3 = 'dalle3';
export const AI_FRAME_PROVIDER_STABLE_DIFFUSION = 'stable-diffusion';

export interface AiFrameAspectRatioPreset {
  aspectRatio: string;
  width: number;
  height: number;
  orientation: FrameOrientation;
}

export const AI_FRAME_ASPECT_RATIO_PRESETS: Record<
  string,
  AiFrameAspectRatioPreset
> = {
  '1:1': {
    aspectRatio: '1:1',
    width: 1080,
    height: 1080,
    orientation: FrameOrientation.SQUARE,
  },
  '16:9': {
    aspectRatio: '16:9',
    width: 1920,
    height: 1080,
    orientation: FrameOrientation.LANDSCAPE,
  },
  '9:16': {
    aspectRatio: '9:16',
    width: 1080,
    height: 1920,
    orientation: FrameOrientation.PORTRAIT,
  },
  '4:3': {
    aspectRatio: '4:3',
    width: 1440,
    height: 1080,
    orientation: FrameOrientation.LANDSCAPE,
  },
  '3:4': {
    aspectRatio: '3:4',
    width: 1080,
    height: 1440,
    orientation: FrameOrientation.PORTRAIT,
  },
  '3:2': {
    aspectRatio: '3:2',
    width: 1620,
    height: 1080,
    orientation: FrameOrientation.LANDSCAPE,
  },
  '2:3': {
    aspectRatio: '2:3',
    width: 1080,
    height: 1620,
    orientation: FrameOrientation.PORTRAIT,
  },
};

export const AI_FRAME_SUPPORTED_ASPECT_RATIOS = Object.keys(
  AI_FRAME_ASPECT_RATIO_PRESETS,
);

export function resolveAiFrameAspectRatioPreset(
  aspectRatio: string,
): AiFrameAspectRatioPreset {
  return (
    AI_FRAME_ASPECT_RATIO_PRESETS[aspectRatio] ??
    AI_FRAME_ASPECT_RATIO_PRESETS['1:1']
  );
}
