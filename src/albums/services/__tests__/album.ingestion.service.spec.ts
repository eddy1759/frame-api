import { Repository } from 'typeorm';
import { AlbumIngestionService } from '../album.ingestion.service';
import { Album } from '../../entities/album.entity';
import { AlbumItem } from '../../entities/album-item.entity';
import { Frame } from '../../../frames/entities/frame.entity';
import { Image } from '../../../images/entities/image.entity';
import { ImageRenderVariant } from '../../../images/entities/image-render-variant.entity';

describe('AlbumIngestionService', () => {
  let service: AlbumIngestionService;
  let albumRepository: jest.Mocked<Repository<Album>>;
  let albumItemRepository: jest.Mocked<Repository<AlbumItem>>;
  let frameRepository: jest.Mocked<Repository<Frame>>;
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
    frameRepository = {
      findOne: jest.fn(),
    } as unknown as jest.Mocked<Repository<Frame>>;
    imageRepository = {
      findOne: jest.fn(),
    } as unknown as jest.Mocked<Repository<Image>>;
    imageRenderVariantRepository = {
      count: jest.fn(),
    } as unknown as jest.Mocked<Repository<ImageRenderVariant>>;

    service = new AlbumIngestionService(
      albumRepository,
      albumItemRepository,
      frameRepository,
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
    expect(frameRepository.findOne).not.toHaveBeenCalled();
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

  it('accepts a direct personalized descendant of the album frame', async () => {
    albumRepository.findOne.mockResolvedValue({
      id: 'album-1',
      shortCode: '3mH8cQpL',
      frameId: 'frame-1',
      isPublic: true,
    } as Album);
    imageRepository.findOne.mockResolvedValue({
      id: 'image-1',
      albumId: 'album-1',
      frameId: 'frame-child',
      userId: 'user-1',
      activeRenderRevision: 1,
      isDeleted: false,
    } as Image);
    frameRepository.findOne.mockResolvedValue({
      id: 'frame-child',
      metadata: {
        personalization: {
          kind: 'title-customization',
          sourceFrameId: 'frame-1',
          customTitle: 'Graduation',
        },
      },
    } as Frame);
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
        frameId: 'frame-child',
        userId: 'user-1',
        imageRenderRevision: 1,
      }),
    ).resolves.toEqual({
      album: expect.objectContaining({ id: 'album-1' }),
      inserted: true,
    });
  });

  it('accepts a multi-level personalized descendant of the album frame', async () => {
    albumRepository.findOne.mockResolvedValue({
      id: 'album-1',
      shortCode: '3mH8cQpL',
      frameId: 'frame-1',
      isPublic: true,
    } as Album);
    imageRepository.findOne.mockResolvedValue({
      id: 'image-1',
      albumId: 'album-1',
      frameId: 'frame-grandchild',
      userId: 'user-1',
      activeRenderRevision: 1,
      isDeleted: false,
    } as Image);
    frameRepository.findOne
      .mockResolvedValueOnce({
        id: 'frame-grandchild',
        metadata: {
          personalization: {
            kind: 'title-customization',
            sourceFrameId: 'frame-child',
            customTitle: 'Graduation 2',
          },
        },
      } as Frame)
      .mockResolvedValueOnce({
        id: 'frame-child',
        metadata: {
          personalization: {
            kind: 'title-customization',
            sourceFrameId: 'frame-1',
            customTitle: 'Graduation 1',
          },
        },
      } as Frame);
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
        frameId: 'frame-grandchild',
        userId: 'user-1',
        imageRenderRevision: 1,
      }),
    ).resolves.toEqual({
      album: expect.objectContaining({ id: 'album-1' }),
      inserted: true,
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

  it('rejects ingestion when the frame is unrelated to the album frame', async () => {
    albumRepository.findOne.mockResolvedValue({
      id: 'album-1',
      shortCode: '3mH8cQpL',
      frameId: 'frame-1',
      isPublic: true,
    } as Album);
    imageRepository.findOne.mockResolvedValue({
      id: 'image-1',
      albumId: 'album-1',
      frameId: 'frame-other',
      userId: 'user-1',
      activeRenderRevision: 1,
      isDeleted: false,
    } as Image);
    frameRepository.findOne.mockResolvedValue({
      id: 'frame-other',
      metadata: {},
    } as Frame);

    await expect(
      service.ingestImage({
        albumId: 'album-1',
        imageId: 'image-1',
        frameId: 'frame-other',
        userId: 'user-1',
        imageRenderRevision: 1,
      }),
    ).rejects.toThrow('Image frame does not match the album frame.');
  });

  it('rejects ingestion when framed render variants are not ready', async () => {
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
    imageRenderVariantRepository.count.mockResolvedValue(0);

    await expect(
      service.ingestImage({
        albumId: 'album-1',
        imageId: 'image-1',
        frameId: 'frame-1',
        userId: 'user-1',
        imageRenderRevision: 1,
      }),
    ).rejects.toThrow(
      'Framed render variants are not ready for album ingestion.',
    );
  });
});
