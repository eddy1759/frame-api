import { Queue } from 'bullmq';
import { Repository } from 'typeorm';
import { UploadCleanupService } from '../upload-cleanup.worker';
import { AlbumItem } from '../../../albums/entities/album-item.entity';
import { Image } from '../../entities/image.entity';
import { ImageRenderVariant } from '../../entities/image-render-variant.entity';
import { UploadSession } from '../../entities/upload-session.entity';

describe('UploadCleanupService', () => {
  let service: UploadCleanupService;
  let uploadSessionRepository: jest.Mocked<Repository<UploadSession>>;
  let albumItemRepository: jest.Mocked<Repository<AlbumItem>>;
  let imageRepository: jest.Mocked<Repository<Image>>;
  let imageRenderVariantRepository: jest.Mocked<Repository<ImageRenderVariant>>;
  const imageVariantService = {} as never;
  const imageRenderVariantService = {} as never;
  const storageQuotaService = {
    reclaimVariantUsage: jest.fn(),
  };
  const storageService = {
    deleteObjects: jest.fn(),
  };
  const imagesCacheService = {} as never;
  const processingQueue = {} as Queue;

  beforeEach(() => {
    uploadSessionRepository = {} as never;
    albumItemRepository = {
      find: jest.fn(),
    } as unknown as jest.Mocked<Repository<AlbumItem>>;
    imageRepository = {
      find: jest.fn(),
    } as unknown as jest.Mocked<Repository<Image>>;
    imageRenderVariantRepository = {
      find: jest.fn(),
      delete: jest.fn(),
    } as unknown as jest.Mocked<Repository<ImageRenderVariant>>;

    service = new UploadCleanupService(
      uploadSessionRepository,
      albumItemRepository,
      imageRepository,
      imageRenderVariantRepository,
      imageVariantService,
      imageRenderVariantService,
      storageQuotaService as never,
      storageService as never,
      imagesCacheService,
      processingQueue,
    );
  });

  it('preserves render revisions that are referenced by album items', async () => {
    imageRepository.find.mockResolvedValue([
      {
        id: 'image-1',
        userId: 'user-1',
        activeRenderRevision: 3,
      },
    ] as Image[]);
    albumItemRepository.find.mockResolvedValue([
      {
        imageRenderRevision: 1,
      },
    ] as AlbumItem[]);
    imageRenderVariantRepository.find.mockResolvedValue([
      {
        id: 'rv-1',
        imageId: 'image-1',
        renderRevision: 1,
        storageKey: 'renders/rev-1.jpg',
        fileSize: 100,
      },
      {
        id: 'rv-2',
        imageId: 'image-1',
        renderRevision: 2,
        storageKey: 'renders/rev-2.jpg',
        fileSize: 200,
      },
    ] as ImageRenderVariant[]);

    const deletedCount = await (service as any).cleanupStaleRenderVariants();

    expect(deletedCount).toBe(1);
    expect(storageService.deleteObjects).toHaveBeenCalledWith([
      'renders/rev-2.jpg',
    ]);
    expect(imageRenderVariantRepository.delete).toHaveBeenCalledWith(['rv-2']);
    expect(storageQuotaService.reclaimVariantUsage).toHaveBeenCalledWith(
      'user-1',
      200,
    );
  });
});
