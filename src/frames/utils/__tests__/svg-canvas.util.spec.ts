import {
  extractSvgCanvasDimensions,
  isAspectRatioCompatible,
} from '../svg-canvas.util';

describe('svg-canvas.util', () => {
  it('extracts canvas dimensions from the viewBox when present', () => {
    expect(
      extractSvgCanvasDimensions(
        '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1920 1080"><rect width="1920" height="1080" /></svg>',
      ),
    ).toEqual({
      width: 1920,
      height: 1080,
    });
  });

  it('falls back to explicit width and height when no viewBox exists', () => {
    expect(
      extractSvgCanvasDimensions(
        '<svg xmlns="http://www.w3.org/2000/svg" width="1080" height="1920"><rect width="1080" height="1920" /></svg>',
      ),
    ).toEqual({
      width: 1080,
      height: 1920,
    });
  });

  it('throws when the SVG defines no usable canvas', () => {
    expect(() =>
      extractSvgCanvasDimensions(
        '<svg xmlns="http://www.w3.org/2000/svg"><rect width="10" height="10" /></svg>',
      ),
    ).toThrow(
      'SVG must define a positive viewBox or explicit width and height.',
    );
  });

  it('checks aspect-ratio compatibility with tolerance', () => {
    expect(
      isAspectRatioCompatible(
        { width: 1920, height: 1080 },
        { width: 1918, height: 1080 },
      ),
    ).toBe(true);
    expect(
      isAspectRatioCompatible(
        { width: 1920, height: 1080 },
        { width: 1080, height: 1920 },
      ),
    ).toBe(false);
  });
});
