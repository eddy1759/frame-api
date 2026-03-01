import { BadRequestException, NotFoundException } from '@nestjs/common';
import { Repository } from 'typeorm';
import { Frame } from '../../entities/frame.entity';
import { FrameAsset } from '../../entities/frame-asset.entity';
import { FrameAssetsService } from '../frame-assets.service';
import { StoragePort } from '../../../common/services';
import { FramesCacheService } from '../frames-cache.service';
import { FrameOrientation } from '../../entities/frame-orientation.enum';

describe('FrameAssetsService', () => {
  let service: FrameAssetsService;
  let frameRepository: jest.Mocked<Repository<Frame>>;
  let frameAssetRepository: jest.Mocked<Repository<FrameAsset>>;
  let storageService: jest.Mocked<StoragePort>;
  let framesCacheService: jest.Mocked<FramesCacheService>;

  const makeFrame = (overrides: Partial<Frame> = {}): Frame =>
    ({
      id: 'frame-1',
      name: 'Sample Frame',
      slug: 'sample-frame',
      description: null,
      isPremium: false,
      price: null,
      currency: 'USD',
      width: 1080,
      height: 1920,
      aspectRatio: '9:16',
      orientation: FrameOrientation.PORTRAIT,
      metadata: {},
      viewCount: 0,
      applyCount: 0,
      isActive: true,
      isAiGenerated: false,
      sortOrder: 0,
      svgUrl: null,
      thumbnailUrl: null,
      createdById: null,
      createdBy: null,
      categories: [],
      tags: [],
      assets: [],
      savedByUsers: [],
      createdAt: new Date('2026-01-01T00:00:00.000Z'),
      updatedAt: new Date('2026-01-01T00:00:00.000Z'),
      ...overrides,
    }) as Frame;

  beforeEach(() => {
    frameRepository = {
      findOne: jest.fn(),
      save: jest.fn(),
    } as unknown as jest.Mocked<Repository<Frame>>;

    frameAssetRepository = {
      delete: jest.fn(),
      create: jest.fn((value: unknown) => value as FrameAsset),
      save: jest.fn(),
    } as unknown as jest.Mocked<Repository<FrameAsset>>;

    storageService = {
      uploadBuffer: jest.fn(),
    } as unknown as jest.Mocked<StoragePort>;

    framesCacheService = {
      invalidateFrame: jest.fn(),
    } as unknown as jest.Mocked<FramesCacheService>;

    service = new FrameAssetsService(
      frameRepository,
      frameAssetRepository,
      storageService,
      framesCacheService,
    );
  });

  it('throws when frame does not exist', async () => {
    frameRepository.findOne.mockResolvedValueOnce(null);

    await expect(
      service.uploadSvgAsset('missing-frame', {
        buffer: Buffer.from('<svg/>'),
        size: 6,
      }),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('throws when file is not provided', async () => {
    frameRepository.findOne.mockResolvedValueOnce(makeFrame());

    await expect(
      service.uploadSvgAsset('frame-1', undefined as never),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('throws when file is larger than 5MB', async () => {
    frameRepository.findOne.mockResolvedValueOnce(makeFrame());

    await expect(
      service.uploadSvgAsset('frame-1', {
        buffer: Buffer.from('<svg/>'),
        size: 5 * 1024 * 1024 + 1,
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('rejects non-SVG XML payloads', async () => {
    frameRepository.findOne.mockResolvedValueOnce(makeFrame());

    await expect(
      service.uploadSvgAsset('frame-1', {
        buffer: Buffer.from('<html><body>not-svg</body></html>'),
        size: 33,
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('sanitizes malicious SVG and uploads all derived assets', async () => {
    const frame = makeFrame();
    frameRepository.findOne.mockResolvedValueOnce(frame);
    frameRepository.save.mockResolvedValueOnce(
      makeFrame({
        svgUrl:
          'http://localhost:9000/frame-assets/frames/frame-1/original.svg',
        thumbnailUrl:
          'http://localhost:9000/frame-assets/frames/frame-1/thumbnail-md.png',
      }),
    );

    const uploadMock = storageService.uploadBuffer as jest.Mock;
    uploadMock.mockImplementation(
      (key: string, body: Buffer) =>
        ({
          key,
          size: body.byteLength,
          url: `http://localhost:9000/frame-assets/${key}`,
        }) as { key: string; size: number; url: string },
    );

    jest
      .spyOn(
        service as unknown as {
          createThumbnail: (...args: unknown[]) => Promise<unknown>;
        },
        'createThumbnail',
      )
      .mockResolvedValueOnce({
        buffer: Buffer.from('png-sm'),
        width: 120,
        height: 150,
      })
      .mockResolvedValueOnce({
        buffer: Buffer.from('png-md'),
        width: 240,
        height: 300,
      })
      .mockResolvedValueOnce({
        buffer: Buffer.from('png-lg'),
        width: 480,
        height: 600,
      });

    const maliciousSvg = `
      <svg xmlns="http://www.w3.org/2000/svg" onload="alert(1)">
        <script>alert('xss')</script>
        <use href="https://evil.example/resource.svg#id" />
        <foreignObject><div>bad</div></foreignObject>
        <image href="https://evil.example/image.png" />
        <rect width="10" height="10" style="fill:url(https://evil.example/style.png)" />
      </svg>
    `;

    const result = await service.uploadSvgAsset('frame-1', {
      buffer: Buffer.from(maliciousSvg, 'utf8'),
      size: Buffer.byteLength(maliciousSvg),
      mimetype: 'image/svg+xml',
      originalname: 'malicious.svg',
    });

    expect(storageService.uploadBuffer).toHaveBeenCalledTimes(4);
    expect(frameAssetRepository.delete).toHaveBeenCalledWith({
      frameId: 'frame-1',
    });
    expect(frameAssetRepository.save).toHaveBeenCalledTimes(1);
    expect(frameRepository.save).toHaveBeenCalledTimes(1);
    expect(framesCacheService.invalidateFrame).toHaveBeenCalledWith(
      'frame-1',
      'sample-frame',
    );

    const [svgKey, svgBuffer] = uploadMock.mock.calls[0] as [string, Buffer];
    const sanitized = svgBuffer.toString('utf8');

    expect(svgKey).toBe('frames/frame-1/original.svg');
    expect(sanitized).not.toContain('<script');
    expect(sanitized).not.toContain('<use');
    expect(sanitized).not.toContain('<foreignObject');
    expect(sanitized).not.toMatch(/\son\w+=/i);
    expect(sanitized).not.toMatch(/https?:\/\/evil\.example/i);

    expect(result).toEqual({
      svgUrl: 'http://localhost:9000/frame-assets/frames/frame-1/original.svg',
      thumbnails: {
        small:
          'http://localhost:9000/frame-assets/frames/frame-1/thumbnail-sm.png',
        medium:
          'http://localhost:9000/frame-assets/frames/frame-1/thumbnail-md.png',
        large:
          'http://localhost:9000/frame-assets/frames/frame-1/thumbnail-lg.png',
      },
    });
  });

  it('strips xlink/src/javascript references and external css urls', async () => {
    const frame = makeFrame();
    frameRepository.findOne.mockResolvedValueOnce(frame);
    frameRepository.save.mockResolvedValueOnce(
      makeFrame({
        svgUrl:
          'http://localhost:9000/frame-assets/frames/frame-1/original.svg',
        thumbnailUrl:
          'http://localhost:9000/frame-assets/frames/frame-1/thumbnail-md.png',
      }),
    );

    const uploadMock = storageService.uploadBuffer as jest.Mock;
    uploadMock.mockImplementation(
      (key: string, body: Buffer) =>
        ({
          key,
          size: body.byteLength,
          url: `http://localhost:9000/frame-assets/${key}`,
        }) as { key: string; size: number; url: string },
    );

    jest
      .spyOn(
        service as unknown as {
          createThumbnail: (...args: unknown[]) => Promise<unknown>;
        },
        'createThumbnail',
      )
      .mockResolvedValueOnce({
        buffer: Buffer.from('png-sm'),
        width: 120,
        height: 150,
      })
      .mockResolvedValueOnce({
        buffer: Buffer.from('png-md'),
        width: 240,
        height: 300,
      })
      .mockResolvedValueOnce({
        buffer: Buffer.from('png-lg'),
        width: 480,
        height: 600,
      });

    const maliciousSvg = `
      <svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink">
        <image xlink:href="https://evil.example/payload.png" />
        <image src="https://evil.example/payload-2.png" />
        <a href="javascript:alert(1)">x</a>
        <rect style="fill:url(javascript:alert(1));stroke:url(//evil.example/line.png)" />
        <style>.bg{background-image:url(https://evil.example/bg.png)}</style>
      </svg>
    `;

    await service.uploadSvgAsset('frame-1', {
      buffer: Buffer.from(maliciousSvg, 'utf8'),
      size: Buffer.byteLength(maliciousSvg),
    });

    const [, svgBuffer] = uploadMock.mock.calls[0] as [string, Buffer];
    const sanitized = svgBuffer.toString('utf8');

    expect(sanitized).not.toMatch(/xlink:href=/i);
    expect(sanitized).not.toMatch(/\ssrc=/i);
    expect(sanitized).not.toMatch(/href="javascript:/i);
    expect(sanitized).not.toMatch(/url\(javascript:/i);
    expect(sanitized).not.toMatch(/url\(\/\/evil\.example/i);
    expect(sanitized).not.toMatch(/evil\.example\/bg\.png/i);
  });
});
