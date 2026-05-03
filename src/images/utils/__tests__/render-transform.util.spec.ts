import {
  DEFAULT_RENDER_TRANSFORM,
  normalizeRenderTransform,
  resolveAutoOrientedDimensions,
  resolveRenderTransform,
  resolveTransformPlacement,
} from '../render-transform.util';

describe('render-transform.util', () => {
  it('rounds and clamps normalized transform values', () => {
    expect(
      normalizeRenderTransform({
        version: 1,
        zoom: 8,
        offsetX: 1.23456789,
        offsetY: -1.98765432,
        rotation: 270,
      }),
    ).toEqual({
      version: 1,
      zoom: 6,
      offsetX: 1,
      offsetY: -1,
      rotation: 180,
    });
  });

  it('resolves null stored transforms to the legacy centered default', () => {
    expect(resolveRenderTransform(null)).toEqual(DEFAULT_RENDER_TRANSFORM);
  });

  it('computes centered cover placement when zoom is 1 and offsets are 0', () => {
    expect(
      resolveTransformPlacement({
        sourceWidth: 400,
        sourceHeight: 200,
        windowWidth: 100,
        windowHeight: 100,
        transform: DEFAULT_RENDER_TRANSFORM,
      }),
    ).toMatchObject({
      scaledSourceWidth: 200,
      scaledSourceHeight: 100,
      left: -50,
      top: 0,
    });
  });

  it('applies translation and rotation deterministically inside legal bounds', () => {
    const placement = resolveTransformPlacement({
      sourceWidth: 1080,
      sourceHeight: 1920,
      windowWidth: 540,
      windowHeight: 960,
      transform: {
        version: 1,
        zoom: 1.5,
        offsetX: 0.5,
        offsetY: -0.25,
        rotation: 15,
      },
    });

    expect(placement.scaledSourceWidth).toBeGreaterThan(540);
    expect(placement.rotatedWidth).toBeGreaterThanOrEqual(540);
    expect(placement.rotatedHeight).toBeGreaterThanOrEqual(960);
    expect(placement.left).toBeLessThanOrEqual(0);
    expect(placement.top).toBeLessThanOrEqual(0);
  });

  it('resolves auto-oriented dimensions for EXIF-rotated images', () => {
    expect(
      resolveAutoOrientedDimensions({
        width: 3024,
        height: 4032,
        orientation: 6,
      }),
    ).toEqual({
      width: 4032,
      height: 3024,
    });
  });
});
