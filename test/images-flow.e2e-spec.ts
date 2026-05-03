/* eslint-disable @typescript-eslint/no-unsafe-argument */
import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  INestApplication,
  Injectable,
  Module,
  NotFoundException,
  UnauthorizedException,
  ValidationPipe,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import * as request from 'supertest';
import { Request } from 'express';

import { JwtAuthGuard } from '../src/auth/guards/jwt-auth.guard';
import { OptionalJwtGuard } from '../src/auth/guards/optional-jwt.guard';
import { AuthThrottleGuard } from '../src/auth/guards/custom-throttle.guard';
import { GlobalExceptionFilter } from '../src/common/filters/http-exception.filter';
import { TransformInterceptor } from '../src/common/interceptors/transform.interceptor';
import { User } from '../src/auth/entities/user.entity';
import { UserStatus } from '../src/auth/enums/user-status.enum';
import { UserRole } from '../src/auth/enums/user-role.enum';
import { FramesController } from '../src/frames/controllers/frames.controller';
import { Frame } from '../src/frames/entities/frame.entity';
import { FramesService } from '../src/frames/services/frames.service';
import { PremiumFrameGuard } from '../src/frames/guards/premium-frame.guard';
import { ImagesController } from '../src/images/controllers/images.controller';
import { UploadSessionsController } from '../src/images/controllers/upload-sessions.controller';
import { ImagesService } from '../src/images/services/images.service';
import { UploadService } from '../src/images/services/upload.service';
import { ImageProcessingService } from '../src/images/services/image-processing.service';
import {
  FrameRenderStatus,
  ProcessingStatus,
} from '../src/images/types/image.types';

const premiumFrameId = '11111111-1111-4111-8111-111111111111';
const alternateFrameId = '33333333-3333-4333-8333-333333333333';
const uploadSessionId = '22222222-2222-4222-8222-222222222222';

const freeUser: User = {
  id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  email: 'free@test.com',
  displayName: 'Free User',
  avatarUrl: null,
  status: UserStatus.ACTIVE,
  role: UserRole.USER,
  subscriptionActive: false,
  storageUsed: 0,
  storageLimit: 5368709120,
  createdAt: new Date('2026-03-18T10:00:00.000Z'),
  updatedAt: new Date('2026-03-18T10:00:00.000Z'),
  lastLoginAt: null,
  deletedAt: null,
  oauthAccounts: [],
  refreshTokens: [],
};

const premiumUser: User = {
  ...freeUser,
  id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
  email: 'premium@test.com',
  displayName: 'Premium User',
  subscriptionActive: true,
};

type ImageRecord = {
  id: string;
  userId: string;
  frameId: string | null;
  pendingFrameId: string | null;
  frameRenderStatus: FrameRenderStatus;
  activeRenderRevision: number;
  finalRender: {
    cdnUrl: string;
    width: number;
    height: number;
    revision: number;
  } | null;
  renderTransform: {
    version: 1;
    zoom: number;
    offsetX: number;
    offsetY: number;
    rotation: number;
  } | null;
  pendingRenderTransform: {
    version: 1;
    zoom: number;
    offsetX: number;
    offsetY: number;
    rotation: number;
  } | null;
  title: string | null;
  description: string | null;
  originalFilename: string;
  mimeType: string;
  fileSize: number;
  width: number;
  height: number;
  aspectRatio: string;
  orientation: 'portrait' | 'landscape' | 'square';
  is360: boolean;
  processingStatus: string;
  processingError: string | null;
  isPublic: boolean;
  thumbnailUrl: string | null;
  variants: Record<string, unknown>;
  createdAt: Date;
  updatedAt: Date;
};

type UploadSessionRecord = {
  id: string;
  userId: string;
  frameId: string | null;
  filename: string;
  mimeType: string;
  fileSize: number;
  is360: boolean;
  status: string;
  storageKey: string;
  expiresAt: Date;
  createdAt: Date;
};

const state: {
  uploadSession: UploadSessionRecord | null;
  image: ImageRecord | null;
} = {
  uploadSession: null,
  image: null,
};

const premiumFrame = {
  id: premiumFrameId,
  name: 'Premium Portrait Frame',
  slug: 'premium-portrait-frame',
  description: 'Premium frame for image attachment.',
  isPremium: true,
  price: '4.99',
  currency: 'USD',
  width: 1080,
  height: 1920,
  aspectRatio: '9:16',
  orientation: 'portrait',
  metadata: {},
  thumbnailUrl: 'http://localhost:9000/frame-assets/frames/premium/thumb.png',
  svgUrl: 'http://localhost:9000/frame-assets/frames/premium/original.svg',
  editorPreviewUrl:
    'http://localhost:9000/frame-assets/frames/premium/editor-preview.png',
  viewCount: 12,
  applyCount: 5,
  categories: [],
  tags: [],
  assets: [],
  isSaved: false,
};

const alternateFrame = {
  ...premiumFrame,
  id: alternateFrameId,
  name: 'Classic Frame',
  slug: 'classic-frame',
  isPremium: false,
  price: '0.00',
  thumbnailUrl: 'http://localhost:9000/frame-assets/frames/classic/thumb.png',
  svgUrl: 'http://localhost:9000/frame-assets/frames/classic/original.svg',
  editorPreviewUrl:
    'http://localhost:9000/frame-assets/frames/classic/editor-preview.png',
};

const framesServiceMock = {
  getFrameById: jest.fn(),
  assertFrameEligibleForImage: jest.fn(),
};

const uploadServiceMock = {
  requestUploadUrl: jest.fn(),
  getUploadSession: jest.fn(),
  completeUpload: jest.fn(),
  cancelUploadSession: jest.fn(),
};

const imagesServiceMock = {
  getImageById: jest.fn(),
  getStorageSummary: jest.fn(),
  batchGetImages: jest.fn(),
  listImages: jest.fn(),
  updateImage: jest.fn(),
  requestReprocess: jest.fn(),
  deleteImage: jest.fn(),
};

const imageProcessingServiceMock = {
  getProcessingStatus: jest.fn(),
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
    sub: premiumUser.id,
    email: premiumUser.email,
    type: 'access',
    role: premiumUser.role,
    subscriptionActive: premiumUser.subscriptionActive,
  }),
};

const userRepositoryMock = {
  findOne: jest.fn().mockResolvedValue(premiumUser),
};

const frameRepositoryMock = {
  findOne: jest.fn().mockResolvedValue({
    id: premiumFrameId,
    isPremium: true,
    isActive: true,
  }),
};

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

    if (authorization === 'Bearer premium-user-token') {
      requestObj.user = premiumUser;
      return true;
    }

    if (authorization === 'Bearer free-user-token') {
      requestObj.user = freeUser;
      return true;
    }

    throw new UnauthorizedException({
      code: 'AUTH_INVALID_TOKEN',
      message: 'Authentication token is missing or invalid.',
    });
  }
}

@Module({
  controllers: [FramesController, ImagesController, UploadSessionsController],
  providers: [
    {
      provide: FramesService,
      useValue: framesServiceMock,
    },
    {
      provide: UploadService,
      useValue: uploadServiceMock,
    },
    {
      provide: ImagesService,
      useValue: imagesServiceMock,
    },
    {
      provide: ImageProcessingService,
      useValue: imageProcessingServiceMock,
    },
    {
      provide: JwtAuthGuard,
      useClass: TestJwtGuard,
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
  ],
})
class ImagesFlowE2eModule {}

describe('Images Upload Flow API (e2e)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [ImagesFlowE2eModule],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue(new TestJwtGuard())
      .overrideGuard(OptionalJwtGuard)
      .useValue(optionalJwtGuardMock)
      .overrideGuard(PremiumFrameGuard)
      .useValue(premiumFrameGuardMock)
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
    state.uploadSession = null;
    state.image = null;
    jest.clearAllMocks();
    throttleGuardMock.checkRateLimit.mockResolvedValue(undefined);
    jwtServiceMock.verify.mockReturnValue({
      sub: premiumUser.id,
      email: premiumUser.email,
      type: 'access',
      role: premiumUser.role,
      subscriptionActive: premiumUser.subscriptionActive,
    });
    userRepositoryMock.findOne.mockResolvedValue(premiumUser);
    frameRepositoryMock.findOne.mockResolvedValue({
      id: premiumFrameId,
      isPremium: true,
      isActive: true,
    });

    framesServiceMock.getFrameById.mockImplementation((id: string) => {
      if (id === premiumFrameId) {
        return premiumFrame;
      }

      if (id === alternateFrameId) {
        return alternateFrame;
      }

      if (id !== premiumFrameId) {
        throw new NotFoundException({
          code: 'FRAME_NOT_FOUND',
          message: 'Frame with the specified ID does not exist.',
        });
      }
    });

    framesServiceMock.assertFrameEligibleForImage.mockImplementation(
      (frameId: string, user?: Pick<User, 'role' | 'subscriptionActive'>) => {
        const selectedFrame =
          frameId === premiumFrameId
            ? premiumFrame
            : frameId === alternateFrameId
              ? alternateFrame
              : null;

        if (!selectedFrame) {
          throw new NotFoundException({
            code: 'FRAME_NOT_FOUND',
            message: 'Frame with the specified ID does not exist.',
          });
        }

        if (
          selectedFrame.isPremium &&
          user?.role !== UserRole.ADMIN &&
          !user?.subscriptionActive
        ) {
          throw new ForbiddenException({
            code: 'PREMIUM_SUBSCRIPTION_REQUIRED',
            message: 'This frame requires an active premium subscription.',
          });
        }

        return { id: selectedFrame.id, isPremium: selectedFrame.isPremium };
      },
    );

    uploadServiceMock.requestUploadUrl.mockImplementation(
      async (
        user: User,
        dto: {
          filename: string;
          mimeType: string;
          fileSize: number;
          frameId?: string;
          is360?: boolean;
        },
      ) => {
        if (dto.frameId) {
          await framesServiceMock.assertFrameEligibleForImage(
            dto.frameId,
            user,
          );
        }

        state.uploadSession = {
          id: uploadSessionId,
          userId: user.id,
          frameId: dto.frameId ?? null,
          filename: dto.filename,
          mimeType: dto.mimeType,
          fileSize: dto.fileSize,
          is360: dto.is360 ?? false,
          status: 'pending',
          storageKey: `tmp/${user.id}/${uploadSessionId}.jpg`,
          expiresAt: new Date('2026-03-18T12:00:00.000Z'),
          createdAt: new Date('2026-03-18T11:00:00.000Z'),
        };

        return {
          uploadSessionId,
          imageId: uploadSessionId,
          presignedUrl: `https://uploads.example.com/${uploadSessionId}`,
          storageKey: state.uploadSession.storageKey,
          expiresAt: state.uploadSession.expiresAt,
          maxFileSize: 52428800,
        };
      },
    );

    uploadServiceMock.getUploadSession.mockImplementation(
      (id: string, userId: string) => {
        if (!state.uploadSession || state.uploadSession.id !== id) {
          throw new NotFoundException({
            code: 'UPLOAD_SESSION_NOT_FOUND',
            message: 'Upload session not found',
          });
        }

        if (state.uploadSession.userId !== userId) {
          throw new ForbiddenException({
            code: 'IMAGE_NOT_OWNED',
            message: 'You do not own this upload session',
          });
        }

        return {
          id: state.uploadSession.id,
          status: state.uploadSession.status,
          expiresAt: state.uploadSession.expiresAt,
          storageKey: state.uploadSession.storageKey,
          createdAt: state.uploadSession.createdAt,
          errorMessage: null,
        };
      },
    );

    uploadServiceMock.completeUpload.mockImplementation(
      (
        id: string,
        userId: string,
        dto: {
          title?: string;
          description?: string;
          transform?: {
            version: 1;
            zoom: number;
            offsetX: number;
            offsetY: number;
            rotation?: number;
          };
        },
      ) => {
        if (!state.uploadSession || state.uploadSession.id !== id) {
          throw new NotFoundException({
            code: 'UPLOAD_SESSION_NOT_FOUND',
            message: 'Upload session not found',
          });
        }

        if (state.uploadSession.userId !== userId) {
          throw new ForbiddenException({
            code: 'IMAGE_NOT_OWNED',
            message: 'You do not own this upload session',
          });
        }

        state.uploadSession.status = 'completed';
        state.image = {
          id,
          userId,
          frameId: state.uploadSession.frameId,
          pendingFrameId: null,
          frameRenderStatus: state.uploadSession.frameId
            ? FrameRenderStatus.READY
            : FrameRenderStatus.NONE,
          activeRenderRevision: state.uploadSession.frameId ? 1 : 0,
          finalRender: state.uploadSession.frameId
            ? {
                cdnUrl: `https://signed.example.com/image-renders/${id}/rev-1/large.jpg`,
                width: 1080,
                height: 1920,
                revision: 1,
              }
            : null,
          renderTransform: state.uploadSession.frameId
            ? {
                version: 1,
                zoom: 1,
                offsetX: 0,
                offsetY: 0,
                rotation: 0,
              }
            : null,
          pendingRenderTransform: null,
          title: dto.title ?? null,
          description: dto.description ?? null,
          originalFilename: state.uploadSession.filename,
          mimeType: state.uploadSession.mimeType,
          fileSize: state.uploadSession.fileSize,
          width: 1080,
          height: 1920,
          aspectRatio: '9:16',
          orientation: 'portrait',
          is360: state.uploadSession.is360,
          processingStatus: ProcessingStatus.UPLOADED,
          processingError: null,
          isPublic: false,
          thumbnailUrl: state.uploadSession.frameId
            ? `https://signed.example.com/image-renders/${id}/rev-1/thumbnail.jpg`
            : `https://signed.example.com/images/${id}/thumbnail.jpg`,
          variants: {},
          createdAt: new Date('2026-03-18T11:01:00.000Z'),
          updatedAt: new Date('2026-03-18T11:01:00.000Z'),
        };

        return {
          id,
          status: 'uploaded',
          processingStatus: ProcessingStatus.UPLOADED,
          message: 'Upload confirmed. Processing started.',
        };
      },
    );

    uploadServiceMock.cancelUploadSession.mockResolvedValue(undefined);

    imagesServiceMock.getImageById.mockImplementation(
      (id: string, userId: string) => {
        if (
          !state.image ||
          state.image.id !== id ||
          state.image.userId !== userId
        ) {
          throw new NotFoundException({
            code: 'IMAGE_NOT_FOUND',
            message: 'Image not found',
          });
        }

        return state.image;
      },
    );

    imagesServiceMock.getStorageSummary.mockResolvedValue({
      storageUsed: 5242880,
      storageLimit: 5368709120,
      pendingBytes: 0,
      remainingBytes: 5363466240,
    });
    imagesServiceMock.batchGetImages.mockResolvedValue([]);
    imagesServiceMock.listImages.mockResolvedValue({
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
    imagesServiceMock.updateImage.mockImplementation(
      async (
        id: string,
        user: User,
        dto: {
          title?: string;
          description?: string;
          frameId?: string | null;
          transform?: {
            version: 1;
            zoom: number;
            offsetX: number;
            offsetY: number;
            rotation?: number;
          } | null;
        },
      ) => {
        if (
          !state.image ||
          state.image.id !== id ||
          state.image.userId !== user.id
        ) {
          throw new NotFoundException({
            code: 'IMAGE_NOT_FOUND',
            message: 'Image not found',
          });
        }

        if (dto.frameId !== undefined && dto.frameId !== null) {
          await framesServiceMock.assertFrameEligibleForImage(
            dto.frameId,
            user,
          );
        }

        if (dto.title !== undefined) {
          state.image.title = dto.title;
        }

        if (dto.description !== undefined) {
          state.image.description = dto.description;
        }

        if (dto.frameId !== undefined) {
          if (dto.frameId === state.image.frameId) {
            state.image.pendingFrameId = null;
            state.image.pendingRenderTransform = null;
            state.image.frameRenderStatus = state.image.frameId
              ? FrameRenderStatus.READY
              : FrameRenderStatus.NONE;
          } else if (dto.frameId === null && state.image.frameId === null) {
            state.image.pendingFrameId = null;
            state.image.pendingRenderTransform = null;
            state.image.frameRenderStatus = FrameRenderStatus.NONE;
          } else {
            state.image.pendingFrameId = dto.frameId ?? null;
            state.image.pendingRenderTransform = null;
            state.image.frameRenderStatus = FrameRenderStatus.PENDING_REPROCESS;
          }
        }

        if (dto.transform !== undefined) {
          state.image.pendingRenderTransform =
            dto.transform === null
              ? null
              : {
                  version: 1,
                  zoom: dto.transform.zoom,
                  offsetX: dto.transform.offsetX,
                  offsetY: dto.transform.offsetY,
                  rotation: dto.transform.rotation ?? 0,
                };
          if (state.image.frameId || state.image.pendingFrameId) {
            state.image.frameRenderStatus =
              state.image.pendingRenderTransform || state.image.pendingFrameId
                ? FrameRenderStatus.PENDING_REPROCESS
                : state.image.frameId
                  ? FrameRenderStatus.READY
                  : FrameRenderStatus.NONE;
          }
        }

        state.image.updatedAt = new Date('2026-03-18T11:05:00.000Z');
        return state.image;
      },
    );
    imagesServiceMock.requestReprocess.mockImplementation(
      (
        id: string,
        user: Pick<User, 'id' | 'role'>,
        _dto?: { expectedActiveRenderRevision?: number },
      ) => {
        if (
          !state.image ||
          state.image.id !== id ||
          state.image.userId !== user.id
        ) {
          throw new NotFoundException({
            code: 'IMAGE_NOT_FOUND',
            message: 'Image not found',
          });
        }

        if (
          state.image.frameRenderStatus === FrameRenderStatus.PENDING_REPROCESS
        ) {
          if (state.image.pendingFrameId) {
            state.image.frameId = state.image.pendingFrameId;
            state.image.pendingFrameId = null;
            state.image.renderTransform = state.image.pendingRenderTransform;
            state.image.pendingRenderTransform = null;
            state.image.frameRenderStatus = FrameRenderStatus.PROCESSING;
            state.image.activeRenderRevision += 1;
            state.image.processingStatus = ProcessingStatus.PROCESSING;
            state.image.finalRender = null;
            state.image.thumbnailUrl = `https://signed.example.com/images/${id}/thumbnail.jpg`;
          } else if (state.image.pendingRenderTransform) {
            state.image.renderTransform = state.image.pendingRenderTransform;
            state.image.pendingRenderTransform = null;
            state.image.frameRenderStatus = FrameRenderStatus.PROCESSING;
            state.image.activeRenderRevision += 1;
            state.image.processingStatus = ProcessingStatus.PROCESSING;
            state.image.finalRender = null;
          } else {
            state.image.frameId = null;
            state.image.renderTransform = null;
            state.image.frameRenderStatus = FrameRenderStatus.NONE;
            state.image.activeRenderRevision += 1;
            state.image.processingStatus = ProcessingStatus.COMPLETED;
            state.image.finalRender = null;
            state.image.thumbnailUrl = `https://signed.example.com/images/${id}/thumbnail.jpg`;
          }
        }

        state.image.updatedAt = new Date('2026-03-18T11:06:00.000Z');

        return {
          imageId: id,
          frameId: state.image.frameId,
          frameRenderStatus: state.image.frameRenderStatus,
          pendingFrameId: state.image.pendingFrameId,
          activeRenderRevision: state.image.activeRenderRevision,
          queued:
            state.image.frameRenderStatus === FrameRenderStatus.PROCESSING,
          message: 'Pending frame change promoted and render refresh queued.',
        };
      },
    );
    imagesServiceMock.deleteImage.mockResolvedValue(null);

    imageProcessingServiceMock.getProcessingStatus.mockImplementation(
      (id: string, userId: string) => {
        if (
          !state.image ||
          state.image.id !== id ||
          state.image.userId !== userId
        ) {
          return null;
        }

        return {
          imageId: id,
          processingStatus: state.image.processingStatus,
          variants: Object.keys(state.image.variants),
          completedAt: null,
        };
      },
    );
  });

  afterAll(async () => {
    if (app) {
      await app.close();
    }
  });

  it('connects auth, frame eligibility, staged frame changes, and image reprocess flow', async () => {
    await request(app.getHttpServer())
      .get(`/api/v1/frames/${premiumFrameId}`)
      .expect(200)
      .expect((res) => {
        expect(res.body.success).toBe(true);
        expect(res.body.data.id).toBe(premiumFrameId);
        expect(res.body.data.isPremium).toBe(true);
      });

    await request(app.getHttpServer())
      .post('/api/v1/images/upload-url')
      .send({
        filename: 'private-photo.jpg',
        mimeType: 'image/jpeg',
        fileSize: 5242880,
        frameId: premiumFrameId,
      })
      .expect(401);

    await request(app.getHttpServer())
      .post('/api/v1/images/upload-url')
      .set('Authorization', 'Bearer free-user-token')
      .send({
        filename: 'private-photo.jpg',
        mimeType: 'image/jpeg',
        fileSize: 5242880,
        frameId: premiumFrameId,
      })
      .expect(403)
      .expect((res) => {
        expect(res.body.success).toBe(false);
        expect(res.body.error.code).toBe('PREMIUM_SUBSCRIPTION_REQUIRED');
      });

    await request(app.getHttpServer())
      .post('/api/v1/images/upload-url')
      .set('Authorization', 'Bearer premium-user-token')
      .set('User-Agent', 'images-flow-e2e')
      .send({
        filename: 'private-photo.jpg',
        mimeType: 'image/jpeg',
        fileSize: 5242880,
        frameId: premiumFrameId,
      })
      .expect(201)
      .expect((res) => {
        expect(res.body.success).toBe(true);
        expect(res.body.data.uploadSessionId).toBe(uploadSessionId);
        expect(res.body.data.imageId).toBe(uploadSessionId);
        expect(res.body.data.presignedUrl).toContain(uploadSessionId);
      });

    await request(app.getHttpServer())
      .get(`/api/v1/images/upload-sessions/${uploadSessionId}`)
      .set('Authorization', 'Bearer premium-user-token')
      .expect(200)
      .expect((res) => {
        expect(res.body.success).toBe(true);
        expect(res.body.data.status).toBe('pending');
        expect(res.body.data.storageKey).toContain(uploadSessionId);
      });

    await request(app.getHttpServer())
      .post(`/api/v1/images/${uploadSessionId}/complete`)
      .set('Authorization', 'Bearer premium-user-token')
      .send({
        title: 'Premium Photo',
        description: 'Uploaded against a premium frame.',
      })
      .expect(202)
      .expect((res) => {
        expect(res.body.success).toBe(true);
        expect(res.body.data.id).toBe(uploadSessionId);
        expect(res.body.data.processingStatus).toBe(ProcessingStatus.UPLOADED);
      });

    await request(app.getHttpServer())
      .get(`/api/v1/images/${uploadSessionId}`)
      .set('Authorization', 'Bearer premium-user-token')
      .expect(200)
      .expect((res) => {
        expect(res.body.success).toBe(true);
        expect(res.body.data.id).toBe(uploadSessionId);
        expect(res.body.data.userId).toBe(premiumUser.id);
        expect(res.body.data.frameId).toBe(premiumFrameId);
        expect(res.body.data.pendingFrameId).toBeNull();
        expect(res.body.data.frameRenderStatus).toBe(FrameRenderStatus.READY);
        expect(res.body.data.activeRenderRevision).toBe(1);
        expect(res.body.data.finalRender).toEqual({
          cdnUrl: `https://signed.example.com/image-renders/${uploadSessionId}/rev-1/large.jpg`,
          width: 1080,
          height: 1920,
          revision: 1,
        });
        expect(res.body.data.renderTransform).toEqual({
          version: 1,
          zoom: 1,
          offsetX: 0,
          offsetY: 0,
          rotation: 0,
        });
        expect(res.body.data.thumbnailUrl).toContain('image-renders');
        expect(res.body.data.isPublic).toBe(false);
      });

    await request(app.getHttpServer())
      .patch(`/api/v1/images/${uploadSessionId}`)
      .set('Authorization', 'Bearer premium-user-token')
      .send({
        frameId: alternateFrameId,
        title: 'Retouched Premium Photo',
      })
      .expect(200)
      .expect((res) => {
        expect(res.body.success).toBe(true);
        expect(res.body.data.frameId).toBe(premiumFrameId);
        expect(res.body.data.pendingFrameId).toBe(alternateFrameId);
        expect(res.body.data.frameRenderStatus).toBe(
          FrameRenderStatus.PENDING_REPROCESS,
        );
        expect(res.body.data.title).toBe('Retouched Premium Photo');
      });

    await request(app.getHttpServer())
      .post(`/api/v1/images/${uploadSessionId}/reprocess`)
      .set('Authorization', 'Bearer premium-user-token')
      .expect(202)
      .expect((res) => {
        expect(res.body.success).toBe(true);
        expect(res.body.data.imageId).toBe(uploadSessionId);
        expect(res.body.data.frameId).toBe(alternateFrameId);
        expect(res.body.data.pendingFrameId).toBeNull();
        expect(res.body.data.frameRenderStatus).toBe(
          FrameRenderStatus.PROCESSING,
        );
        expect(res.body.data.activeRenderRevision).toBe(2);
        expect(res.body.data.queued).toBe(true);
      });

    if (state.image) {
      state.image.frameRenderStatus = FrameRenderStatus.READY;
      state.image.processingStatus = ProcessingStatus.COMPLETED;
      state.image.thumbnailUrl = `https://signed.example.com/image-renders/${uploadSessionId}/rev-2/thumbnail.jpg`;
      state.image.finalRender = {
        cdnUrl: `https://signed.example.com/image-renders/${uploadSessionId}/rev-2/large.jpg`,
        width: 1080,
        height: 1920,
        revision: 2,
      };
    }

    await request(app.getHttpServer())
      .get(`/api/v1/images/${uploadSessionId}`)
      .set('Authorization', 'Bearer premium-user-token')
      .expect(200)
      .expect((res) => {
        expect(res.body.success).toBe(true);
        expect(res.body.data.frameId).toBe(alternateFrameId);
        expect(res.body.data.pendingFrameId).toBeNull();
        expect(res.body.data.frameRenderStatus).toBe(FrameRenderStatus.READY);
        expect(res.body.data.thumbnailUrl).toContain('rev-2');
        expect(res.body.data.finalRender).toEqual({
          cdnUrl: `https://signed.example.com/image-renders/${uploadSessionId}/rev-2/large.jpg`,
          width: 1080,
          height: 1920,
          revision: 2,
        });
      });

    await request(app.getHttpServer())
      .get(`/api/v1/images/${uploadSessionId}/processing-status`)
      .set('Authorization', 'Bearer premium-user-token')
      .expect(200)
      .expect((res) => {
        expect(res.body.success).toBe(true);
        expect(res.body.data.imageId).toBe(uploadSessionId);
        expect(res.body.data.processingStatus).toBe(ProcessingStatus.COMPLETED);
        expect(res.body.data.variants).toEqual([]);
      });

    await request(app.getHttpServer())
      .delete(`/api/v1/images/${uploadSessionId}`)
      .set('Authorization', 'Bearer premium-user-token')
      .expect(200)
      .expect((res) => {
        expect(res.body.success).toBe(true);
        expect(res.body.data).toBeNull();
      });

    expect(framesServiceMock.getFrameById).toHaveBeenCalledWith(
      premiumFrameId,
      undefined,
    );
    expect(framesServiceMock.assertFrameEligibleForImage).toHaveBeenCalledTimes(
      3,
    );
    expect(uploadServiceMock.requestUploadUrl).toHaveBeenCalledTimes(2);
    expect(uploadServiceMock.completeUpload).toHaveBeenCalledWith(
      uploadSessionId,
      premiumUser.id,
      expect.objectContaining({
        title: 'Premium Photo',
        description: 'Uploaded against a premium frame.',
      }),
    );
    expect(imagesServiceMock.updateImage).toHaveBeenCalledWith(
      uploadSessionId,
      expect.objectContaining({ id: premiumUser.id }),
      expect.objectContaining({
        frameId: alternateFrameId,
        title: 'Retouched Premium Photo',
      }),
    );
    expect(imagesServiceMock.requestReprocess).toHaveBeenCalledWith(
      uploadSessionId,
      expect.objectContaining({ id: premiumUser.id }),
      {},
    );
  });
});
