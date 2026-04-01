import {
  resolveCompositeCrop,
  resolveFramedRenderDimensions,
  resolvePlacementRect,
} from '../framed-render.util';

describe('framed-render.util', () => {
  it('fits framed render dimensions to the frame aspect ratio inside the variant bounds', () => {
    expect(
      resolveFramedRenderDimensions({ width: 1920, height: 1080 }, 300, 300),
    ).toEqual({
      width: 300,
      height: 169,
    });

    expect(
      resolveFramedRenderDimensions({ width: 1080, height: 1920 }, 300, 300),
    ).toEqual({
      width: 169,
      height: 300,
    });
  });

  it('converts normalized window placement into output pixel coordinates', () => {
    expect(
      resolvePlacementRect(
        { width: 200, height: 100 },
        {
          version: 1,
          fit: 'cover',
          window: {
            x: 0.1,
            y: 0.2,
            width: 0.6,
            height: 0.5,
          },
        },
      ),
    ).toEqual({
      left: 20,
      top: 20,
      width: 120,
      height: 50,
    });
  });

  it('clips oversized overlays to the visible portion of the destination canvas', () => {
    expect(
      resolveCompositeCrop({
        overlayLeft: 0,
        overlayTop: -2,
        overlayWidth: 225,
        overlayHeight: 284,
        canvasWidth: 225,
        canvasHeight: 131,
      }),
    ).toEqual({
      inputLeft: 0,
      inputTop: 2,
      inputWidth: 225,
      inputHeight: 131,
      targetLeft: 0,
      targetTop: 0,
    });
  });

  it('returns null when the overlay sits completely outside the canvas', () => {
    expect(
      resolveCompositeCrop({
        overlayLeft: 400,
        overlayTop: 0,
        overlayWidth: 100,
        overlayHeight: 100,
        canvasWidth: 200,
        canvasHeight: 100,
      }),
    ).toBeNull();
  });
});
