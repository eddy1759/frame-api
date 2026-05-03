/* eslint-disable @typescript-eslint/no-unsafe-argument */
import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  HttpException,
  HttpStatus,
  INestApplication,
  Injectable,
  Module,
  NotFoundException,
  UnauthorizedException,
  UnprocessableEntityException,
  ValidationPipe,
} from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import * as request from 'supertest';
import { Request } from 'express';

import { AiFramesController } from '../src/ai-frames/controllers/ai-frames.controller';
import { AiFramesAdminController } from '../src/ai-frames/controllers/ai-frames-admin.controller';
import { AiFrameService } from '../src/ai-frames/services/ai-frame.service';
import { AiFrameQueryService } from '../src/ai-frames/services/ai-frame-query.service';
import { AiFrameAdminGuard } from '../src/ai-frames/guards/ai-frame-admin.guard';
import { AiFrameIterationGuard } from '../src/ai-frames/guards/ai-frame-iteration.guard';
import { AiFrameOwnerGuard } from '../src/ai-frames/guards/ai-frame-owner.guard';
import {
  AiFrameIterationStatus,
  AiFrameJobStatus,
} from '../src/ai-frames/enums';
import { JwtAuthGuard } from '../src/auth/guards/jwt-auth.guard';
import { GlobalExceptionFilter } from '../src/common/filters/http-exception.filter';
import { TransformInterceptor } from '../src/common/interceptors/transform.interceptor';
import { User } from '../src/auth/entities/user.entity';
import { UserRole } from '../src/auth/enums/user-role.enum';
import { UserStatus } from '../src/auth/enums/user-status.enum';

const adminUser: User = {
  id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  email: 'admin@test.com',
  displayName: 'Admin User',
  avatarUrl: null,
  status: UserStatus.ACTIVE,
  role: UserRole.ADMIN,
  subscriptionActive: true,
  storageUsed: 0,
  storageLimit: 5368709120,
  createdAt: new Date('2026-04-25T12:00:00.000Z'),
  updatedAt: new Date('2026-04-25T12:00:00.000Z'),
  lastLoginAt: null,
  deletedAt: null,
  oauthAccounts: [],
  refreshTokens: [],
};

const ownerUser: User = {
  ...adminUser,
  id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
  email: 'owner@test.com',
  displayName: 'Owner User',
  role: UserRole.USER,
  subscriptionActive: true,
};

const otherUser: User = {
  ...ownerUser,
  id: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
  email: 'other@test.com',
  displayName: 'Other User',
};

const limitedUser: User = {
  ...ownerUser,
  id: 'dddddddd-dddd-4ddd-8ddd-dddddddddddd',
  email: 'limited@test.com',
  displayName: 'Limited User',
};

type IterationRecord = {
  id: string;
  iterationNumber: number;
  status: AiFrameIterationStatus;
  feedback: string | null;
  frameId: string | null;
  renderMode: 'overlay' | 'scene';
  scenePlacementStatus: 'pending_annotation' | 'ready' | null;
  provider: string;
  modelVersion: string;
  generationMs: number;
  thumbnailUrl: string | null;
  startedAt: Date | null;
  completedAt: Date | null;
  failedAt: Date | null;
  cleanedAt: Date | null;
  createdAt: Date;
};

type JobRecord = {
  id: string;
  userId: string;
  status: AiFrameJobStatus;
  generationMode: 'overlay' | 'scene';
  prompt: string;
  aspectRatio: string;
  latestIterationNumber: number;
  acceptedIterationId: string | null;
  promotedFrameId: string | null;
  cancelRequestedAt: Date | null;
  lastErrorCode: string | null;
  lastErrorMessage: string | null;
  completedAt: Date | null;
  acceptedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
  iterations: IterationRecord[];
};

const state: {
  jobs: Map<string, JobRecord>;
  nextJobNumber: number;
  nextFrameNumber: number;
} = {
  jobs: new Map<string, JobRecord>(),
  nextJobNumber: 1,
  nextFrameNumber: 1,
};

const makeUuid = (seed: number): string =>
  `00000000-0000-4000-8000-${String(seed).padStart(12, '0')}`;

const makeIteration = (
  iterationNumber: number,
  feedback: string | null,
  options: {
    renderMode?: 'overlay' | 'scene';
    scenePlacementStatus?: 'pending_annotation' | 'ready' | null;
  } = {},
): IterationRecord => {
  const frameSeed = state.nextFrameNumber++;
  const frameId = `frame-${String(frameSeed).padStart(3, '0')}`;

  return {
    id: makeUuid(frameSeed),
    iterationNumber,
    status: AiFrameIterationStatus.COMPLETED,
    feedback,
    frameId,
    renderMode: options.renderMode ?? 'overlay',
    scenePlacementStatus: options.scenePlacementStatus ?? null,
    provider: 'dalle3',
    modelVersion: 'dall-e-3',
    generationMs: 1450,
    thumbnailUrl: `https://signed.example.com/frames/${frameId}/thumbnail-md.png`,
    startedAt: new Date('2026-04-25T12:01:00.000Z'),
    completedAt: new Date('2026-04-25T12:01:05.000Z'),
    failedAt: null,
    cleanedAt: null,
    createdAt: new Date('2026-04-25T12:01:00.000Z'),
  };
};

const buildFramePayload = (
  frameId: string,
  prompt: string,
  isActive = false,
  options: {
    renderMode?: 'overlay' | 'scene';
    scenePlacementStatus?: 'pending_annotation' | 'ready' | null;
  } = {},
) => ({
  id: frameId,
  name: `AI ${prompt}`,
  slug: `ai-${frameId}`,
  description: prompt,
  aspectRatio: '9:16',
  width: 1080,
  height: 1920,
  orientation: 'portrait',
  isAiGenerated: true,
  isActive,
  metadata: {
    ...(options.renderMode === 'scene'
      ? {
          renderMode: 'scene',
          scenePlacementStatus:
            options.scenePlacementStatus ?? 'pending_annotation',
          ...(options.scenePlacementStatus === 'ready'
            ? {
                scenePlacement: {
                  version: 1,
                  transform: 'affine-quad',
                  fit: 'cover',
                  corners: {
                    topLeft: { x: 0.2, y: 0.2 },
                    topRight: { x: 0.8, y: 0.2 },
                    bottomRight: { x: 0.8, y: 0.8 },
                    bottomLeft: { x: 0.2, y: 0.8 },
                  },
                },
              }
            : {}),
        }
      : {
          imagePlacement: {
            version: 1,
            fit: 'cover',
            window: {
              x: 0.125,
              y: 0.125,
              width: 0.75,
              height: 0.75,
            },
          },
          renderMode: 'overlay',
        }),
  },
  svgUrl:
    options.renderMode === 'scene'
      ? null
      : `https://signed.example.com/frames/${frameId}/original.svg`,
  editorPreviewUrl: `https://signed.example.com/frames/${frameId}/editor-preview.png`,
  thumbnailUrl: `https://signed.example.com/frames/${frameId}/thumbnail-md.png`,
});

const aiFrameServiceMock = {
  generate: jest.fn(
    (user: User, dto: { prompt: string; aspectRatio: string }) => {
      if (user.id === limitedUser.id) {
        throw new HttpException(
          {
            code: 'AI_FRAME_RATE_LIMIT_EXCEEDED',
            message: 'Daily AI frame generation limit reached.',
          },
          HttpStatus.TOO_MANY_REQUESTS,
        );
      }

      if (/flagged/i.test(dto.prompt)) {
        throw new UnprocessableEntityException({
          code: 'AI_FRAME_PROMPT_FLAGGED',
          message: 'The supplied prompt was flagged by content moderation.',
        });
      }

      const jobId = `job-${String(state.nextJobNumber++).padStart(3, '0')}`;
      const iteration = makeIteration(1, null);
      const job: JobRecord = {
        id: jobId,
        userId: user.id,
        status: AiFrameJobStatus.COMPLETED,
        generationMode: 'overlay',
        prompt: dto.prompt,
        aspectRatio: dto.aspectRatio,
        latestIterationNumber: 1,
        acceptedIterationId: null,
        promotedFrameId: null,
        cancelRequestedAt: null,
        lastErrorCode: null,
        lastErrorMessage: null,
        completedAt: new Date('2026-04-25T12:01:05.000Z'),
        acceptedAt: null,
        createdAt: new Date('2026-04-25T12:00:30.000Z'),
        updatedAt: new Date('2026-04-25T12:01:05.000Z'),
        iterations: [iteration],
      };

      state.jobs.set(jobId, job);

      return {
        jobId,
        status: AiFrameJobStatus.QUEUED,
        generationMode: 'overlay',
        iterationId: iteration.id,
        iterationNumber: 1,
      };
    },
  ),
  generateScene: jest.fn(
    (user: User, dto: { prompt: string; aspectRatio: string }) => {
      const jobId = `job-${String(state.nextJobNumber++).padStart(3, '0')}`;
      const iteration = makeIteration(1, null, {
        renderMode: 'scene',
        scenePlacementStatus: 'pending_annotation',
      });
      const job: JobRecord = {
        id: jobId,
        userId: user.id,
        status: AiFrameJobStatus.COMPLETED,
        generationMode: 'scene',
        prompt: dto.prompt,
        aspectRatio: dto.aspectRatio,
        latestIterationNumber: 1,
        acceptedIterationId: null,
        promotedFrameId: null,
        cancelRequestedAt: null,
        lastErrorCode: null,
        lastErrorMessage: null,
        completedAt: new Date('2026-04-25T12:01:05.000Z'),
        acceptedAt: null,
        createdAt: new Date('2026-04-25T12:00:30.000Z'),
        updatedAt: new Date('2026-04-25T12:01:05.000Z'),
        iterations: [iteration],
      };

      state.jobs.set(jobId, job);

      return {
        jobId,
        status: AiFrameJobStatus.QUEUED,
        generationMode: 'scene',
        iterationId: iteration.id,
        iterationNumber: 1,
      };
    },
  ),
  regenerate: jest.fn(
    (_user: User, jobId: string, dto: { feedback: string }) => {
      const job = state.jobs.get(jobId);
      if (!job) {
        throw new NotFoundException({
          code: 'AI_FRAME_JOB_NOT_FOUND',
          message: 'AI frame job not found.',
        });
      }

      const nextIterationNumber = job.latestIterationNumber + 1;
      const iteration = makeIteration(nextIterationNumber, dto.feedback);
      job.iterations.push(iteration);
      job.latestIterationNumber = nextIterationNumber;
      job.status = AiFrameJobStatus.COMPLETED;
      job.completedAt = iteration.completedAt;
      job.updatedAt = new Date('2026-04-25T12:02:05.000Z');

      return {
        jobId,
        iterationId: iteration.id,
        iterationNumber: iteration.iterationNumber,
        status: AiFrameJobStatus.QUEUED,
      };
    },
  ),
  accept: jest.fn(
    (userId: string, jobId: string, dto: { iterationId: string }) => {
      const job = state.jobs.get(jobId);
      if (!job || job.userId !== userId) {
        throw new NotFoundException({
          code: 'AI_FRAME_JOB_NOT_FOUND',
          message: 'AI frame job not found.',
        });
      }

      const iteration = job.iterations.find(
        (item) => item.id === dto.iterationId,
      );
      if (!iteration || !iteration.frameId) {
        throw new NotFoundException({
          code: 'AI_FRAME_ITERATION_NOT_FOUND',
          message: 'AI frame iteration not found.',
        });
      }

      if (
        job.generationMode === 'scene' &&
        iteration.scenePlacementStatus !== 'ready'
      ) {
        throw new HttpException(
          {
            code: 'SCENE_PLACEMENT_REQUIRED',
            message:
              'Scene AI frames must be annotated before they can be accepted.',
          },
          HttpStatus.CONFLICT,
        );
      }

      job.status = AiFrameJobStatus.ACCEPTED;
      job.acceptedIterationId = iteration.id;
      job.acceptedAt = new Date('2026-04-25T12:03:00.000Z');

      return {
        jobId,
        acceptedIterationId: iteration.id,
        frameId: iteration.frameId,
        generationMode: job.generationMode,
        status: job.status,
      };
    },
  ),
  updateScenePlacement: jest.fn(
    (
      jobId: string,
      dto: { corners: Record<string, { x: number; y: number }> },
    ) => {
      const job = state.jobs.get(jobId);
      if (!job) {
        throw new NotFoundException({
          code: 'AI_FRAME_JOB_NOT_FOUND',
          message: 'AI frame job not found.',
        });
      }

      const latestIteration = job.iterations[job.iterations.length - 1];
      if (!latestIteration) {
        throw new NotFoundException({
          code: 'AI_FRAME_NOT_READY',
          message:
            'No completed scene frame iteration is available for placement annotation.',
        });
      }

      latestIteration.scenePlacementStatus = 'ready';

      return {
        jobId,
        frameId: latestIteration.frameId,
        generationMode: job.generationMode,
        scenePlacementStatus: 'ready',
        corners: dto.corners,
        message: 'Scene placement annotation saved.',
      };
    },
  ),
  cancel: jest.fn((userId: string, jobId: string) => {
    const job = state.jobs.get(jobId);
    if (!job || job.userId !== userId) {
      throw new NotFoundException({
        code: 'AI_FRAME_JOB_NOT_FOUND',
        message: 'AI frame job not found.',
      });
    }

    job.status = AiFrameJobStatus.CANCELLED;
    job.cancelRequestedAt = new Date('2026-04-25T12:04:00.000Z');

    return {
      jobId,
      status: job.status,
      cancelRequestedAt: job.cancelRequestedAt,
    };
  }),
  updateMetadata: jest.fn(
    (userId: string, jobId: string, dto: { name?: string }) => {
      const job = state.jobs.get(jobId);
      if (!job || job.userId !== userId) {
        throw new NotFoundException({
          code: 'AI_FRAME_JOB_NOT_FOUND',
          message: 'AI frame job not found.',
        });
      }

      const acceptedIteration = job.iterations.find(
        (item) => item.id === job.acceptedIterationId,
      );

      return {
        jobId,
        frameId:
          acceptedIteration?.frameId ?? job.iterations[0]?.frameId ?? null,
        message: dto.name
          ? `AI frame metadata updated for ${dto.name}.`
          : 'AI frame metadata updated.',
      };
    },
  ),
  softDelete: jest.fn((userId: string, jobId: string) => {
    const job = state.jobs.get(jobId);
    if (!job || job.userId !== userId) {
      throw new NotFoundException({
        code: 'AI_FRAME_JOB_NOT_FOUND',
        message: 'AI frame job not found.',
      });
    }

    job.status = AiFrameJobStatus.DELETED;
    state.jobs.delete(jobId);
  }),
  retryAsAdmin: jest.fn((jobId: string) => {
    const job = state.jobs.get(jobId);
    if (!job) {
      throw new NotFoundException({
        code: 'AI_FRAME_JOB_NOT_FOUND',
        message: 'AI frame job not found.',
      });
    }

    const nextIterationNumber = job.latestIterationNumber + 1;
    const iteration = makeIteration(nextIterationNumber, null);
    job.iterations.push(iteration);
    job.latestIterationNumber = nextIterationNumber;
    job.status = AiFrameJobStatus.COMPLETED;

    return {
      jobId,
      iterationId: iteration.id,
      status: AiFrameJobStatus.QUEUED,
    };
  }),
  promote: jest.fn((jobId: string) => {
    const job = state.jobs.get(jobId);
    if (!job) {
      throw new NotFoundException({
        code: 'AI_FRAME_JOB_NOT_FOUND',
        message: 'AI frame job not found.',
      });
    }

    job.promotedFrameId = `public-${jobId}`;

    return {
      jobId,
      promotedFrameId: job.promotedFrameId,
    };
  }),
  hardDelete: jest.fn((jobId: string) => {
    state.jobs.delete(jobId);
  }),
};

const aiFrameQueryServiceMock = {
  getJobStatus: jest.fn((jobId: string) => {
    const job = state.jobs.get(jobId);
    if (!job) {
      throw new NotFoundException({
        code: 'AI_FRAME_JOB_NOT_FOUND',
        message: 'AI frame job not found.',
      });
    }

    const latestIteration = job.iterations[job.iterations.length - 1] ?? null;

    return {
      jobId: job.id,
      status: job.status,
      generationMode: job.generationMode,
      prompt: job.prompt,
      aspectRatio: job.aspectRatio,
      latestIterationNumber: job.latestIterationNumber,
      acceptedIterationId: job.acceptedIterationId,
      promotedFrameId: job.promotedFrameId,
      cancelRequestedAt: job.cancelRequestedAt,
      lastErrorCode: job.lastErrorCode,
      lastErrorMessage: job.lastErrorMessage,
      completedAt: job.completedAt,
      acceptedAt: job.acceptedAt,
      latestIteration: latestIteration
        ? {
            id: latestIteration.id,
            iterationNumber: latestIteration.iterationNumber,
            status: latestIteration.status,
            frameId: latestIteration.frameId,
            provider: latestIteration.provider,
            modelVersion: latestIteration.modelVersion,
            scenePlacementStatus: latestIteration.scenePlacementStatus,
            errorCode: null,
            errorMessage: null,
            startedAt: latestIteration.startedAt,
            completedAt: latestIteration.completedAt,
          }
        : null,
    };
  }),
  getJobResult: jest.fn((jobId: string) => {
    const job = state.jobs.get(jobId);
    if (!job) {
      throw new NotFoundException({
        code: 'AI_FRAME_JOB_NOT_FOUND',
        message: 'AI frame job not found.',
      });
    }

    const iteration =
      job.iterations.find((item) => item.id === job.acceptedIterationId) ??
      job.iterations[job.iterations.length - 1];

    if (!iteration?.frameId) {
      throw new NotFoundException({
        code: 'AI_FRAME_NOT_READY',
        message: 'The AI frame result is not ready yet.',
      });
    }

    return {
      jobId: job.id,
      status: job.status,
      generationMode: job.generationMode,
      acceptedIterationId: job.acceptedIterationId,
      promotedFrameId: job.promotedFrameId,
      scenePlacementStatus: iteration.scenePlacementStatus,
      iteration: {
        id: iteration.id,
        iterationNumber: iteration.iterationNumber,
        status: iteration.status,
        provider: iteration.provider,
        modelVersion: iteration.modelVersion,
        generationMs: iteration.generationMs,
        completedAt: iteration.completedAt,
      },
      frame: buildFramePayload(
        iteration.frameId,
        job.prompt,
        job.acceptedIterationId === iteration.id,
        {
          renderMode: iteration.renderMode,
          scenePlacementStatus: iteration.scenePlacementStatus,
        },
      ),
    };
  }),
  listJobIterations: jest.fn((jobId: string) => {
    const job = state.jobs.get(jobId);
    if (!job) {
      throw new NotFoundException({
        code: 'AI_FRAME_JOB_NOT_FOUND',
        message: 'AI frame job not found.',
      });
    }

    return job.iterations
      .slice()
      .sort((left, right) => right.iterationNumber - left.iterationNumber)
      .map((iteration) => ({
        id: iteration.id,
        iterationNumber: iteration.iterationNumber,
        status: iteration.status,
        feedback: iteration.feedback,
        provider: iteration.provider,
        modelVersion: iteration.modelVersion,
        generationMs: iteration.generationMs,
        frameId: iteration.frameId,
        thumbnailUrl: iteration.thumbnailUrl,
        errorCode: null,
        errorMessage: null,
        startedAt: iteration.startedAt,
        completedAt: iteration.completedAt,
        failedAt: iteration.failedAt,
        cleanedAt: iteration.cleanedAt,
        createdAt: iteration.createdAt,
      }));
  }),
  listJobs: jest.fn((userId: string) => {
    const jobs = Array.from(state.jobs.values()).filter(
      (job) => job.userId === userId,
    );

    return {
      data: jobs.map((job) => ({
        jobId: job.id,
        status: job.status,
        prompt: job.prompt,
        aspectRatio: job.aspectRatio,
        latestIterationNumber: job.latestIterationNumber,
        generationMode: job.generationMode,
        acceptedIterationId: job.acceptedIterationId,
        createdAt: job.createdAt,
        updatedAt: job.updatedAt,
        latestIteration: {
          id: job.iterations[job.iterations.length - 1]?.id ?? null,
          iterationNumber:
            job.iterations[job.iterations.length - 1]?.iterationNumber ?? null,
          status: job.iterations[job.iterations.length - 1]?.status ?? null,
          frameId: job.iterations[job.iterations.length - 1]?.frameId ?? null,
          provider: job.iterations[job.iterations.length - 1]?.provider ?? null,
        },
      })),
      meta: {
        pagination: {
          page: 1,
          limit: 20,
          total: jobs.length,
          totalPages: 1,
          hasNext: false,
          hasPrevious: false,
        },
      },
    };
  }),
  listAdminJobs: jest.fn(() => {
    const jobs = Array.from(state.jobs.values());

    return {
      data: jobs.map((job) => ({
        jobId: job.id,
        userId: job.userId,
        status: job.status,
        prompt: job.prompt,
        generationMode: job.generationMode,
        latestIterationNumber: job.latestIterationNumber,
        acceptedIterationId: job.acceptedIterationId,
        promotedFrameId: job.promotedFrameId,
        createdAt: job.createdAt,
        updatedAt: job.updatedAt,
      })),
      meta: {
        pagination: {
          page: 1,
          limit: 20,
          total: jobs.length,
          totalPages: 1,
          hasNext: false,
          hasPrevious: false,
        },
      },
    };
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

    if (authorization === 'Bearer admin-token') {
      requestObj.user = adminUser;
      return true;
    }

    if (authorization === 'Bearer owner-token') {
      requestObj.user = ownerUser;
      return true;
    }

    if (authorization === 'Bearer other-token') {
      requestObj.user = otherUser;
      return true;
    }

    if (authorization === 'Bearer limited-token') {
      requestObj.user = limitedUser;
      return true;
    }

    throw new UnauthorizedException({
      code: 'AUTH_INVALID_TOKEN',
      message: 'Authentication token is missing or invalid.',
    });
  }
}

@Injectable()
class TestAiFrameOwnerGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const requestObj = context.switchToHttp().getRequest<
      Request & {
        user?: User;
        params: { jobId?: string };
      }
    >();

    const jobId = requestObj.params.jobId;
    const job = jobId ? state.jobs.get(jobId) : null;

    if (!job) {
      throw new NotFoundException({
        code: 'AI_FRAME_JOB_NOT_FOUND',
        message: 'AI frame job not found.',
      });
    }

    if (
      requestObj.user?.role !== UserRole.ADMIN &&
      job.userId !== requestObj.user?.id
    ) {
      throw new ForbiddenException({
        code: 'AI_FRAME_NOT_OWNED',
        message: 'You do not have access to this AI frame job.',
      });
    }

    return true;
  }
}

@Injectable()
class TestAiFrameIterationGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const requestObj = context.switchToHttp().getRequest<
      Request & {
        params: { jobId?: string };
        body: { iterationId?: string };
      }
    >();

    const job = requestObj.params.jobId
      ? state.jobs.get(requestObj.params.jobId)
      : null;
    const iteration = job?.iterations.find(
      (item) => item.id === requestObj.body.iterationId,
    );

    if (!iteration) {
      throw new NotFoundException({
        code: 'AI_FRAME_ITERATION_NOT_FOUND',
        message: 'AI frame iteration not found.',
      });
    }

    return true;
  }
}

@Injectable()
class TestAiFrameAdminGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const requestObj = context
      .switchToHttp()
      .getRequest<Request & { user?: User }>();

    if (requestObj.user?.role !== UserRole.ADMIN) {
      throw new ForbiddenException({
        code: 'AUTH_INSUFFICIENT_ROLE',
        message: "You don't have permission to access this resource",
      });
    }

    return true;
  }
}

@Module({
  controllers: [AiFramesController, AiFramesAdminController],
  providers: [
    {
      provide: AiFrameService,
      useValue: aiFrameServiceMock,
    },
    {
      provide: AiFrameQueryService,
      useValue: aiFrameQueryServiceMock,
    },
    {
      provide: JwtAuthGuard,
      useClass: TestJwtGuard,
    },
    {
      provide: AiFrameOwnerGuard,
      useClass: TestAiFrameOwnerGuard,
    },
    {
      provide: AiFrameIterationGuard,
      useClass: TestAiFrameIterationGuard,
    },
    {
      provide: AiFrameAdminGuard,
      useClass: TestAiFrameAdminGuard,
    },
  ],
})
class AiFramesFlowE2eModule {}

describe('AI Frames Flow API (e2e)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AiFramesFlowE2eModule],
    })
      .overrideGuard(JwtAuthGuard)
      .useClass(TestJwtGuard)
      .overrideGuard(AiFrameOwnerGuard)
      .useClass(TestAiFrameOwnerGuard)
      .overrideGuard(AiFrameIterationGuard)
      .useClass(TestAiFrameIterationGuard)
      .overrideGuard(AiFrameAdminGuard)
      .useClass(TestAiFrameAdminGuard)
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
    state.jobs.clear();
    state.nextJobNumber = 1;
    state.nextFrameNumber = 1;
    jest.clearAllMocks();
  });

  afterAll(async () => {
    if (app) {
      await app.close();
    }
  });

  it('covers the authenticated user AI frame job flow end-to-end', async () => {
    const generateResponse = await request(app.getHttpServer())
      .post('/api/v1/ai-frames/generate')
      .set('Authorization', 'Bearer owner-token')
      .send({
        prompt: 'A luxurious floral wedding frame',
        aspectRatio: '9:16',
        styleHint: 'romantic editorial',
      })
      .expect(202);

    expect(generateResponse.body.success).toBe(true);
    const jobId = generateResponse.body.data.jobId as string;
    const firstIterationId = generateResponse.body.data.iterationId as string;

    await request(app.getHttpServer())
      .get('/api/v1/ai-frames/jobs')
      .set('Authorization', 'Bearer owner-token')
      .expect(200)
      .expect((res) => {
        expect(res.body.success).toBe(true);
        expect(res.body.data.data).toHaveLength(1);
        expect(res.body.data.data[0].jobId).toBe(jobId);
      });

    await request(app.getHttpServer())
      .get(`/api/v1/ai-frames/jobs/${jobId}/status`)
      .set('Authorization', 'Bearer owner-token')
      .expect(200)
      .expect((res) => {
        expect(res.body.success).toBe(true);
        expect(res.body.data.status).toBe(AiFrameJobStatus.COMPLETED);
        expect(res.body.data.latestIteration.id).toBe(firstIterationId);
      });

    await request(app.getHttpServer())
      .get(`/api/v1/ai-frames/jobs/${jobId}/result`)
      .set('Authorization', 'Bearer owner-token')
      .expect(200)
      .expect((res) => {
        expect(res.body.success).toBe(true);
        expect(res.body.data.frame.isAiGenerated).toBe(true);
        expect(res.body.data.frame.thumbnailUrl).toContain('thumbnail-md.png');
      });

    const regenerateResponse = await request(app.getHttpServer())
      .post(`/api/v1/ai-frames/jobs/${jobId}/regenerate`)
      .set('Authorization', 'Bearer owner-token')
      .send({ feedback: 'Make the border more delicate.' })
      .expect(202);

    const regeneratedIterationId = regenerateResponse.body.data
      .iterationId as string;

    await request(app.getHttpServer())
      .get(`/api/v1/ai-frames/jobs/${jobId}/iterations`)
      .set('Authorization', 'Bearer owner-token')
      .expect(200)
      .expect((res) => {
        expect(res.body.success).toBe(true);
        expect(res.body.data).toHaveLength(2);
        expect(res.body.data[0].id).toBe(regeneratedIterationId);
      });

    await request(app.getHttpServer())
      .post(`/api/v1/ai-frames/jobs/${jobId}/accept`)
      .set('Authorization', 'Bearer owner-token')
      .send({ iterationId: regeneratedIterationId })
      .expect(201)
      .expect((res) => {
        expect(res.body.success).toBe(true);
        expect(res.body.data.acceptedIterationId).toBe(regeneratedIterationId);
        expect(res.body.data.status).toBe(AiFrameJobStatus.ACCEPTED);
      });

    await request(app.getHttpServer())
      .patch(`/api/v1/ai-frames/jobs/${jobId}/metadata`)
      .set('Authorization', 'Bearer owner-token')
      .send({ name: 'Wedding Luxe Frame' })
      .expect(200)
      .expect((res) => {
        expect(res.body.success).toBe(true);
        expect(res.body.data.jobId).toBe(jobId);
      });

    await request(app.getHttpServer())
      .post(`/api/v1/ai-frames/jobs/${jobId}/cancel`)
      .set('Authorization', 'Bearer owner-token')
      .expect(202)
      .expect((res) => {
        expect(res.body.success).toBe(true);
        expect(res.body.data.status).toBe(AiFrameJobStatus.CANCELLED);
      });
  });

  it('returns moderation and rate-limit errors in the standard envelope', async () => {
    await request(app.getHttpServer())
      .post('/api/v1/ai-frames/generate')
      .set('Authorization', 'Bearer owner-token')
      .send({
        prompt: 'flagged prompt',
        aspectRatio: '9:16',
      })
      .expect(422)
      .expect((res) => {
        expect(res.body.success).toBe(false);
        expect(res.body.error.code).toBe('AI_FRAME_PROMPT_FLAGGED');
      });

    await request(app.getHttpServer())
      .post('/api/v1/ai-frames/generate')
      .set('Authorization', 'Bearer limited-token')
      .send({
        prompt: 'A festive holiday frame',
        aspectRatio: '9:16',
      })
      .expect(429)
      .expect((res) => {
        expect(res.body.success).toBe(false);
        expect(res.body.error.code).toBe('AI_FRAME_RATE_LIMIT_EXCEEDED');
      });
  });

  it('enforces ownership on private AI frame job routes', async () => {
    const generateResponse = await request(app.getHttpServer())
      .post('/api/v1/ai-frames/generate')
      .set('Authorization', 'Bearer owner-token')
      .send({
        prompt: 'A cinematic silver frame',
        aspectRatio: '9:16',
      })
      .expect(202);

    const jobId = generateResponse.body.data.jobId as string;

    await request(app.getHttpServer())
      .get(`/api/v1/ai-frames/jobs/${jobId}/status`)
      .set('Authorization', 'Bearer other-token')
      .expect(403)
      .expect((res) => {
        expect(res.body.success).toBe(false);
        expect(res.body.error.code).toBe('AI_FRAME_NOT_OWNED');
      });
  });

  it('covers the admin-only scene AI frame flow with placement gating', async () => {
    const generateResponse = await request(app.getHttpServer())
      .post('/api/v1/admin/ai-frames/generate-scene')
      .set('Authorization', 'Bearer admin-token')
      .send({
        prompt: 'A photorealistic wedding reception sign scene',
        aspectRatio: '9:16',
      })
      .expect(202);

    const jobId = generateResponse.body.data.jobId as string;
    const iterationId = generateResponse.body.data.iterationId as string;

    expect(generateResponse.body.data.generationMode).toBe('scene');

    await request(app.getHttpServer())
      .get(`/api/v1/ai-frames/jobs/${jobId}/status`)
      .set('Authorization', 'Bearer admin-token')
      .expect(200)
      .expect((res) => {
        expect(res.body.success).toBe(true);
        expect(res.body.data.generationMode).toBe('scene');
        expect(res.body.data.latestIteration.scenePlacementStatus).toBe(
          'pending_annotation',
        );
      });

    await request(app.getHttpServer())
      .post(`/api/v1/ai-frames/jobs/${jobId}/accept`)
      .set('Authorization', 'Bearer admin-token')
      .send({ iterationId })
      .expect(409)
      .expect((res) => {
        expect(res.body.success).toBe(false);
        expect(res.body.error.code).toBe('SCENE_PLACEMENT_REQUIRED');
      });

    await request(app.getHttpServer())
      .patch(`/api/v1/admin/ai-frames/jobs/${jobId}/scene-placement`)
      .set('Authorization', 'Bearer admin-token')
      .send({
        corners: {
          topLeft: { x: 0.2, y: 0.2 },
          topRight: { x: 0.8, y: 0.2 },
          bottomRight: { x: 0.8, y: 0.8 },
          bottomLeft: { x: 0.2, y: 0.8 },
        },
      })
      .expect(200)
      .expect((res) => {
        expect(res.body.success).toBe(true);
        expect(res.body.data.scenePlacementStatus).toBe('ready');
      });

    await request(app.getHttpServer())
      .get(`/api/v1/ai-frames/jobs/${jobId}/result`)
      .set('Authorization', 'Bearer admin-token')
      .expect(200)
      .expect((res) => {
        expect(res.body.success).toBe(true);
        expect(res.body.data.generationMode).toBe('scene');
        expect(res.body.data.frame.metadata.renderMode).toBe('scene');
        expect(res.body.data.frame.svgUrl).toBeNull();
      });

    await request(app.getHttpServer())
      .post(`/api/v1/ai-frames/jobs/${jobId}/accept`)
      .set('Authorization', 'Bearer admin-token')
      .send({ iterationId })
      .expect(201)
      .expect((res) => {
        expect(res.body.success).toBe(true);
        expect(res.body.data.generationMode).toBe('scene');
      });
  });

  it('covers the admin AI frame management endpoints', async () => {
    const generateResponse = await request(app.getHttpServer())
      .post('/api/v1/ai-frames/generate')
      .set('Authorization', 'Bearer owner-token')
      .send({
        prompt: 'A regal black-and-gold gala frame',
        aspectRatio: '9:16',
      })
      .expect(202);

    const jobId = generateResponse.body.data.jobId as string;
    const iterationId = generateResponse.body.data.iterationId as string;

    await request(app.getHttpServer())
      .post(`/api/v1/ai-frames/jobs/${jobId}/accept`)
      .set('Authorization', 'Bearer owner-token')
      .send({ iterationId })
      .expect(201);

    await request(app.getHttpServer())
      .get('/api/v1/admin/ai-frames/jobs')
      .set('Authorization', 'Bearer admin-token')
      .expect(200)
      .expect((res) => {
        expect(res.body.success).toBe(true);
        expect(res.body.data.data[0].jobId).toBe(jobId);
      });

    await request(app.getHttpServer())
      .post(`/api/v1/admin/ai-frames/jobs/${jobId}/retry`)
      .set('Authorization', 'Bearer admin-token')
      .expect(202)
      .expect((res) => {
        expect(res.body.success).toBe(true);
        expect(res.body.data.jobId).toBe(jobId);
      });

    await request(app.getHttpServer())
      .post(`/api/v1/admin/ai-frames/jobs/${jobId}/promote`)
      .set('Authorization', 'Bearer admin-token')
      .expect(201)
      .expect((res) => {
        expect(res.body.success).toBe(true);
        expect(res.body.data.promotedFrameId).toBe(`public-${jobId}`);
      });

    await request(app.getHttpServer())
      .delete(`/api/v1/admin/ai-frames/jobs/${jobId}/hard`)
      .set('Authorization', 'Bearer admin-token')
      .expect(204);

    await request(app.getHttpServer())
      .get('/api/v1/admin/ai-frames/jobs')
      .set('Authorization', 'Bearer admin-token')
      .expect(200)
      .expect((res) => {
        expect(res.body.success).toBe(true);
        expect(res.body.data.data).toHaveLength(0);
      });
  });
});
