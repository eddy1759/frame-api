import { Repository } from 'typeorm';
import { AlbumQueryService } from '../album.query.service';
import { Album } from '../../entities/album.entity';
import { AlbumItem } from '../../entities/album-item.entity';
import { AlbumStats } from '../../entities/album-stats.entity';
import { ImageVariant } from '../../../images/entities/image-variant.entity';
import { ImageRenderVariant } from '../../../images/entities/image-render-variant.entity';
import { VariantType } from '../../../images/types/image.types';
import { User } from '../../../auth/entities/user.entity';
import { UserRole } from '../../../auth/enums/user-role.enum';
import { UserStatus } from '../../../auth/enums/user-status.enum';

describe('AlbumQueryService', () => {
  let service: AlbumQueryService;
  let albumItemRepository: jest.Mocked<Repository<AlbumItem>>;
  let imageVariantRepository: jest.Mocked<Repository<ImageVariant>>;
  let imageRenderVariantRepository: jest.Mocked<Repository<ImageRenderVariant>>;

  const viewer = {
    id: 'owner-1',
    email: 'owner@example.com',
    displayName: 'Owner',
    avatarUrl: null,
    status: UserStatus.ACTIVE,
    role: UserRole.USER,
    subscriptionActive: true,
    storageUsed: 0,
    storageLimit: 5368709120,
    createdAt: new Date(),
    updatedAt: new Date(),
    lastLoginAt: null,
    deletedAt: null,
    oauthAccounts: [],
    refreshTokens: [],
  } as User;

  const accessibleAlbum = {
    id: 'album-1',
    ownerId: viewer.id,
    isPublic: true,
  } as Album;

  const paginationService = {
    resolve: jest.fn().mockReturnValue({
      page: 1,
      limit: 20,
      skip: 0,
      take: 20,
    }),
    buildMeta: jest.fn().mockReturnValue({
      pagination: {
        page: 1,
        limit: 20,
        total: 2,
        totalPages: 1,
        hasNext: false,
        hasPrevious: false,
      },
    }),
  };

  const storageService = {
    generatePresignedGetUrl: jest.fn(async (key: string) => `signed:${key}`),
  };

  const albumsCacheService = {
    getSearch: jest.fn(),
    setSearch: jest.fn(),
    getAlbumByShortCode: jest.fn(),
    setAlbumById: jest.fn(),
    setAlbumByShortCode: jest.fn(),
    getAlbumItems: jest.fn(),
    setAlbumItems: jest.fn(),
    getAlbumStats: jest.fn(),
    setAlbumStats: jest.fn(),
  };

  beforeEach(() => {
    albumItemRepository = {
      createQueryBuilder: jest.fn(),
    } as unknown as jest.Mocked<Repository<AlbumItem>>;
    imageVariantRepository = {
      find: jest.fn(),
    } as unknown as jest.Mocked<Repository<ImageVariant>>;
    imageRenderVariantRepository = {
      find: jest.fn(),
    } as unknown as jest.Mocked<Repository<ImageRenderVariant>>;

    service = new AlbumQueryService(
      {} as Repository<Album>,
      albumItemRepository,
      {} as Repository<AlbumStats>,
      imageVariantRepository,
      imageRenderVariantRepository,
      paginationService as never,
      storageService as never,
      albumsCacheService as never,
    );
  });

  it('marks listed album images with isImageOwner for the current viewer', async () => {
    const listQueryBuilder = {
      innerJoin: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      orderBy: jest.fn().mockReturnThis(),
      addOrderBy: jest.fn().mockReturnThis(),
      skip: jest.fn().mockReturnThis(),
      take: jest.fn().mockReturnThis(),
      getManyAndCount: jest.fn().mockResolvedValue([
        [
          {
            id: 'item-1',
            albumId: accessibleAlbum.id,
            imageId: 'image-owned',
            frameId: 'frame-1',
            userId: viewer.id,
            imageRenderRevision: 1,
            createdAt: new Date('2026-05-03T12:00:00.000Z'),
          },
          {
            id: 'item-2',
            albumId: accessibleAlbum.id,
            imageId: 'image-contributed',
            frameId: 'frame-1',
            userId: 'contributor-2',
            imageRenderRevision: 1,
            createdAt: new Date('2026-05-03T12:01:00.000Z'),
          },
        ],
        2,
      ]),
    };
    albumItemRepository.createQueryBuilder.mockReturnValue(
      listQueryBuilder as never,
    );
    imageRenderVariantRepository.find.mockResolvedValue([]);
    imageVariantRepository.find.mockResolvedValue([
      {
        imageId: 'image-owned',
        variantType: VariantType.THUMBNAIL,
        storageKey: 'owned-thumb.jpg',
      },
      {
        imageId: 'image-owned',
        variantType: VariantType.MEDIUM,
        storageKey: 'owned-medium.jpg',
      },
      {
        imageId: 'image-contributed',
        variantType: VariantType.THUMBNAIL,
        storageKey: 'contrib-thumb.jpg',
      },
      {
        imageId: 'image-contributed',
        variantType: VariantType.MEDIUM,
        storageKey: 'contrib-medium.jpg',
      },
    ] as ImageVariant[]);
    (service as any).getAccessibleAlbumById = jest
      .fn()
      .mockResolvedValue(accessibleAlbum);

    const result = await service.listAlbumImages(
      accessibleAlbum.id,
      { page: 1, limit: 20 },
      viewer,
    );

    expect(result.data).toEqual([
      expect.objectContaining({
        imageId: 'image-owned',
        isImageOwner: true,
        thumbnailUrl: 'signed:owned-thumb.jpg',
        mediumUrl: 'signed:owned-medium.jpg',
      }),
      expect.objectContaining({
        imageId: 'image-contributed',
        isImageOwner: false,
        thumbnailUrl: 'signed:contrib-thumb.jpg',
        mediumUrl: 'signed:contrib-medium.jpg',
      }),
    ]);
  });

  it('returns read-only album image detail with large media fallback', async () => {
    const detailQueryBuilder = {
      innerJoin: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      getOne: jest.fn().mockResolvedValue({
        id: 'item-3',
        albumId: accessibleAlbum.id,
        imageId: 'image-contributed',
        frameId: 'frame-1',
        userId: 'contributor-2',
        imageRenderRevision: 4,
        createdAt: new Date('2026-05-03T12:02:00.000Z'),
      }),
    };
    albumItemRepository.createQueryBuilder.mockReturnValue(
      detailQueryBuilder as never,
    );
    imageRenderVariantRepository.find.mockResolvedValue([
      {
        imageId: 'image-contributed',
        renderRevision: 4,
        variantType: VariantType.THUMBNAIL,
        storageKey: 'render-thumb.jpg',
      },
      {
        imageId: 'image-contributed',
        renderRevision: 4,
        variantType: VariantType.MEDIUM,
        storageKey: 'render-medium.jpg',
      },
    ] as ImageRenderVariant[]);
    imageVariantRepository.find.mockResolvedValue([]);
    (service as any).getAccessibleAlbumById = jest
      .fn()
      .mockResolvedValue(accessibleAlbum);

    const result = await service.getAlbumImageDetail(
      accessibleAlbum.id,
      'image-contributed',
      viewer,
    );

    expect(result).toEqual(
      expect.objectContaining({
        imageId: 'image-contributed',
        imageRenderRevision: 4,
        thumbnailUrl: 'signed:render-thumb.jpg',
        mediumUrl: 'signed:render-medium.jpg',
        largeUrl: 'signed:render-medium.jpg',
        isImageOwner: false,
      }),
    );
  });
});
