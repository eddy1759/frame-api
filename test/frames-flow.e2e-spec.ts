/* eslint-disable @typescript-eslint/no-unsafe-argument */
import {
  CanActivate,
  ExecutionContext,
  INestApplication,
  Injectable,
  Module,
  NotFoundException,
  UnauthorizedException,
  ValidationPipe,
} from '@nestjs/common';
import { APP_GUARD, Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import * as request from 'supertest';
import { Request } from 'express';

import { FramesController } from '../src/frames/controllers/frames.controller';
import { FramesAdminController } from '../src/frames/controllers/frames-admin.controller';
import { FramesService } from '../src/frames/services/frames.service';
import { FrameAssetsService } from '../src/frames/services/frame-assets.service';
import { OptionalJwtGuard } from '../src/auth/guards/optional-jwt.guard';
import { PremiumFrameGuard } from '../src/frames/guards/premium-frame.guard';
import { AdminGuard } from '../src/auth/guards/admin.guard';
import { IS_PUBLIC_KEY } from '../src/auth/decorators/public.decorator';
import { AuthThrottleGuard } from '../src/auth/guards/custom-throttle.guard';
import { GlobalExceptionFilter } from '../src/common/filters/http-exception.filter';
import { TransformInterceptor } from '../src/common/interceptors/transform.interceptor';
import { User } from '../src/auth/entities/user.entity';
import { UserStatus } from '../src/auth/enums/user-status.enum';
import { UserRole } from '../src/auth/enums/user-role.enum';
import { Frame } from '../src/frames/entities/frame.entity';

const frameId = '11111111-1111-1111-1111-111111111111';
const frameSlug = 'flow-frame';

const adminUser: User = {
  id: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
  email: 'admin@test.com',
  displayName: 'Admin User',
  avatarUrl: null,
  status: UserStatus.ACTIVE,
  role: UserRole.ADMIN,
  subscriptionActive: false,
  storageUsed: 0,
  storageLimit: 5368709120,
  createdAt: new Date('2026-01-01T00:00:00.000Z'),
  updatedAt: new Date('2026-01-01T00:00:00.000Z'),
  lastLoginAt: null,
  deletedAt: null,
  oauthAccounts: [],
  refreshTokens: [],
};

const normalUser: User = {
  ...adminUser,
  id: 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',
  role: UserRole.USER,
  email: 'user@test.com',
};

type FlowFrame = {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  isPremium: boolean;
  price: string | null;
  currency: string;
  width: number;
  height: number;
  aspectRatio: string;
  orientation: 'portrait' | 'landscape' | 'square';
  metadata: Record<string, unknown>;
  thumbnailUrl: string | null;
  svgUrl: string | null;
  editorPreviewUrl: string | null;
  applyCount: number;
  isActive: boolean;
};

const state: {
  frame: FlowFrame | null;
  savedBy: Set<string>;
} = {
  frame: null,
  savedBy: new Set<string>(),
};

const framesServiceMock = {
  createFrame: jest.fn((dto: Record<string, unknown>) => {
    state.frame = {
      id: frameId,
      name: String(dto.name),
      slug: frameSlug,
      description: (dto.description as string | undefined) ?? null,
      isPremium: Boolean(dto.isPremium ?? false),
      price: null,
      currency: typeof dto.currency === 'string' ? dto.currency : 'USD',
      width: Number(dto.width),
      height: Number(dto.height),
      aspectRatio: String(dto.aspectRatio),
      orientation: dto.orientation as 'portrait' | 'landscape' | 'square',
      metadata: (dto.metadata as Record<string, unknown> | undefined) ?? {},
      thumbnailUrl: null,
      svgUrl: null,
      editorPreviewUrl: null,
      applyCount: 0,
      isActive: true,
    };

    return {
      ...state.frame,
      categories: [],
      tags: [],
      isSaved: false,
      viewCount: 0,
      assets: [],
    };
  }),
  updateFrame: jest.fn((_id: string, dto: Record<string, unknown>) => {
    if (!state.frame) {
      throw new NotFoundException({
        code: 'FRAME_NOT_FOUND',
        message: 'Frame not found',
      });
    }
    state.frame = {
      ...state.frame,
      ...dto,
    };
    return state.frame;
  }),
  softDeleteFrame: jest.fn(() => {
    if (state.frame) {
      state.frame.isActive = false;
    }
  }),
  listFrames: jest.fn((_query: Record<string, unknown>, userId?: string) => {
    if (!state.frame || !state.frame.isActive) {
      return {
        items: [],
        pagination: {
          page: 1,
          limit: 20,
          total: 0,
          totalPages: 1,
          hasNext: false,
          hasPrevious: false,
        },
      };
    }

    return {
      items: [
        {
          id: state.frame.id,
          name: state.frame.name,
          slug: state.frame.slug,
          thumbnailUrl: state.frame.thumbnailUrl,
          isPremium: state.frame.isPremium,
          price: state.frame.price,
          currency: state.frame.currency,
          categories: [],
          tags: [],
          applyCount: state.frame.applyCount,
          isSaved: userId ? state.savedBy.has(userId) : false,
        },
      ],
      pagination: {
        page: 1,
        limit: 20,
        total: 1,
        totalPages: 1,
        hasNext: false,
        hasPrevious: false,
      },
    };
  }),
  getFrameById: jest.fn((id: string, userId?: string) => {
    if (!state.frame || state.frame.id !== id || !state.frame.isActive) {
      throw new NotFoundException({
        code: 'FRAME_NOT_FOUND',
        message: 'Frame not found',
      });
    }

    return {
      ...state.frame,
      categories: [],
      tags: [],
      isSaved: userId ? state.savedBy.has(userId) : false,
      viewCount: 0,
      assets: [],
    };
  }),
  getFrameBySlug: jest.fn((slug: string, userId?: string) => {
    if (!state.frame || state.frame.slug !== slug || !state.frame.isActive) {
      throw new NotFoundException({
        code: 'FRAME_NOT_FOUND',
        message: 'Frame not found',
      });
    }

    return {
      ...state.frame,
      categories: [],
      tags: [],
      isSaved: userId ? state.savedBy.has(userId) : false,
      viewCount: 0,
      assets: [],
    };
  }),
  getFrameSvgUrl: jest.fn(() => ({
    url:
      state.frame?.svgUrl ??
      `http://localhost:9000/frame-assets/frames/${frameId}/original.svg`,
  })),
  getFrameEditorPreviewUrl: jest.fn(() => ({
    url:
      state.frame?.editorPreviewUrl ??
      `http://localhost:9000/frame-assets/frames/${frameId}/editor-preview.png`,
  })),
  recordApply: jest.fn(() => {
    if (state.frame) {
      state.frame.applyCount += 1;
    }
  }),
  saveFrame: jest.fn((_id: string, userId: string) => {
    state.savedBy.add(userId);
  }),
  unsaveFrame: jest.fn((_id: string, userId: string) => {
    state.savedBy.delete(userId);
  }),
  getSavedFrames: jest.fn((userId: string) => {
    if (!state.frame || !state.savedBy.has(userId) || !state.frame.isActive) {
      return {
        items: [],
        pagination: {
          page: 1,
          limit: 20,
          total: 0,
          totalPages: 1,
          hasNext: false,
          hasPrevious: false,
        },
      };
    }

    return {
      items: [
        {
          id: state.frame.id,
          name: state.frame.name,
          slug: state.frame.slug,
          thumbnailUrl: state.frame.thumbnailUrl,
          isPremium: state.frame.isPremium,
          price: state.frame.price,
          currency: state.frame.currency,
          categories: [],
          tags: [],
          applyCount: state.frame.applyCount,
          isSaved: true,
          savedAt: new Date(),
        },
      ],
      pagination: {
        page: 1,
        limit: 20,
        total: 1,
        totalPages: 1,
        hasNext: false,
        hasPrevious: false,
      },
    };
  }),
  getPopular: jest.fn(() => {
    if (!state.frame || !state.frame.isActive) {
      return { items: [] };
    }

    return {
      items: [
        {
          id: state.frame.id,
          name: state.frame.name,
          slug: state.frame.slug,
          thumbnailUrl: state.frame.thumbnailUrl,
          isPremium: state.frame.isPremium,
          price: state.frame.price,
          currency: state.frame.currency,
          categories: [],
          tags: [],
          applyCount: state.frame.applyCount,
          isSaved: false,
        },
      ],
    };
  }),
  listTags: jest.fn(() => []),
  listCategories: jest.fn(() => []),
  getCategoryBySlug: jest.fn((slug: string) => ({ slug })),
};

const frameAssetsServiceMock = {
  uploadSvgAsset: jest.fn(() => {
    if (state.frame) {
      state.frame.svgUrl = `http://localhost:9000/frame-assets/frames/${frameId}/original.svg`;
      state.frame.editorPreviewUrl = `http://localhost:9000/frame-assets/frames/${frameId}/editor-preview.png`;
      state.frame.thumbnailUrl = `http://localhost:9000/frame-assets/frames/${frameId}/thumbnail-md.png`;
    }
    return {
      svgUrl: `http://localhost:9000/frame-assets/frames/${frameId}/original.svg`,
      editorPreviewUrl: `http://localhost:9000/frame-assets/frames/${frameId}/editor-preview.png`,
      thumbnails: {
        small: `http://localhost:9000/frame-assets/frames/${frameId}/thumbnail-sm.png`,
        medium: `http://localhost:9000/frame-assets/frames/${frameId}/thumbnail-md.png`,
        large: `http://localhost:9000/frame-assets/frames/${frameId}/thumbnail-lg.png`,
      },
    };
  }),
};

const optionalJwtGuardMock = {
  canActivate: jest.fn().mockReturnValue(true),
};

const premiumFrameGuardMock = {
  canActivate: jest.fn().mockReturnValue(true),
};

const throttleGuardMock = {
  checkRateLimit: jest.fn().mockResolvedValue(undefined),
};

const jwtServiceMock = {
  verify: jest.fn().mockReturnValue({
    sub: normalUser.id,
    email: normalUser.email,
    type: 'access',
    role: normalUser.role,
    subscriptionActive: false,
  }),
};

const userRepositoryMock = {
  findOne: jest.fn().mockResolvedValue(normalUser),
};

const frameRepositoryMock = {
  findOne: jest.fn().mockResolvedValue({
    id: frameId,
    isPremium: false,
  }),
};

@Injectable()
class TestJwtGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    const requestObj = context.switchToHttp().getRequest<
      Request & {
        headers: Record<string, string | undefined>;
        user?: User;
      }
    >();
    const authorization = requestObj.headers.authorization;

    if (authorization === 'Bearer admin-token') {
      requestObj.user = adminUser;
      return true;
    }

    if (authorization === 'Bearer user-token') {
      requestObj.user = normalUser;
      return true;
    }

    if (isPublic) {
      return true;
    }

    throw new UnauthorizedException({
      code: 'AUTH_INVALID_TOKEN',
      message: 'Authentication token is missing or invalid.',
    });
  }
}

@Module({
  controllers: [FramesController, FramesAdminController],
  providers: [
    {
      provide: FramesService,
      useValue: framesServiceMock,
    },
    {
      provide: FrameAssetsService,
      useValue: frameAssetsServiceMock,
    },
    {
      provide: OptionalJwtGuard,
      useValue: optionalJwtGuardMock,
    },
    {
      provide: PremiumFrameGuard,
      useValue: premiumFrameGuardMock,
    },
    {
      provide: AuthThrottleGuard,
      useValue: throttleGuardMock,
    },
    {
      provide: JwtService,
      useValue: jwtServiceMock,
    },
    {
      provide: getRepositoryToken(User),
      useValue: userRepositoryMock,
    },
    {
      provide: getRepositoryToken(Frame),
      useValue: frameRepositoryMock,
    },
    AdminGuard,
    {
      provide: APP_GUARD,
      useClass: TestJwtGuard,
    },
  ],
})
class FramesFlowE2eModule {}

describe('Frames Flow API (e2e)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [FramesFlowE2eModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.setGlobalPrefix('api/v1');
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
      }),
    );
    app.useGlobalFilters(new GlobalExceptionFilter());
    app.useGlobalInterceptors(new TransformInterceptor());

    await app.init();
  });

  beforeEach(() => {
    state.frame = null;
    state.savedBy.clear();
    jest.clearAllMocks();
    throttleGuardMock.checkRateLimit.mockResolvedValue(undefined);
    userRepositoryMock.findOne.mockResolvedValue(normalUser);
    frameRepositoryMock.findOne.mockResolvedValue({
      id: frameId,
      isPremium: false,
    });
  });

  afterAll(async () => {
    if (app) {
      await app.close();
    }
  });

  it('covers admin upload and user flow end-to-end', async () => {
    await request(app.getHttpServer())
      .post('/api/v1/admin/frames')
      .set('Authorization', 'Bearer admin-token')
      .send({
        name: 'Flow Frame',
        width: 1080,
        height: 1920,
        aspectRatio: '9:16',
        orientation: 'portrait',
      })
      .expect(201);

    await request(app.getHttpServer())
      .post(`/api/v1/admin/frames/${frameId}/assets`)
      .set('Authorization', 'Bearer admin-token')
      .attach(
        'file',
        Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"></svg>'),
        'frame.svg',
      )
      .expect(201);

    await request(app.getHttpServer()).get('/api/v1/frames').expect(200);
    await request(app.getHttpServer())
      .get(`/api/v1/frames/${frameId}`)
      .expect(200);
    await request(app.getHttpServer())
      .get(`/api/v1/frames/slug/${frameSlug}`)
      .expect(200);

    await request(app.getHttpServer())
      .post(`/api/v1/frames/${frameId}/save`)
      .set('Authorization', 'Bearer user-token')
      .expect(201);

    await request(app.getHttpServer())
      .get('/api/v1/frames/saved')
      .set('Authorization', 'Bearer user-token')
      .expect(200)
      .expect((res) => {
        expect(res.body.success).toBe(true);
        expect(res.body.data.items).toHaveLength(1);
      });

    await request(app.getHttpServer())
      .delete(`/api/v1/frames/${frameId}/save`)
      .set('Authorization', 'Bearer user-token')
      .expect(200);

    await request(app.getHttpServer())
      .post(`/api/v1/frames/${frameId}/apply`)
      .set('Authorization', 'Bearer user-token')
      .expect(201);

    await request(app.getHttpServer())
      .get('/api/v1/frames/popular')
      .expect(200)
      .expect((res) => {
        expect(res.body.success).toBe(true);
        expect(res.body.data.items[0].id).toBe(frameId);
        expect(res.body.data.items[0].applyCount).toBeGreaterThan(0);
      });

    expect(framesServiceMock.createFrame).toHaveBeenCalledTimes(1);
    expect(frameAssetsServiceMock.uploadSvgAsset).toHaveBeenCalledTimes(1);
    expect(framesServiceMock.recordApply).toHaveBeenCalledTimes(1);
    expect(throttleGuardMock.checkRateLimit).toHaveBeenCalled();
  });
});
