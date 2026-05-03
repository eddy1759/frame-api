import { BadRequestException } from '@nestjs/common';
import { FrameCompositorService } from '../frame-compositor.service';

describe('FrameCompositorService', () => {
  let service: FrameCompositorService;

  beforeEach(() => {
    service = new FrameCompositorService();
  });

  it('removes unsafe markup from uploaded SVG', () => {
    const result = service.sanitizeUploadedSvg(`
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1080 1920" onload="alert(1)">
        <script>alert('xss')</script>
        <foreignObject><div>bad</div></foreignObject>
        <use href="https://evil.example/resource.svg#id" />
        <image href="https://evil.example/image.png" />
        <rect width="100" height="100" />
      </svg>
    `);

    expect(result).not.toContain('<script');
    expect(result).not.toContain('<foreignObject');
    expect(result).not.toContain('<use');
    expect(result).not.toContain('<image');
    expect(result).not.toMatch(/\sonload=/i);
    expect(result).not.toContain('evil.example');
  });

  it('preserves safe gradient markup used by frame overlays', () => {
    const result = service.sanitizeUploadedSvg(`
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1080 1920">
        <defs>
          <linearGradient id="frameFill" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stop-color="#111827" />
            <stop offset="100%" stop-color="#374151" stop-opacity="0.9" />
          </linearGradient>
        </defs>
        <path d="M0 0H1080V1920H0Z M140 260H940V1660H140Z" fill="url(#frameFill)" fill-rule="evenodd" />
      </svg>
    `);

    expect(result).toContain('<linearGradient');
    expect(result).toContain('id="frameFill"');
    expect(result).toContain('fill="url(#frameFill)"');
    expect(result).toContain('fill-rule="evenodd"');
  });

  it('builds an SVG overlay with embedded generated PNG and image placement metadata', () => {
    const result = service.buildGeneratedFrameSvg(
      Buffer.from('png-binary'),
      1080,
      1920,
      0.125,
    );

    expect(result.svg).toContain('data:image/png;base64,');
    expect(result.metadata.imagePlacement).toBeDefined();
    expect(result.metadata.imagePlacement?.window).toEqual({
      x: 0.125,
      y: 0.125,
      width: 0.75,
      height: 0.75,
    });
  });

  it('infers rectangular image placement from a mock frame aperture path', () => {
    const result = service.inferImagePlacementFromSvg(
      `
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1080 1080">
          <path d="M0 0H1080V1080H0Z M140 140H940V940H140Z" fill="#111827" fill-rule="evenodd" />
        </svg>
      `,
      1080,
      1080,
    );

    expect(result).toEqual({
      version: 1,
      fit: 'cover',
      window: {
        x: 0.1296296296,
        y: 0.1296296296,
        width: 0.7407407407,
        height: 0.7407407407,
      },
    });
  });

  it('moves a title box below the image window when its rendered baseline lands inside the photo area', () => {
    const result = service.normalizeTitleConfigForImagePlacement(
      {
        text: 'Wedding anniversary',
        fontFamily: 'Inter',
        fontSizeRatio: 0.05,
        color: '#ffffff',
        position: {
          x: 0.1,
          y: 0.78,
          width: 0.8,
          height: 0.08,
        },
        align: 'center',
      },
      {
        version: 1,
        fit: 'cover',
        window: {
          x: 0.1296296296,
          y: 0.1296296296,
          width: 0.7407407407,
          height: 0.7407407407,
        },
      },
    );

    expect(result.position).toEqual({
      x: 0.1,
      y: 0.8951851852,
      width: 0.8,
      height: 0.08,
    });
  });

  it('adds a title overlay layer and replaces any previous generated title layer', () => {
    const result = service.composeTitleOverlay(
      `
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1080 1920">
          <rect width="1080" height="1920" fill="#14532d" />
          <g id="__frame_api_title_layer__">
            <text x="540" y="1720">Old Title</text>
          </g>
        </svg>
      `,
      {
        text: 'Edet Wedding Anniversary',
        fontFamily: 'Playfair Display',
        fontWeight: 700,
        fontSizeRatio: 0.035,
        color: '#ffffff',
        position: {
          x: 0.18,
          y: 0.84,
          width: 0.64,
          height: 0.08,
        },
        align: 'center',
      },
      1080,
      1920,
    );

    expect(result).toContain('id="__frame_api_title_layer__"');
    expect(result).toContain('Edet Wedding Anniversary');
    expect(result).not.toContain('Old Title');
    expect(result).toContain('font-family="Playfair Display"');
    expect(result).toContain('text-anchor="middle"');
  });

  it('strips a frontend-style duplicate title before adding the backend title layer', () => {
    const result = service.composeTitleOverlay(
      `
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1920 1080">
          <rect width="1920" height="1080" fill="#14532d" />
          <text x="960" y="972" font-family="Inter" font-size="96" font-weight="normal" fill="#ffffff" text-anchor="middle">
            Graduation
          </text>
          <text x="120" y="100" font-family="Inter" font-size="42" fill="#facc15">
            Class of 2026
          </text>
        </svg>
      `,
      {
        text: 'Graduation',
        fontFamily: 'Inter',
        fontSizeRatio: 0.05,
        color: '#ffffff',
        position: {
          x: 0.1,
          y: 0.85,
          width: 0.8,
          height: 0.1,
        },
        align: 'center',
      },
      1920,
      1080,
    );

    expect(result).toContain('id="__frame_api_title_layer__"');
    expect(result).toContain('y="972"');
    expect(result).toContain('Class of 2026');
    expect(result).not.toContain('font-size="96"');
    expect(result).toContain('font-size="54"');
    expect(result.match(/>Graduation</g) ?? []).toHaveLength(1);
  });

  it('ellipsizes long title text to fit the configured title box', () => {
    const result = service.composeTitleOverlay(
      `
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1080 1920">
          <rect width="1080" height="1920" fill="#14532d" />
        </svg>
      `,
      {
        text: 'This anniversary title is intentionally much longer than the configured text box should ever comfortably render in a single line',
        fontFamily: 'Playfair Display',
        fontSizeRatio: 0.06,
        color: '#ffffff',
        position: {
          x: 0.2,
          y: 0.84,
          width: 0.22,
          height: 0.06,
        },
        align: 'left',
      },
      1080,
      1920,
    );

    expect(result).toContain('...');
    expect(result).toContain('text-anchor="start"');
  });

  it('rejects empty title text when composing an overlay', () => {
    expect(() =>
      service.composeTitleOverlay(
        '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1080 1920"></svg>',
        {
          text: '   ',
          fontFamily: 'Playfair Display',
          fontSizeRatio: 0.05,
          color: '#ffffff',
          position: {
            x: 0.2,
            y: 0.84,
            width: 0.64,
            height: 0.08,
          },
          align: 'center',
        },
        1080,
        1920,
      ),
    ).toThrow(BadRequestException);
  });

  it('rejects SVGs whose aspect ratio does not match the frame dimensions', () => {
    expect(() =>
      service.validateAspectRatio(
        '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1920 1080"></svg>',
        1080,
        1920,
      ),
    ).toThrow(BadRequestException);
  });
});
