import { Queue } from 'bullmq';
import { Repository } from 'typeorm';
import { ImageProcessingWorker } from '../image-processing.worker';
import { Image } from '../../entities/image.entity';
import {
  FrameRenderStatus,
  ProcessingStatus,
  VariantType,
} from '../../types/image.types';

jest.mock('exifr', () => ({
  parse: jest.fn().mockResolvedValue({}),
}));

describe('ImageProcessingWorker', () => {
  let worker: ImageProcessingWorker;
  let imageRepository: jest.Mocked<Repository<Image>>;
  let albumEventsQueue: jest.Mocked<Queue>;
  const imageVariantService = {
    createVariant: jest.fn(),
    getVariantsByImageId: jest.fn(),
  };
  const storageQuotaService = {
    addVariantUsage: jest.fn(),
  };
  const imagesCacheService = {
    invalidateImage: jest.fn(),
    invalidateUserLists: jest.fn(),
  };
  const storageService = {
    getObjectBuffer: jest.fn(),
    putObject: jest.fn(),
    deleteObject: jest.fn(),
    getPublicUrl: jest.fn(),
    copyObject: jest.fn(),
  };
  const configService = {
    get: jest.fn(),
  };
  const imageCompositingService = {
    prewarmActiveRenderVariants: jest.fn(),
    queuePrewarmActiveRenderVariants: jest.fn(),
  };
  const queryBuilder = {
    update: jest.fn().mockReturnThis(),
    set: jest.fn().mockReturnThis(),
    setParameters: jest.fn().mockReturnThis(),
    where: jest.fn().mockReturnThis(),
    execute: jest.fn(),
  };
  const sampleImageBuffer = Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a6o4AAAAASUVORK5CYII=',
    'base64',
  );

  beforeEach(() => {
    imageRepository = {
      findOne: jest.fn(),
      update: jest.fn(),
      createQueryBuilder: jest.fn(() => queryBuilder),
    } as unknown as jest.Mocked<Repository<Image>>;
    albumEventsQueue = {
      add: jest.fn(),
    } as unknown as jest.Mocked<Queue>;
    imageVariantService.createVariant.mockReset();
    imageVariantService.getVariantsByImageId.mockReset();
    storageQuotaService.addVariantUsage.mockReset();
    imagesCacheService.invalidateImage.mockReset();
    imagesCacheService.invalidateUserLists.mockReset();
    storageService.getObjectBuffer.mockReset();
    storageService.putObject.mockReset();
    storageService.deleteObject.mockReset();
    storageService.getPublicUrl.mockReset();
    storageService.copyObject.mockReset();
    configService.get.mockReset();
    imageCompositingService.prewarmActiveRenderVariants.mockReset();
    imageCompositingService.queuePrewarmActiveRenderVariants.mockReset();
    queryBuilder.update.mockClear();
    queryBuilder.set.mockClear();
    queryBuilder.setParameters.mockClear();
    queryBuilder.where.mockClear();
    queryBuilder.execute.mockReset();

    worker = new ImageProcessingWorker(
      imageRepository,
      albumEventsQueue,
      imageVariantService as never,
      storageQuotaService as never,
      imagesCacheService as never,
      storageService as never,
      configService as never,
      imageCompositingService as never,
    );

    configService.get.mockImplementation((key: string, fallback?: unknown) => {
      if (key === 'image.variants') {
        return {
          thumbnail: {
            maxWidth: 300,
            maxHeight: 300,
            quality: 80,
            fit: 'cover',
          },
          medium: {
            maxWidth: 1024,
            maxHeight: 1024,
            quality: 85,
            fit: 'inside',
          },
          large: {
            maxWidth: 1920,
            maxHeight: 1920,
            quality: 90,
            fit: 'inside',
          },
          panoramic_preview: {
            maxWidth: 2048,
            maxHeight: 1024,
            quality: 85,
            fit: 'inside',
          },
        };
      }

      return fallback;
    });
  });

  it('publishes album.image.added after frame render prewarm succeeds', async () => {
    imageRepository.findOne
      .mockResolvedValueOnce({
        id: 'image-1',
        userId: 'user-1',
        activeRenderRevision: 2,
        frameRenderStatus: FrameRenderStatus.PROCESSING,
      } as Image)
      .mockResolvedValueOnce({
        id: 'image-1',
        albumId: 'album-1',
        frameId: 'frame-1',
        userId: 'user-1',
        activeRenderRevision: 2,
        frameRenderStatus: FrameRenderStatus.READY,
      } as Image);

    await (worker as any).prewarmFrameRender({
      id: 'job-1',
      data: {
        imageId: 'image-1',
        userId: 'user-1',
        renderRevision: 2,
        requestedAt: new Date().toISOString(),
      },
    });

    expect(
      imageCompositingService.prewarmActiveRenderVariants,
    ).toHaveBeenCalledWith('image-1');
    expect(imageRepository.update).toHaveBeenCalledWith('image-1', {
      frameRenderStatus: FrameRenderStatus.READY,
      processingStatus: ProcessingStatus.COMPLETED,
      processingError: null,
    });
    expect(imagesCacheService.invalidateImage).toHaveBeenCalledWith('image-1');
    expect(imagesCacheService.invalidateUserLists).toHaveBeenCalledWith(
      'user-1',
    );
    expect(albumEventsQueue.add).toHaveBeenCalledWith(
      'album.image.added',
      expect.objectContaining({
        albumId: 'album-1',
        imageId: 'image-1',
        imageRenderRevision: 2,
      }),
      expect.objectContaining({
        jobId: 'album-add-album-1-image-1',
      }),
    );
  });

  it('marks the frame render retryable when prewarm fails for the active revision', async () => {
    imageRepository.findOne.mockResolvedValue({
      id: 'image-1',
      userId: 'user-1',
      activeRenderRevision: 3,
      frameRenderStatus: FrameRenderStatus.PROCESSING,
    } as Image);
    imageCompositingService.prewarmActiveRenderVariants.mockRejectedValueOnce(
      new Error('boom'),
    );

    await expect(
      (worker as any).prewarmFrameRender({
        id: 'job-2',
        data: {
          imageId: 'image-1',
          userId: 'user-1',
          renderRevision: 3,
          requestedAt: new Date().toISOString(),
        },
      }),
    ).rejects.toThrow('boom');

    expect(imageRepository.update).toHaveBeenCalledWith('image-1', {
      frameRenderStatus: FrameRenderStatus.PENDING_REPROCESS,
      processingStatus: ProcessingStatus.FAILED,
      processingError: 'boom',
    });
    expect(albumEventsQueue.add).not.toHaveBeenCalled();
  });

  it('writes the final original object from the in-memory upload buffer without relying on storage copy', async () => {
    storageService.getObjectBuffer.mockResolvedValue(sampleImageBuffer);
    storageService.getPublicUrl.mockImplementation(
      (key: string) => `https://cdn.example/${key}`,
    );
    storageService.putObject.mockResolvedValue(undefined);
    storageService.deleteObject.mockResolvedValue(undefined);
    queryBuilder.execute.mockResolvedValue({ affected: 1 });
    imageVariantService.createVariant.mockResolvedValue(undefined);
    imageVariantService.getVariantsByImageId.mockResolvedValue([
      {
        variantType: VariantType.THUMBNAIL,
        storageKey:
          'images/user-1/2026/05/image-1_thumbnail.jpg',
      },
    ]);
    imageRepository.findOne
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({
        id: 'image-1',
        userId: 'user-1',
      } as Image);

    await (worker as any).processImage({
      id: 'process-image-1',
      data: {
        imageId: 'image-1',
        userId: 'user-1',
        tmpStorageKey: 'tmp/user-1/2026/05/image-1.png',
        storageKey: 'images/user-1/2026/05/image-1.png',
        mimeType: 'image/png',
        requestedAt: new Date().toISOString(),
      },
    });

    expect(storageService.putObject).toHaveBeenCalledWith(
      'images/user-1/2026/05/image-1.png',
      sampleImageBuffer,
      'image/png',
    );
    expect(storageService.copyObject).not.toHaveBeenCalled();
    expect(storageService.deleteObject).toHaveBeenCalledWith(
      'tmp/user-1/2026/05/image-1.png',
    );
    expect(imageVariantService.createVariant).toHaveBeenCalledWith(
      expect.objectContaining({
        imageId: 'image-1',
        variantType: VariantType.ORIGINAL,
        storageKey: 'images/user-1/2026/05/image-1.png',
        mimeType: 'image/png',
        fileSize: sampleImageBuffer.length,
      }),
    );
  });
});
