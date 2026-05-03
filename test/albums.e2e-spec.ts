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
import { Test, TestingModule } from '@nestjs/testing';
import * as request from 'supertest';
import { Request } from 'express';
import { GlobalExceptionFilter } from '../src/common/filters/http-exception.filter';
import { TransformInterceptor } from '../src/common/interceptors/transform.interceptor';
import { AlbumsController } from '../src/albums/controllers/albums.controller';
import { AlbumIngestionService } from '../src/albums/services/album.ingestion.service';
import { AlbumQueryService } from '../src/albums/services/album.query.service';
import { AlbumService } from '../src/albums/services/album.service';
import { OptionalJwtGuard } from '../src/auth/guards/optional-jwt.guard';
import { User } from '../src/auth/entities/user.entity';
import { UserRole } from '../src/auth/enums/user-role.enum';
import { UserStatus } from '../src/auth/enums/user-status.enum';

const user: User = {
  id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  email: 'user@test.com',
  displayName: 'Album Owner',
  avatarUrl: null,
  status: UserStatus.ACTIVE,
  role: UserRole.USER,
  subscriptionActive: true,
  storageUsed: 0,
  storageLimit: 5368709120,
  createdAt: new Date('2026-04-19T10:00:00.000Z'),
  updatedAt: new Date('2026-04-19T10:00:00.000Z'),
  lastLoginAt: null,
  deletedAt: null,
  oauthAccounts: [],
  refreshTokens: [],
};

const adminUser: User = {
  ...user,
  id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
  role: UserRole.ADMIN,
  email: 'admin@test.com',
};

const albumServiceMock = {
  createAlbum: jest.fn(),
  updateAlbum: jest.fn(),
  checkShortCodeAvailability: jest.fn(),
  queueAnalyticsUpdate: jest.fn(),
};

const albumQueryServiceMock = {
  searchAlbums: jest.fn(),
  getAlbumDetail: jest.fn(),
  listAlbumImages: jest.fn(),
  getAlbumImageDetail: jest.fn(),
};

const albumIngestionServiceMock = {
  replayAlbumImage: jest.fn(),
};

const optionalJwtGuardMock = {
  canActivate: jest.fn().mockReturnValue(true),
};

@Injectable()
class TestAppGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const isPublic = this.reflector.getAllAndOverride<boolean>('isPublic', [
      context.getHandler(),
      context.getClass(),
    ]);

    if (isPublic) {
      return true;
    }

    const requestObj = context
      .switchToHttp()
      .getRequest<
        Request & { headers: Record<string, string | undefined>; user?: User }
      >();
    const authorization = requestObj.headers.authorization;

    if (authorization === 'Bearer album-user-token') {
      requestObj.user = user;
      return true;
    }

    if (authorization === 'Bearer album-admin-token') {
      requestObj.user = adminUser;
      return true;
    }

    throw new UnauthorizedException({
      code: 'AUTH_INVALID_TOKEN',
      message: 'Authentication token is missing or invalid.',
    });
  }
}

@Module({
  controllers: [AlbumsController],
  providers: [
    {
      provide: APP_GUARD,
      useClass: TestAppGuard,
    },
    {
      provide: AlbumService,
      useValue: albumServiceMock,
    },
    {
      provide: AlbumQueryService,
      useValue: albumQueryServiceMock,
    },
    {
      provide: AlbumIngestionService,
      useValue: albumIngestionServiceMock,
    },
    {
      provide: OptionalJwtGuard,
      useValue: optionalJwtGuardMock,
    },
  ],
})
class AlbumsE2eModule {}

describe('Albums API (e2e)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AlbumsE2eModule],
    })
      .overrideGuard(OptionalJwtGuard)
      .useValue(optionalJwtGuardMock)
      .compile();

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

    albumServiceMock.createAlbum.mockResolvedValue({
      id: 'album-1',
      shortCode: '3mH8cQpL',
      frameId: 'frame-1',
      ownerId: user.id,
      name: 'My Album',
      description: 'Public album',
      isPublic: true,
      sharePath: '/albums/3mH8cQpL',
    });
    albumServiceMock.updateAlbum.mockResolvedValue({
      id: 'album-1',
      shortCode: 'my-wedding-album',
      frameId: 'frame-1',
      ownerId: user.id,
      name: 'My Wedding Album',
      description: 'Updated',
      isPublic: true,
      sharePath: '/albums/my-wedding-album',
    });
    albumServiceMock.checkShortCodeAvailability.mockResolvedValue({
      shortCode: 'my-wedding-album',
      available: true,
      valid: true,
      message: 'Short code is available.',
    });
    albumQueryServiceMock.searchAlbums.mockResolvedValue({
      data: [],
      meta: {
        pagination: {
          page: 1,
          limit: 20,
          total: 0,
          totalPages: 1,
          hasNext: false,
          hasPrevious: false,
        },
      },
    });
    albumQueryServiceMock.getAlbumDetail.mockResolvedValue({
      id: 'album-1',
      shortCode: '3mH8cQpL',
      name: 'My Album',
      isPublic: true,
      previewItems: [],
    });
    albumQueryServiceMock.listAlbumImages.mockResolvedValue({
      data: [],
      meta: {
        pagination: {
          page: 1,
          limit: 20,
          total: 0,
          totalPages: 1,
          hasNext: false,
          hasPrevious: false,
        },
      },
    });
    albumQueryServiceMock.getAlbumImageDetail.mockResolvedValue({
      id: 'item-1',
      albumId: '11111111-1111-4111-8111-111111111111',
      imageId: '22222222-2222-4222-8222-222222222222',
      frameId: '33333333-3333-4333-8333-333333333333',
      userId: '44444444-4444-4444-8444-444444444444',
      imageRenderRevision: 2,
      thumbnailUrl: 'https://cdn.example.com/thumb.jpg',
      mediumUrl: 'https://cdn.example.com/medium.jpg',
      largeUrl: 'https://cdn.example.com/large.jpg',
      isImageOwner: false,
      createdAt: new Date('2026-05-03T12:00:00.000Z'),
    });
    albumIngestionServiceMock.replayAlbumImage.mockResolvedValue({
      albumId: 'album-1',
      imageId: 'image-1',
      inserted: true,
    });
  });

  afterAll(async () => {
    if (app) {
      await app.close();
    }
  });

  it('enforces auth for album creation and allows public album reads', async () => {
    await request(app.getHttpServer())
      .post('/api/v1/albums')
      .send({
        frameId: '11111111-1111-4111-8111-111111111111',
      })
      .expect(401);

    await request(app.getHttpServer())
      .post('/api/v1/albums')
      .set('Authorization', 'Bearer album-user-token')
      .send({
        frameId: '11111111-1111-4111-8111-111111111111',
        name: 'My Album',
      })
      .expect(201)
      .expect((res) => {
        expect(res.body.success).toBe(true);
        expect(res.body.data.shortCode).toBe('3mH8cQpL');
      });

    await request(app.getHttpServer())
      .get(
        '/api/v1/albums/shortcodes/availability?shortCode=My%20Wedding%20Album',
      )
      .set('Authorization', 'Bearer album-user-token')
      .expect(200)
      .expect((res) => {
        expect(res.body.success).toBe(true);
        expect(res.body.data.available).toBe(true);
      });

    await request(app.getHttpServer())
      .get('/api/v1/albums/search')
      .expect(200)
      .expect((res) => {
        expect(res.body.success).toBe(true);
      });

    await request(app.getHttpServer())
      .get('/api/v1/albums/3mH8cQpL')
      .expect(200)
      .expect((res) => {
        expect(res.body.success).toBe(true);
        expect(res.body.data.shortCode).toBe('3mH8cQpL');
      });

    expect(albumQueryServiceMock.searchAlbums).toHaveBeenCalledWith(
      expect.any(Object),
      null,
    );
    expect(albumServiceMock.queueAnalyticsUpdate).toHaveBeenCalledWith(
      'album-1',
      'view',
    );
  });

  it('allows authenticated owners to update album metadata and personalized shortcodes', async () => {
    const albumId = '11111111-1111-4111-8111-111111111111';

    await request(app.getHttpServer())
      .patch(`/api/v1/albums/${albumId}`)
      .set('Authorization', 'Bearer album-user-token')
      .send({
        name: 'My Wedding Album',
        shortCode: 'My Wedding Album',
      })
      .expect(200)
      .expect((res) => {
        expect(res.body.success).toBe(true);
        expect(res.body.data.shortCode).toBe('my-wedding-album');
      });
  });

  it('restricts replay ingestion to admins while keeping image listing public', async () => {
    const albumId = '11111111-1111-4111-8111-111111111111';

    await request(app.getHttpServer())
      .post(`/api/v1/albums/${albumId}/images`)
      .set('Authorization', 'Bearer album-user-token')
      .send({
        imageId: '22222222-2222-4222-8222-222222222222',
      })
      .expect(403);

    await request(app.getHttpServer())
      .post(`/api/v1/albums/${albumId}/images`)
      .set('Authorization', 'Bearer album-admin-token')
      .send({
        imageId: '22222222-2222-4222-8222-222222222222',
      })
      .expect(201)
      .expect((res) => {
        expect(res.body.success).toBe(true);
        expect(res.body.data.inserted).toBe(true);
      });

    await request(app.getHttpServer())
      .get(`/api/v1/albums/${albumId}/images`)
      .expect(200)
      .expect((res) => {
        expect(res.body.success).toBe(true);
      });
  });

  it('returns album-scoped read-only detail for a contributed image', async () => {
    const albumId = '11111111-1111-4111-8111-111111111111';
    const imageId = '22222222-2222-4222-8222-222222222222';

    await request(app.getHttpServer())
      .get(`/api/v1/albums/${albumId}/images/${imageId}`)
      .set('Authorization', 'Bearer album-user-token')
      .expect(200)
      .expect((res) => {
        expect(res.body.success).toBe(true);
        expect(res.body.data.imageId).toBe(imageId);
        expect(res.body.data.isImageOwner).toBe(false);
        expect(res.body.data.largeUrl).toBe(
          'https://cdn.example.com/large.jpg',
        );
      });

    expect(albumQueryServiceMock.getAlbumImageDetail).toHaveBeenCalledWith(
      albumId,
      imageId,
      null,
    );
  });
});
