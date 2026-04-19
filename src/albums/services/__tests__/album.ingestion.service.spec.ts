import { Repository } from 'typeorm';
import { AlbumIngestionService } from '../album.ingestion.service';
import { Album } from '../../entities/album.entity';
import { AlbumItem } from '../../entities/album-item.entity';
import { Image } from '../../../images/entities/image.entity';
import { ImageRenderVariant } from '../../../images/entities/image-render-variant.entity';

describe('AlbumIngestionService', () => {
  let service: AlbumIngestionService;
  let albumRepository: jest.Mocked<Repository<Album>>;
  let albumItemRepository: jest.Mocked<Repository<AlbumItem>>;
  let imageRepository: jest.Mocked<Repository<Image>>;
  let imageRenderVariantRepository: jest.Mocked<Repository<ImageRenderVariant>>;

  beforeEach(() => {
    albumRepository = {
      findOne: jest.fn(),
    } as unknown as jest.Mocked<Repository<Album>>;
    albumItemRepository = {
      findOne: jest.fn(),
      create: jest.fn(),
      save: jest.fn(),
    } as unknown as jest.Mocked<Repository<AlbumItem>>;
    imageRepository = {
      findOne: jest.fn(),
    } as unknown as jest.Mocked<Repository<Image>>;
    imageRenderVariantRepository = {
      count: jest.fn(),
    } as unknown as jest.Mocked<Repository<ImageRenderVariant>>;

    service = new AlbumIngestionService(
      albumRepository,
      albumItemRepository,
      imageRepository,
      imageRenderVariantRepository,
    );
  });

  it('inserts a new album item once the image and render revision are valid', async () => {
    albumRepository.findOne.mockResolvedValue({
      id: 'album-1',
      shortCode: '3mH8cQpL',
      frameId: 'frame-1',
      isPublic: true,
    } as Album);
    imageRepository.findOne.mockResolvedValue({
      id: 'image-1',
      albumId: 'album-1',
      frameId: 'frame-1',
      userId: 'user-1',
      activeRenderRevision: 1,
      isDeleted: false,
    } as Image);
    imageRenderVariantRepository.count.mockResolvedValue(2);
    albumItemRepository.findOne.mockResolvedValue(null);
    albumItemRepository.create.mockImplementation(
      (value) => value as AlbumItem,
    );
    albumItemRepository.save.mockResolvedValue({ id: 'item-1' } as AlbumItem);

    await expect(
      service.ingestImage({
        albumId: 'album-1',
        imageId: 'image-1',
        frameId: 'frame-1',
        userId: 'user-1',
        imageRenderRevision: 1,
      }),
    ).resolves.toEqual({
      album: expect.objectContaining({ id: 'album-1' }),
      inserted: true,
    });
  });

  it('returns inserted=false when the album item already exists', async () => {
    albumRepository.findOne.mockResolvedValue({
      id: 'album-1',
      shortCode: '3mH8cQpL',
      frameId: 'frame-1',
      isPublic: true,
    } as Album);
    imageRepository.findOne.mockResolvedValue({
      id: 'image-1',
      albumId: 'album-1',
      frameId: 'frame-1',
      userId: 'user-1',
      activeRenderRevision: 1,
      isDeleted: false,
    } as Image);
    imageRenderVariantRepository.count.mockResolvedValue(2);
    albumItemRepository.findOne.mockResolvedValue({
      id: 'item-1',
    } as AlbumItem);

    await expect(
      service.ingestImage({
        albumId: 'album-1',
        imageId: 'image-1',
        frameId: 'frame-1',
        userId: 'user-1',
        imageRenderRevision: 1,
      }),
    ).resolves.toEqual({
      album: expect.objectContaining({ id: 'album-1' }),
      inserted: false,
    });
  });

  it('rejects ingestion when the image is not attached to the album', async () => {
    albumRepository.findOne.mockResolvedValue({
      id: 'album-1',
      shortCode: '3mH8cQpL',
      frameId: 'frame-1',
      isPublic: true,
    } as Album);
    imageRepository.findOne.mockResolvedValue({
      id: 'image-1',
      albumId: 'album-2',
      frameId: 'frame-1',
      userId: 'user-1',
      activeRenderRevision: 1,
      isDeleted: false,
    } as Image);

    await expect(
      service.ingestImage({
        albumId: 'album-1',
        imageId: 'image-1',
        frameId: 'frame-1',
        userId: 'user-1',
        imageRenderRevision: 1,
      }),
    ).rejects.toThrow('Image is not associated with the target album.');
  });
});
