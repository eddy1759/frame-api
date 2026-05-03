import {
  isDefaultFrameImagePlacement,
  normalizeFrameMetadata,
  resolveFrameRenderMode,
  resolveFrameScenePlacementStatus,
  resolveFrameTitleConfig,
  resolveFrameImagePlacement,
} from '../frame-metadata.util';

describe('frame-metadata.util', () => {
  it('normalizes valid image placement metadata while preserving other keys', () => {
    const metadata = normalizeFrameMetadata({
      style: 'dynamic',
      imagePlacement: {
        version: 1,
        fit: 'cover',
        window: {
          x: 0.125,
          y: 0.1111111111,
          width: 0.75,
          height: 0.7777777778,
        },
      },
    });

    expect(metadata).toEqual({
      style: 'dynamic',
      imagePlacement: {
        version: 1,
        fit: 'cover',
        window: {
          x: 0.125,
          y: 0.1111111111,
          width: 0.75,
          height: 0.7777777778,
        },
      },
    });
  });

  it('rejects out-of-bounds image placement metadata', () => {
    expect(() =>
      normalizeFrameMetadata({
        imagePlacement: {
          version: 1,
          fit: 'cover',
          window: {
            x: 0.5,
            y: 0.2,
            width: 0.7,
            height: 0.7,
          },
        },
      }),
    ).toThrow();
  });

  it('falls back to a full-canvas placement when no metadata is present', () => {
    expect(resolveFrameImagePlacement({ style: 'legacy' })).toEqual({
      version: 1,
      fit: 'cover',
      window: {
        x: 0,
        y: 0,
        width: 1,
        height: 1,
      },
    });
  });

  it('detects the legacy full-canvas default placement', () => {
    expect(
      isDefaultFrameImagePlacement({
        version: 1,
        fit: 'cover',
        window: {
          x: 0,
          y: 0,
          width: 1,
          height: 1,
        },
      }),
    ).toBe(true);

    expect(
      isDefaultFrameImagePlacement({
        version: 1,
        fit: 'cover',
        window: {
          x: 0.1296296296,
          y: 0.1296296296,
          width: 0.7407407407,
          height: 0.7407407407,
        },
      }),
    ).toBe(false);
  });

  it('normalizes title configuration and personalization metadata', () => {
    const metadata = normalizeFrameMetadata({
      titleConfig: {
        text: '  Edet   Wedding Anniversary  ',
        fontFamily: 'Playfair Display',
        fontWeight: 700,
        fontSizeRatio: 0.05,
        color: '#ffffff',
        position: {
          x: 0.18,
          y: 0.84,
          width: 0.64,
          height: 0.08,
        },
        align: 'center',
      },
      personalization: {
        kind: 'title-customization',
        sourceFrameId: '11111111-1111-4111-8111-111111111111',
        customTitle: '  Edet   Wedding Anniversary ',
      },
    });

    expect(metadata).toEqual({
      titleConfig: {
        text: 'Edet Wedding Anniversary',
        fontFamily: 'Playfair Display',
        fontWeight: 700,
        fontSizeRatio: 0.05,
        color: '#ffffff',
        position: {
          x: 0.18,
          y: 0.84,
          width: 0.64,
          height: 0.08,
        },
        align: 'center',
      },
      personalization: {
        kind: 'title-customization',
        sourceFrameId: '11111111-1111-4111-8111-111111111111',
        customTitle: 'Edet Wedding Anniversary',
      },
    });
  });

  it('rejects invalid title configuration metadata', () => {
    expect(() =>
      normalizeFrameMetadata({
        titleConfig: {
          text: 'Anniversary',
          fontFamily: 'Playfair Display',
          fontSizeRatio: 0.7,
          color: '#ffffff',
          position: {
            x: 0.18,
            y: 0.84,
            width: 0.64,
            height: 0.08,
          },
          align: 'center',
        },
      }),
    ).toThrow();
  });

  it('resolves missing title configuration as null', () => {
    expect(resolveFrameTitleConfig({ style: 'legacy' })).toBeNull();
  });

  it('normalizes valid scene placement metadata and infers scene status', () => {
    const metadata = normalizeFrameMetadata({
      renderMode: 'scene',
      scenePlacement: {
        version: 1,
        transform: 'affine-quad',
        fit: 'cover',
        corners: {
          topLeft: { x: 0.2, y: 0.2 },
          topRight: { x: 0.8, y: 0.2 },
          bottomRight: { x: 0.8, y: 0.8 },
          bottomLeft: { x: 0.2, y: 0.8 },
        },
      },
    });

    expect(resolveFrameRenderMode(metadata)).toBe('scene');
    expect(resolveFrameScenePlacementStatus(metadata)).toBe('ready');
    expect(metadata.scenePlacement).toEqual({
      version: 1,
      transform: 'affine-quad',
      fit: 'cover',
      corners: {
        topLeft: { x: 0.2, y: 0.2 },
        topRight: { x: 0.8, y: 0.2 },
        bottomRight: { x: 0.8, y: 0.8 },
        bottomLeft: { x: 0.2, y: 0.8 },
      },
    });
  });

  it('rejects scene placements that are too perspective-skewed for affine rendering', () => {
    expect(() =>
      normalizeFrameMetadata({
        renderMode: 'scene',
        scenePlacement: {
          version: 1,
          transform: 'affine-quad',
          fit: 'cover',
          corners: {
            topLeft: { x: 0.2, y: 0.2 },
            topRight: { x: 0.75, y: 0.18 },
            bottomRight: { x: 0.92, y: 0.88 },
            bottomLeft: { x: 0.22, y: 0.82 },
          },
        },
      }),
    ).toThrow();
  });
});
