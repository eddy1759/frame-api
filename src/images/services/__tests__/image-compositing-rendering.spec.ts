/* eslint-disable @typescript-eslint/no-require-imports */
import sharp = require('sharp');

describe('image compositing rendering regression', () => {
  it('preserves the photo layer when applying the frame overlay', async () => {
    const photoBuffer = await sharp({
      create: {
        width: 60,
        height: 80,
        channels: 4,
        background: { r: 200, g: 0, b: 0, alpha: 1 },
      },
    })
      .png()
      .toBuffer();

    const overlayBuffer = Buffer.from(
      `
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">
          <path d="M0 0H100V100H0Z M20 10H80V90H20Z" fill="#111827" fill-rule="evenodd"/>
          <rect x="20" y="10" width="60" height="80" rx="3" fill="none" stroke="#f59e0b" stroke-width="2"/>
        </svg>
      `,
      'utf8',
    );

    const baseCanvasBuffer = await sharp({
      create: {
        width: 100,
        height: 100,
        channels: 4,
        background: { r: 0, g: 0, b: 0, alpha: 0 },
      },
    })
      .composite([
        {
          input: photoBuffer,
          left: 20,
          top: 10,
        },
      ])
      .png()
      .toBuffer();

    const finalBuffer = await sharp(baseCanvasBuffer)
      .composite([
        {
          input: overlayBuffer,
          left: 0,
          top: 0,
        },
      ])
      .flatten({ background: '#ffffff' })
      .png()
      .toBuffer();

    const centerPixel = await sharp(finalBuffer)
      .extract({ left: 50, top: 50, width: 1, height: 1 })
      .raw()
      .toBuffer();

    expect(centerPixel[0]).toBeGreaterThan(150);
    expect(centerPixel[1]).toBeLessThan(50);
    expect(centerPixel[2]).toBeLessThan(50);
  });
});
