/* eslint-disable @typescript-eslint/no-require-imports */
import { Queue } from 'bullmq';
import { Repository } from 'typeorm';
import sharp = require('sharp');
import { UserRole } from '../../../auth/enums/user-role.enum';
import { ImageCompositingService } from '../image-compositing.service';
import { Image } from '../../entities/image.entity';
import {
  FrameRenderStatus,
  ProcessingStatus,
  VariantType,
} from '../../types/image.types';

describe('ImageCompositingService', () => {
  let service: ImageCompositingService;
  let imageRepository: jest.Mocked<Repository<Image>>;
  const frameAssetsService = {
    getSvgAssetInfo: jest.fn(),
    getFrameRenderSourceInfo: jest.fn(),
  };
  const renderVariantService = {
    getRenderVariant: jest.fn(),
  };
  const storageService = {
    generatePresignedGetUrl: jest.fn(),
  };
  const storageQuotaService = {
    addVariantUsage: jest.fn(),
    reclaimVariantUsage: jest.fn(),
  };
  const imagesCacheService = {
    invalidateImage: jest.fn(),
    invalidateUserLists: jest.fn(),
  };
  const redisService = {} as never;
  const configService = {} as never;
  const processingQueue = {
    add: jest.fn(),
  };

  beforeEach(() => {
    const save = jest.fn(async (value) => value);
    const getOne = jest.fn();
    const createQueryBuilder = jest.fn(() => ({
      setLock: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      getOne,
    }));
    const getRepository = jest.fn(() => ({
      createQueryBuilder,
      save,
    }));

    imageRepository = {
      manager: {
        transaction: jest.fn(async (callback) =>
          callback({
            getRepository,
          }),
        ),
      },
      findOne: jest.fn(),
    } as unknown as jest.Mocked<Repository<Image>>;

    (imageRepository.manager.transaction as jest.Mock).mockClear();
    imagesCacheService.invalidateImage.mockReset();
    imagesCacheService.invalidateUserLists.mockReset();
    processingQueue.add.mockReset();
    frameAssetsService.getSvgAssetInfo.mockReset();
    frameAssetsService.getFrameRenderSourceInfo.mockReset();
    renderVariantService.getRenderVariant.mockReset();
    storageService.generatePresignedGetUrl.mockReset();

    service = new ImageCompositingService(
      imageRepository,
      frameAssetsService as never,
      renderVariantService as never,
      storageService as never,
      storageQuotaService as never,
      imagesCacheService as never,
      redisService,
      configService,
      processingQueue as unknown as Queue,
    );
  });

  it('promotes a staged frame change into a processing active revision and queues prewarm', async () => {
    const lockedImage = {
      id: 'image-1',
      userId: 'user-1',
      frameId: null,
      frameSnapshotKey: null,
      frameSnapshotSize: null,
      framePlacement: null,
      renderTransform: null,
      pendingFrameId: 'frame-2',
      pendingFrameSnapshotKey: 'image-frame-snapshots/image-1/rev-1/frame.svg',
      pendingFrameSnapshotSize: 2048,
      pendingFramePlacement: { version: 1 } as never,
      pendingRenderTransform: { version: 1, zoom: 1.2 } as never,
      frameRenderStatus: FrameRenderStatus.PENDING_REPROCESS,
      activeRenderRevision: 0,
      processingStatus: ProcessingStatus.COMPLETED,
      processingError: null,
    } as unknown as Image;

    const transaction = imageRepository.manager.transaction as jest.Mock;
    const manager = { getRepository: jest.fn() };
    const save = jest.fn(async (value) => value);
    const getOne = jest.fn().mockResolvedValue(lockedImage);
    manager.getRepository.mockReturnValue({
      createQueryBuilder: jest.fn(() => ({
        setLock: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        getOne,
      })),
      save,
    });
    transaction.mockImplementationOnce(async (callback) => callback(manager));

    imageRepository.findOne.mockResolvedValueOnce({
      ...lockedImage,
      frameId: 'frame-2',
      frameSnapshotKey: 'image-frame-snapshots/image-1/rev-1/frame.svg',
      frameSnapshotSize: 2048,
      framePlacement: { version: 1 } as never,
      renderTransform: { version: 1, zoom: 1.2 } as never,
      pendingFrameId: null,
      pendingFrameSnapshotKey: null,
      pendingFrameSnapshotSize: null,
      pendingFramePlacement: null,
      pendingRenderTransform: null,
      frameRenderStatus: FrameRenderStatus.PROCESSING,
      activeRenderRevision: 1,
      processingStatus: ProcessingStatus.PROCESSING,
    } as unknown as Image);

    const result = await service.requestReprocess('image-1', {
      id: 'user-1',
      role: UserRole.USER,
    });

    expect(result).toEqual({
      imageId: 'image-1',
      frameId: 'frame-2',
      frameRenderStatus: FrameRenderStatus.PROCESSING,
      pendingFrameId: null,
      activeRenderRevision: 1,
      queued: true,
      message: 'Pending frame change promoted and render refresh queued.',
    });
    expect(lockedImage.frameId).toBe('frame-2');
    expect(lockedImage.pendingFrameId).toBeNull();
    expect(lockedImage.frameRenderStatus).toBe(FrameRenderStatus.PROCESSING);
    expect(lockedImage.activeRenderRevision).toBe(1);
    expect(lockedImage.processingStatus).toBe(ProcessingStatus.PROCESSING);
    expect(imagesCacheService.invalidateImage).toHaveBeenCalledWith('image-1');
    expect(imagesCacheService.invalidateUserLists).toHaveBeenCalledWith(
      'user-1',
    );
    expect(processingQueue.add).toHaveBeenCalledWith(
      'prewarm-frame-render',
      expect.objectContaining({
        imageId: 'image-1',
        renderRevision: 1,
      }),
      expect.objectContaining({
        jobId: 'frame-render-image-1-rev-1',
      }),
    );
  });

  it('returns the explicit final render artifact from the active composed revision', async () => {
    renderVariantService.getRenderVariant
      .mockResolvedValueOnce({
        storageKey: 'image-renders/image-1/rev-2/large.jpg',
        width: 1080,
        height: 1920,
      })
      .mockResolvedValueOnce(null);
    storageService.generatePresignedGetUrl.mockResolvedValueOnce(
      'https://signed.example.com/image-renders/image-1/rev-2/large.jpg',
    );

    const result = await service.resolveFinalRender({
      id: 'image-1',
      frameId: 'frame-1',
      frameSnapshotKey: 'image-frame-snapshots/image-1/rev-2/frame.svg',
      activeRenderRevision: 2,
      frameRenderStatus: FrameRenderStatus.READY,
      is360: false,
    } as unknown as Image);

    expect(result).toEqual({
      cdnUrl:
        'https://signed.example.com/image-renders/image-1/rev-2/large.jpg',
      width: 1080,
      height: 1920,
      revision: 2,
    });
    expect(renderVariantService.getRenderVariant).toHaveBeenCalledWith(
      'image-1',
      2,
      VariantType.LARGE,
    );
  });

  it('falls back to the current frame metadata placement for legacy transform-only reprocesses', async () => {
    frameAssetsService.getFrameRenderSourceInfo.mockResolvedValue({
      frameId: 'frame-legacy',
      storageKey: 'frames/frame-legacy/original.svg',
      renderMode: 'overlay',
      assetType: 'svg',
      mimeType: 'image/svg+xml',
      fileSize: 2048,
      placement: {
        version: 1,
        fit: 'cover',
        window: {
          x: 0.1296296296,
          y: 0.1296296296,
          width: 0.7407407407,
          height: 0.7407407407,
        },
      },
    });

    const placement = await (
      service as unknown as {
        resolveImagePlacement(image: Image): Promise<unknown>;
      }
    ).resolveImagePlacement({
      id: 'image-legacy',
      frameId: 'frame-legacy',
      framePlacement: {
        version: 1,
        fit: 'cover',
        window: {
          x: 0,
          y: 0,
          width: 1,
          height: 1,
        },
      },
    } as Image);

    expect(placement).toEqual({
      version: 1,
      fit: 'cover',
      window: {
        x: 0.1296296296,
        y: 0.1296296296,
        width: 0.7407407407,
        height: 0.7407407407,
      },
    });
    expect(frameAssetsService.getFrameRenderSourceInfo).toHaveBeenCalledWith(
      'frame-legacy',
    );
  });

  it('renders a scene frame variant into an annotated affine plane', async () => {
    const originalBuffer = await sharp({
      create: {
        width: 120,
        height: 160,
        channels: 4,
        background: { r: 220, g: 40, b: 40, alpha: 1 },
      },
    })
      .png()
      .toBuffer();
    const sceneBaseBuffer = await sharp({
      create: {
        width: 200,
        height: 240,
        channels: 4,
        background: { r: 240, g: 240, b: 240, alpha: 1 },
      },
    })
      .png()
      .toBuffer();

    const result = await (
      service as unknown as {
        composeVariant(
          context: Record<string, unknown>,
          config: {
            maxWidth: number;
            maxHeight: number;
            quality: number;
            fit: 'cover' | 'inside';
          },
        ): Promise<{ buffer: Buffer; width: number; height: number }>;
      }
    ).composeVariant(
      {
        renderMode: 'scene',
        frameSnapshotAssetType: 'scene_base_png',
        originalBuffer,
        snapshotBuffer: sceneBaseBuffer,
        canvas: { width: 200, height: 240 },
        placement: {
          version: 1,
          transform: 'affine-quad',
          fit: 'cover',
          corners: {
            topLeft: { x: 0.2, y: 0.25 },
            topRight: { x: 0.8, y: 0.25 },
            bottomRight: { x: 0.8, y: 0.85 },
            bottomLeft: { x: 0.2, y: 0.85 },
          },
        },
        sourceWidth: 120,
        sourceHeight: 160,
        transform: {
          version: 1,
          zoom: 1,
          offsetX: 0,
          offsetY: 0,
          rotation: 0,
        },
      },
      {
        maxWidth: 200,
        maxHeight: 240,
        quality: 82,
        fit: 'inside',
      },
    );

    expect(result.width).toBe(200);
    expect(result.height).toBe(240);
    expect(result.buffer.length).toBeGreaterThan(0);

    const metadata = await sharp(result.buffer).metadata();
    expect(metadata.width).toBe(200);
    expect(metadata.height).toBe(240);
    expect(metadata.format).toBe('jpeg');
  });
});
