import { Queue } from 'bullmq';
import { Repository } from 'typeorm';
jest.mock('uuid', () => ({
  v4: () => 'generated-image-id',
}));
import { UploadService } from '../upload.service';
import { Album } from '../../../albums/entities/album.entity';
import { User } from '../../../auth/entities/user.entity';
import { UserRole } from '../../../auth/enums/user-role.enum';
import { UserStatus } from '../../../auth/enums/user-status.enum';
import { Image } from '../../entities/image.entity';
import { UploadSession } from '../../entities/upload-session.entity';

describe('UploadService', () => {
  let service: UploadService;
  let albumRepository: jest.Mocked<Repository<Album>>;
  let uploadSessionRepository: jest.Mocked<Repository<UploadSession>>;
  let imageRepository: jest.Mocked<Repository<Image>>;
  let albumQueryBuilder: {
    select: jest.Mock;
    where: jest.Mock;
    getOne: jest.Mock;
  };
  const dataSource = {
    transaction: jest.fn(),
  };
  const processingQueue = {} as Queue;
  const storageService = {
    generatePresignedPutUrl: jest.fn(),
  };
  const storageQuotaService = {
    reservePending: jest.fn(),
  };
  const imagesCacheService = {} as never;
  const imageCompositingService = {} as never;
  const framesService = {
    assertFrameEligibleForImage: jest.fn(),
  };
  const configService = {
    get: jest.fn((_: string, defaultValue?: unknown) => defaultValue),
  };

  const user = {
    id: 'user-1',
    email: 'test@example.com',
    displayName: 'Test User',
    avatarUrl: null,
    status: UserStatus.ACTIVE,
    role: UserRole.USER,
    storageUsed: 0,
    storageLimit: 5368709120,
    subscriptionActive: true,
    lastLoginAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    deletedAt: null,
    oauthAccounts: [],
    refreshTokens: [],
  } as User;

  beforeEach(() => {
    albumQueryBuilder = {
      select: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      getOne: jest.fn(),
    };
    albumRepository = {
      createQueryBuilder: jest.fn().mockReturnValue(albumQueryBuilder),
    } as unknown as jest.Mocked<Repository<Album>>;
    uploadSessionRepository = {
      create: jest.fn(),
      createQueryBuilder: jest.fn(),
    } as unknown as jest.Mocked<Repository<UploadSession>>;
    imageRepository = {} as never;

    uploadSessionRepository.createQueryBuilder.mockReturnValue({
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      getCount: jest.fn().mockResolvedValue(0),
    } as never);

    dataSource.transaction.mockImplementation(async (callback) => {
      const save = jest.fn().mockResolvedValue(undefined);
      await callback({
        getRepository: jest.fn().mockReturnValue({ save }),
      });
    });
    storageService.generatePresignedPutUrl.mockResolvedValue({
      url: 'https://uploads.example.com/presigned',
      key: 'tmp/user-1/2026/04/image-1.jpg',
      expiresAt: new Date('2026-04-19T12:00:00.000Z'),
    });
    uploadSessionRepository.create.mockImplementation(
      (value) => value as UploadSession,
    );
    framesService.assertFrameEligibleForImage.mockResolvedValue({
      id: 'frame-1',
      isPremium: false,
    });

    service = new UploadService(
      albumRepository,
      uploadSessionRepository,
      imageRepository,
      dataSource as never,
      processingQueue,
      storageService as never,
      storageQuotaService as never,
      imagesCacheService,
      imageCompositingService,
      framesService as never,
      configService as never,
    );
  });

  it('uses the album frame and persists albumId when a slug albumShortCode is provided', async () => {
    albumQueryBuilder.getOne.mockResolvedValue({
      id: 'album-1',
      frameId: 'frame-1',
      isPublic: true,
    } as Album);

    await service.requestUploadUrl(
      user,
      {
        filename: 'photo.jpg',
        mimeType: 'image/jpeg',
        fileSize: 1024,
        albumShortCode: 'family-reunion-2026',
      },
      '127.0.0.1',
      'jest',
    );

    expect(albumRepository.createQueryBuilder).toHaveBeenCalledWith('album');
    expect(albumQueryBuilder.where).toHaveBeenCalledWith(
      'LOWER(album.shortCode) = LOWER(:shortCode)',
      {
        shortCode: 'family-reunion-2026',
      },
    );
    expect(framesService.assertFrameEligibleForImage).toHaveBeenCalledWith(
      'frame-1',
      user,
    );
    expect(uploadSessionRepository.create).toHaveBeenCalledWith(
      expect.objectContaining({
        albumId: 'album-1',
        frameId: 'frame-1',
      }),
    );
  });

  it('rejects mismatched client frame ids for album uploads', async () => {
    albumQueryBuilder.getOne.mockResolvedValue({
      id: 'album-1',
      frameId: 'frame-1',
      isPublic: true,
    } as Album);

    await expect(
      service.requestUploadUrl(user, {
        filename: 'photo.jpg',
        mimeType: 'image/jpeg',
        fileSize: 1024,
        frameId: 'frame-2',
        albumShortCode: 'family-reunion-2026',
      }),
    ).rejects.toThrow('Album uploads must use the album frame.');
  });
});
