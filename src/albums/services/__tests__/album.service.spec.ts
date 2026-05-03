import { Queue } from 'bullmq';
import { User } from '../../../auth/entities/user.entity';
import { UserRole } from '../../../auth/enums/user-role.enum';
import { UserStatus } from '../../../auth/enums/user-status.enum';
import { AlbumEventJobType } from '../../../common/queue/queue.constants';
import { FramesService } from '../../../frames/services/frames.service';
import { Album } from '../../entities/album.entity';
import { AlbumStats } from '../../entities/album-stats.entity';
import { AlbumsCacheService } from '../albums-cache.service';
import { AlbumService } from '../album.service';
import { ShortCodeService } from '../short-code.service';

describe('AlbumService', () => {
  const user: User = {
    id: '11111111-1111-4111-8111-111111111111',
    email: 'user@test.com',
    displayName: 'Album Owner',
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
  };

  let service: AlbumService;
  let albumRepository: {
    create: jest.Mock;
    findOne: jest.Mock;
    createQueryBuilder: jest.Mock;
    manager: { transaction: jest.Mock };
  };
  let queue: { add: jest.Mock };
  let framesService: { assertFrameEligibleForImage: jest.Mock };
  let shortCodeService: {
    normalizeCustomShortCode: jest.Mock;
    isValidShortCode: jest.Mock;
    generateUniqueFromName: jest.Mock;
  };
  let albumsCacheService: { invalidateAlbumDetail: jest.Mock };
  let albumSave: jest.Mock;
  let statsFindOne: jest.Mock;
  let statsSave: jest.Mock;
  let queryBuilderRaw: { id: string } | undefined;

  beforeEach(() => {
    albumSave = jest.fn(async (album: Partial<Album>) => ({
      id: album.id ?? 'album-1',
      ...album,
    }));
    statsFindOne = jest.fn().mockResolvedValue(null);
    statsSave = jest.fn().mockResolvedValue(undefined);
    queryBuilderRaw = undefined;

    const manager = {
      getRepository: jest.fn((entity: unknown) => {
        if (entity === Album) {
          return { save: albumSave };
        }

        if (entity === AlbumStats) {
          return {
            findOne: statsFindOne,
            save: statsSave,
          };
        }

        throw new Error('Unexpected repository request');
      }),
    };

    albumRepository = {
      create: jest.fn((album: Partial<Album>) => album),
      findOne: jest.fn(),
      createQueryBuilder: jest.fn(() => {
        const chain = {
          select: jest.fn().mockReturnThis(),
          where: jest.fn().mockReturnThis(),
          andWhere: jest.fn().mockReturnThis(),
          getRawOne: jest.fn(async () => queryBuilderRaw),
        };
        return chain;
      }),
      manager: {
        transaction: jest.fn(async (callback) => callback(manager)),
      },
    };
    queue = { add: jest.fn().mockResolvedValue(undefined) };
    framesService = {
      assertFrameEligibleForImage: jest.fn().mockResolvedValue(undefined),
    };
    shortCodeService = {
      normalizeCustomShortCode: jest.fn((value: string) =>
        value.trim().toLowerCase(),
      ),
      isValidShortCode: jest.fn().mockReturnValue(true),
      generateUniqueFromName: jest
        .fn()
        .mockResolvedValue('edet-wedding-anniversary'),
    };
    albumsCacheService = {
      invalidateAlbumDetail: jest.fn().mockResolvedValue(undefined),
    };

    service = new AlbumService(
      albumRepository as never,
      queue as unknown as Queue,
      framesService as unknown as FramesService,
      shortCodeService as unknown as ShortCodeService,
      albumsCacheService as unknown as AlbumsCacheService,
    );
  });

  it('creates a new named album and derives the default short code from the name', async () => {
    const result = await service.createAlbum(user, {
      frameId: '22222222-2222-4222-8222-222222222222',
      name: 'Edet Wedding Anniversary',
      description: 'Celebration album',
    });

    expect(framesService.assertFrameEligibleForImage).toHaveBeenCalledWith(
      '22222222-2222-4222-8222-222222222222',
      user,
    );
    expect(shortCodeService.generateUniqueFromName).toHaveBeenCalledWith(
      'Edet Wedding Anniversary',
      expect.any(Function),
    );
    expect(albumSave).toHaveBeenCalledWith(
      expect.objectContaining({
        ownerId: user.id,
        frameId: '22222222-2222-4222-8222-222222222222',
        shortCode: 'edet-wedding-anniversary',
        name: 'Edet Wedding Anniversary',
        description: 'Celebration album',
      }),
    );
    expect(result.shortCode).toBe('edet-wedding-anniversary');
  });

  it('updates album metadata and invalidates the old shortcode cache key', async () => {
    albumRepository.findOne.mockResolvedValue({
      id: 'album-1',
      ownerId: user.id,
      frameId: '22222222-2222-4222-8222-222222222222',
      shortCode: 'old-code',
      name: 'Old Name',
      description: 'Old description',
      isPublic: true,
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    shortCodeService.normalizeCustomShortCode.mockReturnValue('new-short-code');

    const result = await service.updateAlbum(user, 'album-1', {
      name: 'New Name',
      shortCode: 'New Short Code',
    });

    expect(albumSave).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 'album-1',
        name: 'New Name',
        shortCode: 'new-short-code',
      }),
    );
    expect(albumsCacheService.invalidateAlbumDetail).toHaveBeenCalledWith(
      'album-1',
      'old-code',
    );
    expect(queue.add).toHaveBeenCalledWith(
      AlbumEventJobType.INDEX_UPDATE,
      expect.objectContaining({
        albumId: 'album-1',
        reason: 'album-updated',
      }),
      expect.any(Object),
    );
    expect(result.shortCode).toBe('new-short-code');
  });

  it('reports invalid short code candidates without querying availability', async () => {
    shortCodeService.normalizeCustomShortCode.mockReturnValue('bad');
    shortCodeService.isValidShortCode.mockReturnValue(false);

    await expect(
      service.checkShortCodeAvailability({ shortCode: 'Bad!' }),
    ).resolves.toEqual({
      shortCode: 'bad',
      available: false,
      valid: false,
      message:
        'Short code must be 4-32 characters and use lowercase letters, numbers, or hyphens.',
    });
    expect(albumRepository.createQueryBuilder).not.toHaveBeenCalled();
  });

  it('reports a normalized short code as unavailable when another album already uses it', async () => {
    shortCodeService.normalizeCustomShortCode.mockReturnValue('edet-wedding');
    queryBuilderRaw = { id: 'existing-album' };

    await expect(
      service.checkShortCodeAvailability({ shortCode: 'Edet Wedding' }),
    ).resolves.toEqual({
      shortCode: 'edet-wedding',
      available: false,
      valid: true,
      message: 'Short code is already in use.',
    });
  });
});
