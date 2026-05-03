import { BadRequestException, NotFoundException } from '@nestjs/common';
import { Repository } from 'typeorm';
import { Frame } from '../../entities/frame.entity';
import { FrameAsset } from '../../entities/frame-asset.entity';
import { FrameAssetsService } from '../frame-assets.service';
import { FrameCompositorService } from '../frame-compositor.service';
import { StoragePort } from '../../../common/services';
import { FramesCacheService } from '../frames-cache.service';
import { FrameOrientation } from '../../entities/frame-orientation.enum';

describe('FrameAssetsService', () => {
  let service: FrameAssetsService;
  let frameRepository: jest.Mocked<Repository<Frame>>;
  let frameAssetRepository: jest.Mocked<Repository<FrameAsset>>;
  let storageService: jest.Mocked<StoragePort>;
  let framesCacheService: jest.Mocked<FramesCacheService>;
  let frameCompositorService: jest.Mocked<FrameCompositorService>;

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
      editorPreviewUrl: null,
      thumbnailUrl: null,
      createdById: null,
      createdBy: null,
      generatedById: null,
      generatedBy: null,
      categories: [],
      tags: [],
      assets: [],
      savedByUsers: [],
      createdAt: new Date('2026-01-01T00:00:00.000Z'),
      updatedAt: new Date('2026-01-01T00:00:00.000Z'),
      ...overrides,
    }) as Frame;

  const renderedSet = {
    svgBuffer: Buffer.from('<svg />'),
    svgCanvas: { width: 1080, height: 1920 },
    preview: { buffer: Buffer.from('preview'), width: 1080, height: 1920 },
    thumbnails: {
      small: { buffer: Buffer.from('sm'), width: 150, height: 267 },
      medium: { buffer: Buffer.from('md'), width: 300, height: 533 },
      large: { buffer: Buffer.from('lg'), width: 600, height: 1067 },
    },
  };

  beforeEach(() => {
    frameRepository = {
      findOne: jest.fn(),
      save: jest.fn(async (value) => value),
    } as unknown as jest.Mocked<Repository<Frame>>;

    frameAssetRepository = {
      delete: jest.fn(),
      create: jest.fn((value: unknown) => value as FrameAsset),
      save: jest.fn(),
      find: jest.fn(),
      findOne: jest.fn(),
    } as unknown as jest.Mocked<Repository<FrameAsset>>;

    storageService = {
      uploadBuffer: jest.fn(async (key: string, body: Buffer) => ({
        key,
        size: body.byteLength,
        url: `http://localhost:9000/frame-assets/${key}`,
      })),
      getPublicUrl: jest.fn(
        (key: string) => `http://localhost:9000/frame-assets/${key}`,
      ),
      deleteObjects: jest.fn(),
      getObjectBuffer: jest.fn(async () => Buffer.from('<svg />')),
    } as unknown as jest.Mocked<StoragePort>;

    framesCacheService = {
      invalidateFrame: jest.fn(),
    } as unknown as jest.Mocked<FramesCacheService>;

    frameCompositorService = {
      sanitizeUploadedSvg: jest.fn((svg: string) => svg),
      sanitizeGeneratedSvg: jest.fn((svg: string) => svg),
      composeTitleOverlay: jest.fn((svg: string) => svg),
      inferImagePlacementFromSvg: jest.fn(() => null),
      normalizeTitleConfigForImagePlacement: jest.fn(
        (config: unknown) => config,
      ),
      validateAspectRatio: jest.fn(() => ({ width: 1080, height: 1920 })),
      renderFrameAssetSet: jest.fn(async () => renderedSet),
    } as unknown as jest.Mocked<FrameCompositorService>;

    service = new FrameAssetsService(
      frameRepository,
      frameAssetRepository,
      storageService,
      framesCacheService,
      frameCompositorService,
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

  it('sanitizes, renders, and persists uploaded SVG assets', async () => {
    frameRepository.findOne.mockResolvedValueOnce(makeFrame());

    const result = await service.uploadSvgAsset('frame-1', {
      buffer: Buffer.from('<svg viewBox="0 0 1080 1920" />'),
      size: 31,
      mimetype: 'image/svg+xml',
      originalname: 'frame.svg',
    });

    expect(frameCompositorService.sanitizeUploadedSvg).toHaveBeenCalled();
    expect(frameCompositorService.validateAspectRatio).toHaveBeenCalledWith(
      '<svg viewBox="0 0 1080 1920" />',
      1080,
      1920,
    );
    expect(frameCompositorService.renderFrameAssetSet).toHaveBeenCalled();
    expect(storageService.uploadBuffer).toHaveBeenCalledTimes(5);
    expect(frameAssetRepository.delete).toHaveBeenCalledWith({
      frameId: 'frame-1',
    });
    expect(frameAssetRepository.save).toHaveBeenCalledTimes(1);
    expect(framesCacheService.invalidateFrame).toHaveBeenCalledWith(
      'frame-1',
      'sample-frame',
    );
    expect(result).toEqual({
      svgUrl: 'http://localhost:9000/frame-assets/frames/frame-1/original.svg',
      editorPreviewUrl:
        'http://localhost:9000/frame-assets/frames/frame-1/editor-preview.png',
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

  it('applies configured title overlays before rendering uploaded assets', async () => {
    frameRepository.findOne.mockResolvedValueOnce(
      makeFrame({
        metadata: {
          titleConfig: {
            text: 'Wedding Anniversary',
            fontFamily: 'Playfair Display',
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
        },
      }),
    );
    frameCompositorService.composeTitleOverlay.mockReturnValue(
      '<svg id="titled"/>',
    );

    await service.uploadSvgAsset('frame-1', {
      buffer: Buffer.from('<svg viewBox="0 0 1080 1920" />'),
      size: 31,
    });

    expect(frameCompositorService.composeTitleOverlay).toHaveBeenCalledWith(
      '<svg viewBox="0 0 1080 1920" />',
      expect.objectContaining({
        text: 'Wedding Anniversary',
      }),
      1080,
      1920,
    );
    expect(frameCompositorService.renderFrameAssetSet).toHaveBeenCalledWith(
      '<svg id="titled"/>',
    );
  });

  it('infers image placement and normalizes title config before persisting titled uploads', async () => {
    const frame = makeFrame({
      width: 1080,
      height: 1080,
      aspectRatio: '1:1',
      orientation: FrameOrientation.SQUARE,
      metadata: {
        titleConfig: {
          text: 'Wedding Anniversary',
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
      },
    });
    frameRepository.findOne.mockResolvedValueOnce(frame);
    frameCompositorService.validateAspectRatio.mockReturnValueOnce({
      width: 1080,
      height: 1080,
    });
    frameCompositorService.inferImagePlacementFromSvg.mockReturnValueOnce({
      version: 1,
      fit: 'cover',
      window: {
        x: 0.1296296296,
        y: 0.1296296296,
        width: 0.7407407407,
        height: 0.7407407407,
      },
    });
    frameCompositorService.normalizeTitleConfigForImagePlacement.mockReturnValueOnce(
      {
        text: 'Wedding Anniversary',
        fontFamily: 'Inter',
        fontSizeRatio: 0.05,
        color: '#ffffff',
        position: {
          x: 0.1,
          y: 0.8951851852,
          width: 0.8,
          height: 0.08,
        },
        align: 'center',
      },
    );
    frameCompositorService.composeTitleOverlay.mockReturnValue(
      '<svg id="normalized"/>',
    );

    await service.uploadSvgAsset('frame-1', {
      buffer: Buffer.from('<svg viewBox="0 0 1080 1080" />'),
      size: 31,
    });

    expect(
      frameCompositorService.inferImagePlacementFromSvg,
    ).toHaveBeenCalledWith('<svg viewBox="0 0 1080 1080" />', 1080, 1080);
    expect(
      frameCompositorService.normalizeTitleConfigForImagePlacement,
    ).toHaveBeenCalled();
    expect(frameCompositorService.composeTitleOverlay).toHaveBeenCalledWith(
      '<svg viewBox="0 0 1080 1080" />',
      expect.objectContaining({
        position: expect.objectContaining({
          y: 0.8951851852,
        }),
      }),
      1080,
      1080,
    );
    expect(frameRepository.save).toHaveBeenCalledWith(
      expect.objectContaining({
        metadata: expect.objectContaining({
          imagePlacement: expect.objectContaining({
            window: expect.objectContaining({
              x: 0.1296296296,
            }),
          }),
          titleConfig: expect.objectContaining({
            position: expect.objectContaining({
              y: 0.8951851852,
            }),
          }),
        }),
      }),
    );
  });

  it('uses generated SVG sanitization for AI-composed frames', async () => {
    frameRepository.findOne.mockResolvedValueOnce(makeFrame());

    await service.storeGeneratedSvgAsset('frame-1', '<svg />');

    expect(frameCompositorService.sanitizeGeneratedSvg).toHaveBeenCalledWith(
      '<svg />',
    );
    expect(frameCompositorService.renderFrameAssetSet).toHaveBeenCalled();
  });

  it('creates personalized frame assets from the source frame SVG', async () => {
    frameRepository.findOne
      .mockResolvedValueOnce(makeFrame({ id: 'source-frame' }))
      .mockResolvedValueOnce(makeFrame({ id: 'target-frame' }));
    frameAssetRepository.findOne.mockResolvedValue({
      frameId: 'source-frame',
      type: 'svg',
      storageKey: 'frames/source-frame/original.svg',
    } as FrameAsset);
    storageService.getObjectBuffer.mockResolvedValueOnce(
      Buffer.from('<svg viewBox="0 0 1080 1920" />'),
    );
    frameCompositorService.composeTitleOverlay.mockReturnValue(
      '<svg id="personalized" />',
    );

    await service.personalizeFrameAssets('source-frame', 'target-frame', {
      text: 'Edet Wedding Anniversary',
      fontFamily: 'Playfair Display',
      fontSizeRatio: 0.05,
      color: '#ffffff',
      position: {
        x: 0.18,
        y: 0.84,
        width: 0.64,
        height: 0.08,
      },
      align: 'center',
    });

    expect(storageService.getObjectBuffer).toHaveBeenCalledWith(
      'frames/source-frame/original.svg',
    );
    expect(frameCompositorService.composeTitleOverlay).toHaveBeenCalledWith(
      '<svg viewBox="0 0 1080 1920" />',
      expect.objectContaining({
        text: 'Edet Wedding Anniversary',
      }),
      1080,
      1920,
    );
    expect(frameCompositorService.renderFrameAssetSet).toHaveBeenCalledWith(
      '<svg id="personalized" />',
    );
  });
});
