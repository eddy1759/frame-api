/* eslint-disable @typescript-eslint/no-unsafe-argument */
import {
  CanActivate,
  ExecutionContext,
  INestApplication,
  Injectable,
  Module,
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
import { CategoriesController } from '../src/frames/controllers/categories.controller';
import { FramesService } from '../src/frames/services/frames.service';
import { OptionalJwtGuard } from '../src/auth/guards/optional-jwt.guard';
import { PremiumFrameGuard } from '../src/frames/guards/premium-frame.guard';
import { AuthThrottleGuard } from '../src/auth/guards/custom-throttle.guard';
import { IS_PUBLIC_KEY } from '../src/auth/decorators/public.decorator';
import { GlobalExceptionFilter } from '../src/common/filters/http-exception.filter';
import { TransformInterceptor } from '../src/common/interceptors/transform.interceptor';
import { User } from '../src/auth/entities/user.entity';
import { UserStatus } from '../src/auth/enums/user-status.enum';
import { UserRole } from '../src/auth/enums/user-role.enum';
import { Frame } from '../src/frames/entities/frame.entity';

const mockCurrentUser: User = {
  id: 'user-frames-1',
  email: 'frames@test.com',
  displayName: 'Frames User',
  avatarUrl: null,
  status: UserStatus.ACTIVE,
  role: UserRole.USER,
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

const frameId = '11111111-1111-1111-1111-111111111111';

const framesServiceMock = {
  listFrames: jest.fn(),
  getPopular: jest.fn(),
  getSavedFrames: jest.fn(),
  getFrameBySlug: jest.fn(),
  listTags: jest.fn(),
  getFrameById: jest.fn(),
  getFrameSvgUrl: jest.fn(),
  getFrameEditorPreviewUrl: jest.fn(),
  customizeFrame: jest.fn(),
  recordApply: jest.fn(),
  saveFrame: jest.fn(),
  unsaveFrame: jest.fn(),
  listCategories: jest.fn(),
  getCategoryBySlug: jest.fn(),
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
    sub: mockCurrentUser.id,
    email: mockCurrentUser.email,
    type: 'access',
    role: mockCurrentUser.role,
    subscriptionActive: false,
  }),
};

const userRepositoryMock = {
  findOne: jest.fn().mockResolvedValue(mockCurrentUser),
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

    if (authorization === 'Bearer valid-access-token') {
      requestObj.user = mockCurrentUser;
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
  controllers: [FramesController, CategoriesController],
  providers: [
    {
      provide: FramesService,
      useValue: framesServiceMock,
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
      provide: APP_GUARD,
      useClass: TestJwtGuard,
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
  ],
})
class FramesE2eTestModule {}

describe('Frames API (e2e)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [FramesE2eTestModule],
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
    jest.clearAllMocks();

    framesServiceMock.listFrames.mockResolvedValue({
      items: [
        {
          id: frameId,
          name: 'Frame 1',
          slug: 'frame-1',
          thumbnailUrl: null,
          isPremium: false,
          price: null,
          currency: 'USD',
          categories: [],
          tags: [],
          applyCount: 0,
          isSaved: false,
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
    });
    framesServiceMock.getPopular.mockResolvedValue({ items: [] });
    framesServiceMock.getSavedFrames.mockResolvedValue({
      items: [],
      pagination: {
        page: 1,
        limit: 20,
        total: 0,
        totalPages: 1,
        hasNext: false,
        hasPrevious: false,
      },
    });
    framesServiceMock.getFrameBySlug.mockResolvedValue({ id: frameId });
    framesServiceMock.listTags.mockResolvedValue([]);
    framesServiceMock.getFrameById.mockResolvedValue({ id: frameId });
    framesServiceMock.getFrameSvgUrl.mockResolvedValue({
      url: `http://localhost:9000/frame-assets/frames/${frameId}/original.svg`,
    });
    framesServiceMock.getFrameEditorPreviewUrl.mockResolvedValue({
      url: `http://localhost:9000/frame-assets/frames/${frameId}/editor-preview.png`,
    });
    framesServiceMock.customizeFrame.mockResolvedValue({
      id: 'private-frame-1',
      metadata: {
        personalization: {
          kind: 'title-customization',
          sourceFrameId: frameId,
          customTitle: 'Edet Wedding Anniversary',
        },
      },
    });
    framesServiceMock.recordApply.mockResolvedValue(undefined);
    framesServiceMock.saveFrame.mockResolvedValue(undefined);
    framesServiceMock.unsaveFrame.mockResolvedValue(undefined);
    framesServiceMock.listCategories.mockResolvedValue([]);
    framesServiceMock.getCategoryBySlug.mockResolvedValue({ slug: 'nature' });
    userRepositoryMock.findOne.mockResolvedValue(mockCurrentUser);
    frameRepositoryMock.findOne.mockResolvedValue({
      id: frameId,
      isPremium: false,
    });
    throttleGuardMock.checkRateLimit.mockResolvedValue(undefined);
  });

  afterAll(async () => {
    if (app) {
      await app.close();
    }
  });

  it('returns frame list as a public endpoint', () => {
    return request(app.getHttpServer())
      .get('/api/v1/frames?page=1&limit=20')
      .expect(200)
      .expect((res) => {
        expect(res.body.success).toBe(true);
        expect(res.body.data.items).toHaveLength(1);
      })
      .then(() => {
        expect(framesServiceMock.listFrames).toHaveBeenCalledWith(
          expect.objectContaining({ page: 1, limit: 20 }),
          undefined,
        );
      });
  });

  it('enriches public list when a valid bearer token is present', () => {
    return request(app.getHttpServer())
      .get('/api/v1/frames')
      .set('Authorization', 'Bearer valid-access-token')
      .expect(200)
      .then(() => {
        expect(framesServiceMock.listFrames).toHaveBeenCalledWith(
          expect.any(Object),
          mockCurrentUser.id,
        );
      });
  });

  it('blocks protected apply endpoint without auth', () => {
    return request(app.getHttpServer())
      .post(`/api/v1/frames/${frameId}/apply`)
      .expect(401);
  });

  it('records apply event on protected endpoint with auth', () => {
    return request(app.getHttpServer())
      .post(`/api/v1/frames/${frameId}/apply`)
      .set('Authorization', 'Bearer valid-access-token')
      .expect(201)
      .expect((res) => {
        expect(res.body.success).toBe(true);
      })
      .then(() => {
        expect(throttleGuardMock.checkRateLimit).toHaveBeenCalled();
        expect(framesServiceMock.recordApply).toHaveBeenCalledWith(frameId);
      });
  });

  it('returns svg url without proxying content', () => {
    return request(app.getHttpServer())
      .get(`/api/v1/frames/${frameId}/svg`)
      .expect(200)
      .expect((res) => {
        expect(res.body.success).toBe(true);
        expect(res.body.data.url).toContain(`/frames/${frameId}/original.svg`);
      });
  });

  it('returns editor preview url without proxying content', () => {
    return request(app.getHttpServer())
      .get(`/api/v1/frames/${frameId}/editor-preview`)
      .expect(200)
      .expect((res) => {
        expect(res.body.success).toBe(true);
        expect(res.body.data.url).toContain(
          `/frames/${frameId}/editor-preview.png`,
        );
      });
  });

  it('returns categories and category detail from public routes', () => {
    return request(app.getHttpServer())
      .get('/api/v1/frames/categories')
      .expect(200)
      .then(() =>
        request(app.getHttpServer())
          .get('/api/v1/frames/categories/nature')
          .expect(200),
      )
      .then(() => {
        expect(framesServiceMock.listCategories).toHaveBeenCalledWith(false);
        expect(framesServiceMock.getCategoryBySlug).toHaveBeenCalledWith(
          'nature',
        );
      });
  });

  it('returns frame detail by slug and by id', () => {
    return request(app.getHttpServer())
      .get('/api/v1/frames/slug/frame-1')
      .expect(200)
      .then(() =>
        request(app.getHttpServer())
          .get(`/api/v1/frames/${frameId}`)
          .expect(200),
      )
      .then(() => {
        expect(framesServiceMock.getFrameBySlug).toHaveBeenCalledWith(
          'frame-1',
          null,
        );
        expect(framesServiceMock.getFrameById).toHaveBeenCalledWith(
          frameId,
          null,
        );
      });
  });

  it('returns tag and popular listings on public routes', () => {
    return request(app.getHttpServer())
      .get('/api/v1/frames/tags?limit=10&search=nat')
      .expect(200)
      .then(() =>
        request(app.getHttpServer())
          .get('/api/v1/frames/popular?limit=5')
          .expect(200),
      )
      .then(() => {
        expect(framesServiceMock.listTags).toHaveBeenCalledWith(10, 'nat');
        expect(framesServiceMock.getPopular).toHaveBeenCalled();
      });
  });

  it('blocks saved endpoints without auth', () => {
    return request(app.getHttpServer()).get('/api/v1/frames/saved').expect(401);
  });

  it('supports save and unsave for authenticated user', () => {
    return request(app.getHttpServer())
      .post(`/api/v1/frames/${frameId}/save`)
      .set('Authorization', 'Bearer valid-access-token')
      .expect(201)
      .then(() =>
        request(app.getHttpServer())
          .delete(`/api/v1/frames/${frameId}/save`)
          .set('Authorization', 'Bearer valid-access-token')
          .expect(200),
      )
      .then(() => {
        expect(throttleGuardMock.checkRateLimit).toHaveBeenCalled();
        expect(framesServiceMock.saveFrame).toHaveBeenCalledWith(
          frameId,
          mockCurrentUser.id,
        );
        expect(framesServiceMock.unsaveFrame).toHaveBeenCalledWith(
          frameId,
          mockCurrentUser.id,
        );
      });
  });

  it('returns saved frame collection for authenticated user', () => {
    return request(app.getHttpServer())
      .get('/api/v1/frames/saved?page=1&limit=20')
      .set('Authorization', 'Bearer valid-access-token')
      .expect(200)
      .then(() => {
        expect(framesServiceMock.getSavedFrames).toHaveBeenCalledWith(
          mockCurrentUser.id,
          1,
          20,
        );
      });
  });

  it('blocks frame customization without auth', () => {
    return request(app.getHttpServer())
      .post(`/api/v1/frames/${frameId}/customize`)
      .send({ customTitle: 'Edet Wedding Anniversary' })
      .expect(401);
  });

  it('creates a personalized private frame for an authenticated user', () => {
    return request(app.getHttpServer())
      .post(`/api/v1/frames/${frameId}/customize`)
      .set('Authorization', 'Bearer valid-access-token')
      .send({ customTitle: 'Edet Wedding Anniversary' })
      .expect(201)
      .expect((res) => {
        expect(res.body.success).toBe(true);
        expect(res.body.data.id).toBe('private-frame-1');
      })
      .then(() => {
        expect(framesServiceMock.customizeFrame).toHaveBeenCalledWith(
          frameId,
          mockCurrentUser,
          expect.objectContaining({
            customTitle: 'Edet Wedding Anniversary',
          }),
        );
      });
  });
});
