import { Queue } from 'bullmq';
import { Repository } from 'typeorm';
import { ImageProcessingWorker } from '../image-processing.worker';
import { Image } from '../../entities/image.entity';
import { FrameRenderStatus, ProcessingStatus } from '../../types/image.types';

describe('ImageProcessingWorker', () => {
  let worker: ImageProcessingWorker;
  let imageRepository: jest.Mocked<Repository<Image>>;
  let albumEventsQueue: jest.Mocked<Queue>;
  const imageVariantService = {} as never;
  const storageQuotaService = {} as never;
  const imagesCacheService = {
    invalidateImage: jest.fn(),
    invalidateUserLists: jest.fn(),
  };
  const storageService = {} as never;
  const configService = {} as never;
  const imageCompositingService = {
    prewarmActiveRenderVariants: jest.fn(),
  };

  beforeEach(() => {
    imageRepository = {
      findOne: jest.fn(),
      update: jest.fn(),
    } as unknown as jest.Mocked<Repository<Image>>;
    albumEventsQueue = {
      add: jest.fn(),
    } as unknown as jest.Mocked<Queue>;
    imagesCacheService.invalidateImage.mockReset();
    imagesCacheService.invalidateUserLists.mockReset();
    imageCompositingService.prewarmActiveRenderVariants.mockReset();

    worker = new ImageProcessingWorker(
      imageRepository,
      albumEventsQueue,
      imageVariantService,
      storageQuotaService,
      imagesCacheService as never,
      storageService,
      configService,
      imageCompositingService as never,
    );
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
});
