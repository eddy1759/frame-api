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
import { APP_GUARD } from '@nestjs/core';
import { Test, TestingModule } from '@nestjs/testing';
import * as request from 'supertest';
import { Request } from 'express';

import { FramesAdminController } from '../src/frames/controllers/frames-admin.controller';
import { CategoriesAdminController } from '../src/frames/controllers/categories-admin.controller';
import { TagsAdminController } from '../src/frames/controllers/tags-admin.controller';
import { FramesService } from '../src/frames/services/frames.service';
import { FrameAssetsService } from '../src/frames/services/frame-assets.service';
import { CategoriesService } from '../src/frames/services/categories.service';
import { TagsService } from '../src/frames/services/tags.service';
import { AdminGuard } from '../src/auth/guards/admin.guard';
import { AuthThrottleGuard } from '../src/auth/guards/custom-throttle.guard';
import { GlobalExceptionFilter } from '../src/common/filters/http-exception.filter';
import { TransformInterceptor } from '../src/common/interceptors/transform.interceptor';
import { User } from '../src/auth/entities/user.entity';
import { UserStatus } from '../src/auth/enums/user-status.enum';
import { UserRole } from '../src/auth/enums/user-role.enum';

const adminUser: User = {
  id: 'admin-1',
  email: 'admin@test.com',
  displayName: 'Admin User',
  avatarUrl: null,
  status: UserStatus.ACTIVE,
  role: UserRole.ADMIN,
  storageUsed: 0,
  storageLimit: 5368709120,
  createdAt: new Date('2026-01-01T00:00:00.000Z'),
  updatedAt: new Date('2026-01-01T00:00:00.000Z'),
  lastLoginAt: null,
  deletedAt: null,
  oauthAccounts: [],
  refreshTokens: [],
};

const regularUser: User = {
  ...adminUser,
  id: 'user-1',
  email: 'user@test.com',
  role: UserRole.USER,
};

const framesServiceMock = {
  createFrame: jest.fn(),
  updateFrame: jest.fn(),
  softDeleteFrame: jest.fn(),
};

const frameAssetsServiceMock = {
  uploadSvgAsset: jest.fn(),
};

const categoriesServiceMock = {
  create: jest.fn(),
  listActive: jest.fn(),
  update: jest.fn(),
  remove: jest.fn(),
};

const tagsServiceMock = {
  create: jest.fn(),
  list: jest.fn(),
  update: jest.fn(),
  remove: jest.fn(),
};

const throttleGuardMock = {
  checkRateLimit: jest.fn().mockResolvedValue(undefined),
};

const frameId = '11111111-1111-1111-1111-111111111111';
const tagId = '22222222-2222-2222-2222-222222222222';

@Injectable()
class TestJwtGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
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
      requestObj.user = regularUser;
      return true;
    }

    throw new UnauthorizedException({
      code: 'AUTH_INVALID_TOKEN',
      message: 'Authentication token is missing or invalid.',
    });
  }
}

@Module({
  controllers: [
    FramesAdminController,
    CategoriesAdminController,
    TagsAdminController,
  ],
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
      provide: CategoriesService,
      useValue: categoriesServiceMock,
    },
    {
      provide: TagsService,
      useValue: tagsServiceMock,
    },
    {
      provide: AuthThrottleGuard,
      useValue: throttleGuardMock,
    },
    AdminGuard,
    {
      provide: APP_GUARD,
      useClass: TestJwtGuard,
    },
  ],
})
class FramesAdminE2eTestModule {}

describe('Frames Admin API (e2e)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [FramesAdminE2eTestModule],
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

    framesServiceMock.createFrame.mockResolvedValue({ id: 'frame-created-1' });
    framesServiceMock.updateFrame.mockResolvedValue({ id: 'frame-updated-1' });
    framesServiceMock.softDeleteFrame.mockResolvedValue(undefined);
    frameAssetsServiceMock.uploadSvgAsset.mockResolvedValue({
      svgUrl: 'http://localhost:9000/frame-assets/frames/frame-1/original.svg',
      thumbnails: {
        small:
          'http://localhost:9000/frame-assets/frames/frame-1/thumbnail-sm.png',
        medium:
          'http://localhost:9000/frame-assets/frames/frame-1/thumbnail-md.png',
        large:
          'http://localhost:9000/frame-assets/frames/frame-1/thumbnail-lg.png',
      },
    });
    categoriesServiceMock.create.mockResolvedValue({ id: 'category-1' });
    categoriesServiceMock.listActive.mockResolvedValue([]);
    categoriesServiceMock.update.mockResolvedValue({ id: 'category-1' });
    categoriesServiceMock.remove.mockResolvedValue(undefined);
    tagsServiceMock.create.mockResolvedValue({ id: 'tag-1' });
    tagsServiceMock.list.mockResolvedValue([]);
    tagsServiceMock.update.mockResolvedValue({ id: 'tag-1' });
    tagsServiceMock.remove.mockResolvedValue(undefined);
    throttleGuardMock.checkRateLimit.mockResolvedValue(undefined);
  });

  afterAll(async () => {
    if (app) {
      await app.close();
    }
  });

  it('rejects unauthenticated admin calls', () => {
    return request(app.getHttpServer())
      .post('/api/v1/admin/frames')
      .expect(401);
  });

  it('rejects non-admin user on admin routes', () => {
    return request(app.getHttpServer())
      .post('/api/v1/admin/frames')
      .set('Authorization', 'Bearer user-token')
      .send({
        name: 'Frame Name',
        width: 1080,
        height: 1920,
        aspectRatio: '9:16',
        orientation: 'portrait',
      })
      .expect(403);
  });

  it('creates frame for admin user', () => {
    return request(app.getHttpServer())
      .post('/api/v1/admin/frames')
      .set('Authorization', 'Bearer admin-token')
      .send({
        name: 'Frame Name',
        width: 1080,
        height: 1920,
        aspectRatio: '9:16',
        orientation: 'portrait',
      })
      .expect(201)
      .expect((res) => {
        expect(res.body.success).toBe(true);
      })
      .then(() => {
        expect(throttleGuardMock.checkRateLimit).toHaveBeenCalled();
        expect(framesServiceMock.createFrame).toHaveBeenCalledWith(
          expect.objectContaining({
            name: 'Frame Name',
          }),
          adminUser.id,
        );
      });
  });

  it('uploads frame assets for admin user', () => {
    return request(app.getHttpServer())
      .post(`/api/v1/admin/frames/${frameId}/assets`)
      .set('Authorization', 'Bearer admin-token')
      .attach(
        'file',
        Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"></svg>'),
        'frame.svg',
      )
      .expect(201)
      .expect((res) => {
        expect(res.body.success).toBe(true);
        expect(res.body.data.svgUrl).toContain('/original.svg');
      })
      .then(() => {
        expect(throttleGuardMock.checkRateLimit).toHaveBeenCalled();
        expect(frameAssetsServiceMock.uploadSvgAsset).toHaveBeenCalledWith(
          frameId,
          expect.objectContaining({
            originalname: 'frame.svg',
          }),
        );
      });
  });

  it('allows admin category and tag management endpoints', () => {
    return request(app.getHttpServer())
      .post('/api/v1/admin/frames/categories')
      .set('Authorization', 'Bearer admin-token')
      .send({ name: 'Nature' })
      .expect(201)
      .then(() =>
        request(app.getHttpServer())
          .delete(`/api/v1/admin/frames/tags/${tagId}`)
          .set('Authorization', 'Bearer admin-token')
          .expect(200),
      )
      .then(() => {
        expect(categoriesServiceMock.create).toHaveBeenCalledWith(
          expect.objectContaining({ name: 'Nature' }),
        );
        expect(tagsServiceMock.remove).toHaveBeenCalledWith(tagId);
      });
  });
});
