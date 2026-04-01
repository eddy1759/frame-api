import {
  normalizeFrameMetadata,
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
});
