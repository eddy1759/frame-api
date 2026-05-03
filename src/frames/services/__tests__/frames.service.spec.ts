import {
  BadRequestException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { Repository } from 'typeorm';
import { UserRole } from '../../../auth/enums/user-role.enum';
import { StoragePort } from '../../../common/services';
import { FrameOrientation } from '../../entities/frame-orientation.enum';
import { Frame } from '../../entities/frame.entity';
import { FrameAsset } from '../../entities/frame-asset.entity';
import { FramesCacheService } from '../frames-cache.service';
import { FramesService } from '../frames.service';
import { FrameAssetsService } from '../frame-assets.service';

describe('FramesService', () => {
  let service: FramesService;
  let frameRepository: jest.Mocked<Repository<Frame>>;
  let frameAssetRepository: jest.Mocked<Repository<FrameAsset>>;
  let userSavedFrameRepository: {
    exist: jest.Mock;
    find: jest.Mock;
  };
  let slugService: { generateUniqueSlug: jest.Mock };
  let cacheService: { zIncrBy: jest.Mock };
  let framesCacheService: jest.Mocked<FramesCacheService>;
  let frameAssetsService: jest.Mocked<FrameAssetsService>;
  let storageService: jest.Mocked<StoragePort>;

  const makeFrame = (overrides: Partial<Frame> = {}): Frame =>
    ({
      id: 'frame-1',
      name: 'Sample Frame',
      slug: 'sample-frame',
      description: 'A sample frame',
      isPremium: false,
      price: null,
      currency: 'USD',
      width: 1080,
      height: 1920,
      aspectRatio: '9:16',
      orientation: FrameOrientation.PORTRAIT,
      metadata: {},
      viewCount: 0,
      applyCount: 0,
      isActive: true,
      isAiGenerated: false,
      sortOrder: 0,
      svgUrl: 'http://localhost:9000/frame-assets/frames/frame-1/original.svg',
      thumbnailUrl:
        'http://localhost:9000/frame-assets/frames/frame-1/thumbnail-md.png',
      editorPreviewUrl:
        'http://localhost:9000/frame-assets/frames/frame-1/editor-preview.png',
      createdById: 'admin-1',
      createdBy: null,
      generatedById: null,
      generatedBy: null,
      categories: [],
      tags: [],
      assets: [],
      savedByUsers: [],
      createdAt: new Date('2026-01-01T00:00:00.000Z'),
      updatedAt: new Date('2026-01-01T00:00:00.000Z'),
      ...overrides,
    }) as Frame;

  beforeEach(() => {
    frameRepository = {
      findOne: jest.fn(),
      save: jest.fn(async (value) => value),
      create: jest.fn((value: unknown) => value as Frame),
      exist: jest.fn(),
      delete: jest.fn(),
    } as unknown as jest.Mocked<Repository<Frame>>;

    frameAssetRepository = {
      findOne: jest.fn(),
    } as unknown as jest.Mocked<Repository<FrameAsset>>;

    userSavedFrameRepository = {
      exist: jest.fn().mockResolvedValue(false),
      find: jest.fn().mockResolvedValue([]),
    };

    slugService = {
      generateUniqueSlug: jest.fn().mockResolvedValue('sample-frame-edet'),
    };

    cacheService = {
      zIncrBy: jest.fn(),
    };

    framesCacheService = {
      getFrame: jest.fn(),
      setFrame: jest.fn(),
      getFrameBySlug: jest.fn(),
      setFrameBySlug: jest.fn(),
      invalidateFrame: jest.fn(),
      invalidateFramesList: jest.fn(),
      invalidatePopular: jest.fn(),
      invalidateCategories: jest.fn(),
      invalidateTags: jest.fn(),
      getCategories: jest.fn(),
      setCategories: jest.fn(),
      getCategoryBySlug: jest.fn(),
      setCategoryBySlug: jest.fn(),
      getTags: jest.fn(),
      setTags: jest.fn(),
      getList: jest.fn(),
      setList: jest.fn(),
      getPopular: jest.fn(),
      setPopular: jest.fn(),
    } as unknown as jest.Mocked<FramesCacheService>;

    frameAssetsService = {
      personalizeFrameAssets: jest.fn(),
      deleteFrameAssets: jest.fn(),
    } as unknown as jest.Mocked<FrameAssetsService>;

    storageService = {
      generatePresignedGetUrl: jest
        .fn()
        .mockImplementation(async (key: string) => `http://signed/${key}`),
    } as unknown as jest.Mocked<StoragePort>;

    service = new FramesService(
      frameRepository,
      {} as never,
      {} as never,
      frameAssetRepository,
      userSavedFrameRepository as never,
      {} as never,
      slugService as never,
      cacheService as never,
      framesCacheService,
      {} as never,
      {} as never,
      frameAssetsService,
      storageService,
    );
  });

  it('throws when the frame does not exist for image attachment', async () => {
    frameRepository.findOne.mockResolvedValue(null);

    await expect(
      service.assertFrameEligibleForImage('missing-frame', {
        id: 'user-1',
        role: UserRole.USER,
        subscriptionActive: false,
      }),
    ).rejects.toThrow(NotFoundException);
  });

  it('rejects premium frames for unsubscribed non-admin users', async () => {
    frameRepository.findOne.mockResolvedValue({
      id: 'frame-1',
      isPremium: true,
      generatedById: null,
    } as Frame);

    await expect(
      service.assertFrameEligibleForImage('frame-1', {
        id: 'user-1',
        role: UserRole.USER,
        subscriptionActive: false,
      }),
    ).rejects.toThrow(ForbiddenException);
  });

  it('allows premium frames for subscribed users', async () => {
    frameRepository.findOne.mockResolvedValue({
      id: 'frame-1',
      isPremium: true,
      generatedById: null,
    } as Frame);

    await expect(
      service.assertFrameEligibleForImage('frame-1', {
        id: 'user-1',
        role: UserRole.USER,
        subscriptionActive: true,
      }),
    ).resolves.toEqual({
      id: 'frame-1',
      isPremium: true,
      generatedById: null,
    });
  });

  it('allows premium frames for admins without a subscription flag', async () => {
    frameRepository.findOne.mockResolvedValue({
      id: 'frame-1',
      isPremium: true,
      generatedById: null,
    } as Frame);

    await expect(
      service.assertFrameEligibleForImage('frame-1', {
        id: 'admin-1',
        role: UserRole.ADMIN,
        subscriptionActive: false,
      }),
    ).resolves.toEqual({
      id: 'frame-1',
      isPremium: true,
      generatedById: null,
    });
  });

  it('rejects private AI frames for non-owners', async () => {
    frameRepository.findOne.mockResolvedValue({
      id: 'frame-1',
      isPremium: false,
      generatedById: 'owner-1',
    } as Frame);

    await expect(
      service.assertFrameEligibleForImage('frame-1', {
        id: 'other-user',
        role: UserRole.USER,
        subscriptionActive: true,
      }),
    ).rejects.toThrow(ForbiddenException);
  });

  it('creates a personalized private frame and persists personalized assets', async () => {
    const sourceFrame = makeFrame({
      id: '11111111-1111-4111-8111-111111111111',
      metadata: {
        titleConfig: {
          text: 'Wedding Anniversary',
          fontFamily: 'Playfair Display',
          fontWeight: 700,
          fontSizeRatio: 0.05,
          color: '#ffffff',
          position: {
            x: 0.18,
            y: 0.84,
            width: 0.64,
            height: 0.08,
          },
          align: 'center',
        },
      },
      categories: [{ id: 'cat-1', name: 'Wedding', slug: 'wedding' }] as never,
      tags: [{ id: 'tag-1', name: 'gold', slug: 'gold' }] as never,
    });

    const savedPrivateFrame = makeFrame({
      id: '22222222-2222-4222-8222-222222222222',
      slug: 'sample-frame-edet',
      name: 'Sample Frame - Edet Wedding Anniversary',
      generatedById: 'user-1',
      metadata: {
        titleConfig: {
          text: 'Edet Wedding Anniversary',
          fontFamily: 'Playfair Display',
          fontWeight: 700,
          fontSizeRatio: 0.05,
          color: '#ffffff',
          position: {
            x: 0.18,
            y: 0.84,
            width: 0.64,
            height: 0.08,
          },
          align: 'center',
        },
        personalization: {
          kind: 'title-customization',
          sourceFrameId: sourceFrame.id,
          customTitle: 'Edet Wedding Anniversary',
        },
      },
      categories: sourceFrame.categories,
      tags: sourceFrame.tags,
    });

    frameRepository.findOne
      .mockResolvedValueOnce({
        id: sourceFrame.id,
        isPremium: false,
        generatedById: null,
      } as Frame)
      .mockResolvedValueOnce(sourceFrame)
      .mockResolvedValueOnce({
        id: savedPrivateFrame.id,
        slug: savedPrivateFrame.slug,
        generatedById: savedPrivateFrame.generatedById,
        isPremium: false,
      } as Frame)
      .mockResolvedValueOnce(savedPrivateFrame);
    frameRepository.save.mockResolvedValue(savedPrivateFrame);

    const result = await service.customizeFrame(
      sourceFrame.id,
      {
        id: 'user-1',
        role: UserRole.USER,
        subscriptionActive: true,
      },
      {
        customTitle: '  Edet   Wedding Anniversary ',
      },
    );

    expect(slugService.generateUniqueSlug).toHaveBeenCalled();
    expect(frameRepository.save).toHaveBeenCalledWith(
      expect.objectContaining({
        generatedById: 'user-1',
        createdById: sourceFrame.createdById,
        isAiGenerated: false,
      }),
    );
    expect(frameAssetsService.personalizeFrameAssets).toHaveBeenCalledWith(
      sourceFrame.id,
      savedPrivateFrame.id,
      expect.objectContaining({
        text: 'Edet Wedding Anniversary',
      }),
    );
    expect(result.metadata.personalization).toEqual({
      kind: 'title-customization',
      sourceFrameId: sourceFrame.id,
      customTitle: 'Edet Wedding Anniversary',
    });
    expect(result.thumbnailUrl).toBeNull();
    expect(result.editorPreviewUrl).toBeNull();
  });

  it('cleans up the personalized frame when personalized asset rendering fails', async () => {
    const sourceFrame = makeFrame({
      id: '11111111-1111-4111-8111-111111111111',
      metadata: {
        titleConfig: {
          text: 'Wedding Anniversary',
          fontFamily: 'Playfair Display',
          fontSizeRatio: 0.05,
          color: '#ffffff',
          position: {
            x: 0.18,
            y: 0.84,
            width: 0.64,
            height: 0.08,
          },
          align: 'center',
        },
      },
    });

    frameRepository.findOne
      .mockResolvedValueOnce({
        id: sourceFrame.id,
        isPremium: false,
        generatedById: null,
      } as Frame)
      .mockResolvedValueOnce(sourceFrame);
    frameRepository.save.mockResolvedValue(
      makeFrame({
        id: '22222222-2222-4222-8222-222222222222',
        generatedById: 'user-1',
      }),
    );
    frameAssetsService.personalizeFrameAssets.mockRejectedValue(
      new Error('render failed'),
    );

    await expect(
      service.customizeFrame(
        sourceFrame.id,
        {
          id: 'user-1',
          role: UserRole.USER,
          subscriptionActive: true,
        },
        { customTitle: 'Edet Wedding Anniversary' },
      ),
    ).rejects.toThrow('render failed');

    expect(frameAssetsService.deleteFrameAssets).toHaveBeenCalledWith(
      '22222222-2222-4222-8222-222222222222',
    );
    expect(frameRepository.delete).toHaveBeenCalledWith({
      id: '22222222-2222-4222-8222-222222222222',
    });
  });

  it('rejects customization when the source frame has no title configuration', async () => {
    frameRepository.findOne
      .mockResolvedValueOnce({
        id: 'frame-1',
        isPremium: false,
        generatedById: null,
      } as Frame)
      .mockResolvedValueOnce(makeFrame({ metadata: {} }));

    await expect(
      service.customizeFrame(
        'frame-1',
        {
          id: 'user-1',
          role: UserRole.USER,
          subscriptionActive: true,
        },
        { customTitle: 'Edet Wedding Anniversary' },
      ),
    ).rejects.toThrow(BadRequestException);
  });

  it('returns private frame detail to the owner and hides it from other users', async () => {
    const privateFrame = makeFrame({
      id: 'private-frame-1',
      generatedById: 'owner-1',
      metadata: {
        titleConfig: {
          text: 'Owner Title',
          fontFamily: 'Playfair Display',
          fontSizeRatio: 0.05,
          color: '#ffffff',
          position: {
            x: 0.18,
            y: 0.84,
            width: 0.64,
            height: 0.08,
          },
          align: 'center',
        },
      },
    });

    frameRepository.findOne
      .mockResolvedValueOnce({
        id: privateFrame.id,
        slug: privateFrame.slug,
        generatedById: 'owner-1',
        isPremium: false,
      } as Frame)
      .mockResolvedValueOnce(privateFrame);

    const ownerResult = await service.getFrameById(privateFrame.id, {
      id: 'owner-1',
      role: UserRole.USER,
      subscriptionActive: true,
    });

    expect(ownerResult.id).toBe(privateFrame.id);
    expect(ownerResult.thumbnailUrl).toBeNull();
    expect(ownerResult.assets).toEqual([]);

    frameRepository.findOne.mockReset();
    frameRepository.findOne.mockResolvedValueOnce({
      id: privateFrame.id,
      slug: privateFrame.slug,
      generatedById: 'owner-1',
      isPremium: false,
    } as Frame);

    await expect(
      service.getFrameById(privateFrame.id, {
        id: 'other-user',
        role: UserRole.USER,
        subscriptionActive: true,
      }),
    ).rejects.toThrow(NotFoundException);
  });

  it('returns a presigned SVG url for the owner of a private premium frame', async () => {
    frameRepository.findOne
      .mockResolvedValueOnce({
        id: 'private-frame-1',
        generatedById: 'owner-1',
        isPremium: true,
      } as Frame)
      .mockResolvedValueOnce({
        id: 'private-frame-1',
        svgUrl: null,
      } as Frame);
    frameAssetRepository.findOne.mockResolvedValue({
      frameId: 'private-frame-1',
      storageKey: 'frames/private-frame-1/original.svg',
      type: 'svg',
      mimeType: 'image/svg+xml',
      fileSize: 128,
    } as FrameAsset);

    const result = await service.getFrameSvgUrl('private-frame-1', {
      id: 'owner-1',
      role: UserRole.USER,
      subscriptionActive: true,
    });

    expect(storageService.generatePresignedGetUrl).toHaveBeenCalledWith(
      'frames/private-frame-1/original.svg',
    );
    expect(result).toEqual({
      url: 'http://signed/frames/private-frame-1/original.svg',
    });
  });
});
