import { Queue } from 'bullmq';
import { Repository } from 'typeorm';
import { ImageProcessingWorker } from '../image-processing.worker';
import { Image } from '../../entities/image.entity';

describe('ImageProcessingWorker', () => {
  let worker: ImageProcessingWorker;
  let imageRepository: jest.Mocked<Repository<Image>>;
  let albumEventsQueue: jest.Mocked<Queue>;
  const imageVariantService = {} as never;
  const storageQuotaService = {} as never;
  const imagesCacheService = {} as never;
  const storageService = {} as never;
  const configService = {} as never;
  const imageCompositingService = {
    prewarmActiveRenderVariants: jest.fn(),
  };

  beforeEach(() => {
    imageRepository = {
      findOne: jest.fn(),
    } as unknown as jest.Mocked<Repository<Image>>;
    albumEventsQueue = {
      add: jest.fn(),
    } as unknown as jest.Mocked<Queue>;

    worker = new ImageProcessingWorker(
      imageRepository,
      albumEventsQueue,
      imageVariantService,
      storageQuotaService,
      imagesCacheService,
      storageService,
      configService,
      imageCompositingService as never,
    );
  });

  it('publishes album.image.added after frame render prewarm succeeds', async () => {
    imageRepository.findOne.mockResolvedValue({
      id: 'image-1',
      albumId: 'album-1',
      frameId: 'frame-1',
      userId: 'user-1',
      activeRenderRevision: 1,
    } as Image);

    await (worker as any).prewarmFrameRender({
      id: 'job-1',
      data: {
        imageId: 'image-1',
        userId: 'user-1',
        renderRevision: 1,
        requestedAt: new Date().toISOString(),
      },
    });

    expect(
      imageCompositingService.prewarmActiveRenderVariants,
    ).toHaveBeenCalledWith('image-1');
    expect(albumEventsQueue.add).toHaveBeenCalledWith(
      'album.image.added',
      expect.objectContaining({
        albumId: 'album-1',
        imageId: 'image-1',
        imageRenderRevision: 1,
      }),
      expect.objectContaining({
        jobId: 'album-add-album-1-image-1',
      }),
    );
  });
});
