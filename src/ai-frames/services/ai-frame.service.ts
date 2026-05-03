/* eslint-disable @typescript-eslint/no-unsafe-member-access */
import { randomUUID } from 'crypto';
import { HttpStatus, Inject, Injectable } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { InjectRepository } from '@nestjs/typeorm';
import { ConfigService } from '@nestjs/config';
import { Queue } from 'bullmq';
import { In, Repository } from 'typeorm';
import { User } from '../../auth/entities/user.entity';
import { UserRole } from '../../auth/enums/user-role.enum';
import { BusinessException } from '../../common/filters/business.exception';
import {
  AI_FRAME_GENERATION_QUEUE,
  AiFrameGenerationJobData,
  AiFrameJobType,
} from '../../common/queue/queue.constants';
import { RedisService } from '../../common/redis/redis.service';
import { SlugService, STORAGE_PORT, StoragePort } from '../../common/services';
import { Frame } from '../../frames/entities/frame.entity';
import { FrameAssetsService } from '../../frames/services/frame-assets.service';
import {
  normalizeFrameMetadata,
  normalizeFrameScenePlacement,
  resolveFrameRenderMode,
  resolveFrameScenePlacementStatus,
} from '../../frames/utils/frame-metadata.util';
import { FramesCacheService } from '../../frames/services/frames-cache.service';
import { AiFrameIteration, AiFrameJob } from '../entities';
import {
  AiFrameGenerationMode,
  AiFrameIterationStatus,
  AiFrameJobStatus,
} from '../enums';
import {
  AcceptIterationDto,
  GenerateAiFrameDto,
  RegenerateDto,
  UpdateScenePlacementDto,
  UpdateAiFrameMetadataDto,
} from '../dto';
import { ModerationService } from './moderation.service';
import { AiFramesCacheService } from './ai-frames-cache.service';

@Injectable()
export class AiFrameService {
  constructor(
    @InjectRepository(AiFrameJob)
    private readonly aiFrameJobRepository: Repository<AiFrameJob>,
    @InjectRepository(AiFrameIteration)
    private readonly aiFrameIterationRepository: Repository<AiFrameIteration>,
    @InjectRepository(Frame)
    private readonly frameRepository: Repository<Frame>,
    @InjectQueue(AI_FRAME_GENERATION_QUEUE)
    private readonly aiFrameQueue: Queue,
    private readonly moderationService: ModerationService,
    private readonly aiFramesCacheService: AiFramesCacheService,
    private readonly redisService: RedisService,
    private readonly configService: ConfigService,
    private readonly slugService: SlugService,
    private readonly frameAssetsService: FrameAssetsService,
    private readonly framesCacheService: FramesCacheService,
    @Inject(STORAGE_PORT)
    private readonly storageService: StoragePort,
  ) {}

  async generate(
    user: User,
    dto: GenerateAiFrameDto,
  ): Promise<Record<string, unknown>> {
    return this.generateWithMode(user, dto, AiFrameGenerationMode.OVERLAY);
  }

  async generateScene(
    user: User,
    dto: GenerateAiFrameDto,
  ): Promise<Record<string, unknown>> {
    this.assertSceneModeAccess(user);
    return this.generateWithMode(user, dto, AiFrameGenerationMode.SCENE);
  }

  async updateScenePlacement(
    jobId: string,
    dto: UpdateScenePlacementDto,
  ): Promise<Record<string, unknown>> {
    const job = await this.aiFrameJobRepository.findOne({
      where: { id: jobId },
      relations: ['iterations'],
    });

    if (!job || job.deletedAt) {
      throw new BusinessException(
        'AI_FRAME_JOB_NOT_FOUND',
        'AI frame job not found.',
        HttpStatus.NOT_FOUND,
      );
    }

    if (job.generationMode !== AiFrameGenerationMode.SCENE) {
      throw new BusinessException(
        'AI_FRAME_SCENE_MODE_REQUIRED',
        'Only scene AI frame jobs can be annotated with scene placement.',
        HttpStatus.CONFLICT,
      );
    }

    const targetIteration = this.resolveScenePlacementIteration(job);
    if (!targetIteration?.frameId) {
      throw new BusinessException(
        'AI_FRAME_NOT_READY',
        'No completed scene frame iteration is available for placement annotation.',
        HttpStatus.CONFLICT,
      );
    }

    const frame = await this.frameRepository.findOne({
      where: { id: targetIteration.frameId },
    });

    if (!frame) {
      throw new BusinessException(
        'AI_FRAME_NOT_READY',
        'The scene frame could not be loaded for annotation.',
        HttpStatus.CONFLICT,
      );
    }

    const metadata = normalizeFrameMetadata({
      ...(frame.metadata ?? {}),
      scenePlacement: normalizeFrameScenePlacement({
        version: 1,
        transform: 'affine-quad',
        fit: 'cover',
        corners: dto.corners,
      }),
      scenePlacementStatus: 'ready',
      renderMode: 'scene',
    });

    frame.metadata = metadata;
    await this.frameRepository.save(frame);
    await this.aiFramesCacheService.invalidateJob(job.id);
    await this.aiFramesCacheService.invalidateUserJobs(job.userId);

    return {
      jobId: job.id,
      frameId: frame.id,
      generationMode: job.generationMode,
      scenePlacementStatus: resolveFrameScenePlacementStatus(frame.metadata),
      message: 'Scene placement annotation saved.',
    };
  }

  private async generateWithMode(
    user: User,
    dto: GenerateAiFrameDto,
    generationMode: AiFrameGenerationMode,
  ): Promise<Record<string, unknown>> {
    await this.assertRateLimits(user);
    await this.assertJobCaps(user.id);
    await this.moderationService.assertPromptIsSafe(dto.prompt);

    const job = this.aiFrameJobRepository.create({
      userId: user.id,
      status: AiFrameJobStatus.QUEUED,
      prompt: dto.prompt.trim(),
      aspectRatio: dto.aspectRatio,
      generationMode,
      latestIterationNumber: 1,
      acceptedIterationId: null,
      promotedFrameId: null,
      cancelRequestedAt: null,
      lastErrorCode: null,
      lastErrorMessage: null,
      completedAt: null,
      acceptedAt: null,
    });

    const savedJob = await this.aiFrameJobRepository.save(job);
    const iteration = await this.aiFrameIterationRepository.save(
      this.aiFrameIterationRepository.create({
        jobId: savedJob.id,
        iterationNumber: 1,
        status: AiFrameIterationStatus.QUEUED,
        feedback: null,
        queueJobId: this.buildQueueJobId(savedJob.id, 1),
      }),
    );

    await this.enqueueIteration(savedJob, iteration);
    await this.incrementRateUsage(user);
    await this.addOpenJob(user.id, savedJob.id);
    await this.aiFramesCacheService.invalidateUserJobs(user.id);

    return {
      jobId: savedJob.id,
      status: savedJob.status,
      generationMode: savedJob.generationMode,
      iterationId: iteration.id,
      iterationNumber: iteration.iterationNumber,
    };
  }

  async regenerate(
    user: User,
    jobId: string,
    dto: RegenerateDto,
  ): Promise<Record<string, unknown>> {
    const job = await this.loadOwnedJob(jobId, user.id);
    await this.assertRateLimits(user);
    await this.assertConcurrency(user.id);
    await this.assertRegenerationAllowed(job);
    await this.moderationService.assertPromptIsSafe(
      `${job.prompt}\n${dto.feedback}`,
    );

    const nextIterationNumber = job.latestIterationNumber + 1;
    const iteration = await this.aiFrameIterationRepository.save(
      this.aiFrameIterationRepository.create({
        jobId: job.id,
        iterationNumber: nextIterationNumber,
        status: AiFrameIterationStatus.QUEUED,
        feedback: dto.feedback.trim(),
        queueJobId: this.buildQueueJobId(job.id, nextIterationNumber),
      }),
    );

    job.status = AiFrameJobStatus.QUEUED;
    job.latestIterationNumber = nextIterationNumber;
    job.lastErrorCode = null;
    job.lastErrorMessage = null;
    job.completedAt = null;
    await this.aiFrameJobRepository.save(job);

    await this.enqueueIteration(job, iteration);
    await this.incrementRateUsage(user);
    await this.addOpenJob(user.id, job.id);
    await this.setCooldown(job.id);
    await this.aiFramesCacheService.invalidateJob(job.id);
    await this.aiFramesCacheService.invalidateUserJobs(user.id);

    return {
      jobId: job.id,
      iterationId: iteration.id,
      iterationNumber: iteration.iterationNumber,
      status: job.status,
    };
  }

  async accept(
    userId: string,
    jobId: string,
    dto: AcceptIterationDto,
  ): Promise<Record<string, unknown>> {
    const job = await this.loadOwnedJob(jobId, userId);
    const iteration = await this.loadIteration(job.id, dto.iterationId);

    if (
      iteration.status !== AiFrameIterationStatus.COMPLETED ||
      !iteration.frameId
    ) {
      throw new BusinessException(
        'AI_FRAME_NOT_READY',
        'Only completed iterations can be accepted.',
        HttpStatus.CONFLICT,
      );
    }

    await this.assertFrameReadyForAcceptance(iteration.frameId);

    const iterations = await this.aiFrameIterationRepository.find({
      where: { jobId: job.id },
    });
    const frameIds = iterations
      .map((item) => item.frameId)
      .filter((value): value is string => Boolean(value));

    if (frameIds.length > 0) {
      await this.frameRepository.update(
        { id: In(frameIds) },
        { isActive: false },
      );
    }

    await this.frameRepository.update(
      { id: iteration.frameId },
      { isActive: true },
    );

    job.status = AiFrameJobStatus.ACCEPTED;
    job.acceptedIterationId = iteration.id;
    job.acceptedAt = new Date();
    await this.aiFrameJobRepository.save(job);

    await this.aiFramesCacheService.invalidateJob(job.id);
    await this.aiFramesCacheService.invalidateUserJobs(userId);

    return {
      jobId: job.id,
      acceptedIterationId: iteration.id,
      frameId: iteration.frameId,
      generationMode: job.generationMode,
      status: job.status,
    };
  }

  async cancel(
    userId: string,
    jobId: string,
  ): Promise<Record<string, unknown>> {
    const job = await this.loadOwnedJob(jobId, userId);
    const latestIteration = await this.aiFrameIterationRepository.findOne({
      where: { jobId: job.id, iterationNumber: job.latestIterationNumber },
    });

    job.cancelRequestedAt = new Date();
    await this.aiFrameJobRepository.save(job);

    if (
      latestIteration &&
      latestIteration.queueJobId &&
      latestIteration.status === AiFrameIterationStatus.QUEUED
    ) {
      const queueJob = await this.aiFrameQueue.getJob(
        latestIteration.queueJobId,
      );
      if (queueJob) {
        await queueJob.remove();
      }
      latestIteration.status = AiFrameIterationStatus.CANCELLED;
      latestIteration.failedAt = new Date();
      await this.aiFrameIterationRepository.save(latestIteration);
      job.status = AiFrameJobStatus.CANCELLED;
      await this.aiFrameJobRepository.save(job);
      await this.removeOpenJob(userId, job.id);
    }

    await this.aiFramesCacheService.invalidateJob(job.id);
    await this.aiFramesCacheService.invalidateUserJobs(userId);

    return {
      jobId: job.id,
      status: job.status,
      cancelRequestedAt: job.cancelRequestedAt,
    };
  }

  async updateMetadata(
    userId: string,
    jobId: string,
    dto: UpdateAiFrameMetadataDto,
  ): Promise<Record<string, unknown>> {
    const job = await this.loadOwnedJob(jobId, userId);
    const targetFrameId = (await this.resolveMetadataFrameId(job)) ?? null;

    if (!targetFrameId) {
      throw new BusinessException(
        'AI_FRAME_NOT_READY',
        'There is no generated frame available to update.',
        HttpStatus.CONFLICT,
      );
    }

    const frame = await this.frameRepository.findOne({
      where: { id: targetFrameId },
      select: ['id', 'name', 'slug', 'description'],
    });

    if (!frame) {
      throw new BusinessException(
        'AI_FRAME_NOT_READY',
        'There is no generated frame available to update.',
        HttpStatus.CONFLICT,
      );
    }

    if (dto.name !== undefined) {
      const nextName = dto.name.trim();
      const currentName = frame.name;
      frame.name = nextName;

      if (nextName !== currentName) {
        frame.slug = await this.slugService.generateUniqueSlug(
          nextName,
          async (candidate) => {
            const existing = await this.frameRepository.findOne({
              where: { slug: candidate },
              select: ['id'],
            });
            return Boolean(existing && existing.id !== frame.id);
          },
        );
      }
    }

    if (dto.description !== undefined) {
      frame.description = dto.description.trim();
    }

    await this.frameRepository.save(frame);

    await this.aiFramesCacheService.invalidateJob(job.id);
    await this.aiFramesCacheService.invalidateUserJobs(userId);

    return {
      jobId: job.id,
      frameId: targetFrameId,
      message: 'AI frame metadata updated.',
    };
  }

  async softDelete(userId: string, jobId: string): Promise<void> {
    const job = await this.loadOwnedJob(jobId, userId);
    const iterations = await this.aiFrameIterationRepository.find({
      where: { jobId: job.id },
    });

    await this.cleanupPrivateArtifacts(iterations);
    job.status = AiFrameJobStatus.DELETED;
    job.deletedAt = new Date();
    await this.aiFrameJobRepository.save(job);

    await this.removeOpenJob(userId, job.id);
    await this.aiFramesCacheService.invalidateJob(job.id);
    await this.aiFramesCacheService.invalidateUserJobs(userId);
  }

  async retryAsAdmin(jobId: string): Promise<Record<string, unknown>> {
    const job = await this.aiFrameJobRepository.findOne({
      where: { id: jobId },
    });

    if (!job || job.deletedAt) {
      throw new BusinessException(
        'AI_FRAME_JOB_NOT_FOUND',
        'AI frame job not found.',
        HttpStatus.NOT_FOUND,
      );
    }

    const nextIterationNumber = job.latestIterationNumber + 1;
    const iteration = await this.aiFrameIterationRepository.save(
      this.aiFrameIterationRepository.create({
        jobId: job.id,
        iterationNumber: nextIterationNumber,
        status: AiFrameIterationStatus.QUEUED,
        feedback: null,
        queueJobId: this.buildQueueJobId(job.id, nextIterationNumber),
      }),
    );

    job.status = AiFrameJobStatus.QUEUED;
    job.latestIterationNumber = nextIterationNumber;
    job.lastErrorCode = null;
    job.lastErrorMessage = null;
    await this.aiFrameJobRepository.save(job);

    await this.enqueueIteration(job, iteration);
    await this.addOpenJob(job.userId, job.id);
    await this.aiFramesCacheService.invalidateJob(job.id);
    await this.aiFramesCacheService.invalidateUserJobs(job.userId);

    return {
      jobId: job.id,
      iterationId: iteration.id,
      generationMode: job.generationMode,
      status: job.status,
    };
  }

  async promote(
    jobId: string,
    adminUserId: string,
  ): Promise<Record<string, unknown>> {
    const job = await this.aiFrameJobRepository.findOne({
      where: { id: jobId },
      relations: ['iterations'],
    });

    if (!job || job.deletedAt) {
      throw new BusinessException(
        'AI_FRAME_JOB_NOT_FOUND',
        'AI frame job not found.',
        HttpStatus.NOT_FOUND,
      );
    }

    const acceptedIteration =
      job.iterations.find(
        (iteration) => iteration.id === job.acceptedIterationId,
      ) ?? null;

    if (!acceptedIteration?.frameId) {
      throw new BusinessException(
        'AI_FRAME_PROMOTE_FAILED',
        'Only accepted AI frames can be promoted.',
        HttpStatus.CONFLICT,
      );
    }

    const sourceFrame = await this.frameRepository.findOne({
      where: { id: acceptedIteration.frameId },
    });

    if (!sourceFrame) {
      throw new BusinessException(
        'AI_FRAME_PROMOTE_FAILED',
        'Accepted AI frame could not be loaded.',
        HttpStatus.CONFLICT,
      );
    }

    const sourceRenderMode = resolveFrameRenderMode(sourceFrame.metadata);
    if (
      sourceRenderMode === 'scene' &&
      resolveFrameScenePlacementStatus(sourceFrame.metadata) !== 'ready'
    ) {
      throw new BusinessException(
        'SCENE_PLACEMENT_REQUIRED',
        'Scene AI frames must be annotated before they can be promoted.',
        HttpStatus.CONFLICT,
      );
    }

    const name = sourceFrame.name;
    const slug = await this.slugService.generateUniqueSlug(name, (candidate) =>
      this.frameRepository.exist({ where: { slug: candidate } }),
    );
    const promoted = await this.frameRepository.save(
      this.frameRepository.create({
        name,
        slug,
        description: sourceFrame.description,
        isPremium: sourceRenderMode === 'scene' ? true : false,
        price: null,
        currency: 'USD',
        width: sourceFrame.width,
        height: sourceFrame.height,
        aspectRatio: sourceFrame.aspectRatio,
        orientation: sourceFrame.orientation,
        metadata: sourceFrame.metadata,
        isActive: true,
        isAiGenerated: true,
        createdById: adminUserId,
        generatedById: null,
        sortOrder: 0,
      }),
    );

    await this.frameAssetsService.cloneFrameAssets(sourceFrame.id, promoted.id);

    job.promotedFrameId = promoted.id;
    await this.aiFrameJobRepository.save(job);
    await this.aiFramesCacheService.invalidateJob(job.id);
    await this.aiFramesCacheService.invalidateUserJobs(job.userId);

    return {
      jobId: job.id,
      promotedFrameId: promoted.id,
      generationMode: job.generationMode,
    };
  }

  async hardDelete(jobId: string): Promise<void> {
    const job = await this.aiFrameJobRepository.findOne({
      where: { id: jobId },
      relations: ['iterations'],
    });

    if (!job) {
      throw new BusinessException(
        'AI_FRAME_JOB_NOT_FOUND',
        'AI frame job not found.',
        HttpStatus.NOT_FOUND,
      );
    }

    await this.cleanupPrivateArtifacts(job.iterations);

    if (job.promotedFrameId) {
      await this.cleanupFrameArtifacts([job.promotedFrameId]);
    }

    await this.aiFrameJobRepository.delete({ id: job.id });
    await this.removeOpenJob(job.userId, job.id);
    await this.aiFramesCacheService.invalidateJob(job.id);
    await this.aiFramesCacheService.invalidateUserJobs(job.userId);
  }

  private async enqueueIteration(
    job: AiFrameJob,
    iteration: AiFrameIteration,
  ): Promise<void> {
    const payload: AiFrameGenerationJobData = {
      jobId: job.id,
      iterationId: iteration.id,
      iterationNumber: iteration.iterationNumber,
      userId: job.userId,
      prompt: job.prompt,
      aspectRatio: job.aspectRatio,
      generationMode: job.generationMode,
    };

    await this.aiFrameQueue.add(AiFrameJobType.GENERATE_ITERATION, payload, {
      jobId:
        iteration.queueJobId ??
        this.buildQueueJobId(job.id, iteration.iterationNumber),
    });
  }

  private async assertRateLimits(user: User): Promise<void> {
    const dailyKey = this.getDailyKey(user.id);
    const burstKey = this.getBurstKey(user.id);
    const dailyCount = Number((await this.redisService.get(dailyKey)) ?? '0');
    const burstCount = Number((await this.redisService.get(burstKey)) ?? '0');
    const dailyLimit = user.subscriptionActive
      ? this.configService.get<number>('ai.dailyLimitPremium', 50)
      : this.configService.get<number>('ai.dailyLimitFree', 10);
    const burstLimit = this.configService.get<number>('ai.burstLimit', 5);

    if (dailyCount >= dailyLimit) {
      throw new BusinessException(
        'AI_FRAME_RATE_LIMIT_EXCEEDED',
        'Daily AI frame generation limit reached.',
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    if (burstCount >= burstLimit) {
      throw new BusinessException(
        'AI_FRAME_BURST_LIMIT_EXCEEDED',
        'Too many AI frame requests in a short period.',
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }
  }

  private async assertJobCaps(userId: string): Promise<void> {
    await this.assertConcurrency(userId);

    const openJobs = await this.redisService.setMembers(
      this.getOpenJobsKey(userId),
    );
    const pendingLimit = this.configService.get<number>(
      'ai.pendingQueueLimitPerUser',
      3,
    );

    if (openJobs.length >= pendingLimit) {
      throw new BusinessException(
        'AI_FRAME_CONCURRENCY_LIMIT_EXCEEDED',
        'Too many AI frame jobs are already queued or processing.',
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }
  }

  private async assertConcurrency(userId: string): Promise<void> {
    const activeJobs = await this.redisService.setMembers(
      this.getActiveJobsKey(userId),
    );
    const limit = this.configService.get<number>(
      'ai.maxConcurrentJobsPerUser',
      2,
    );

    if (activeJobs.length >= limit) {
      throw new BusinessException(
        'AI_FRAME_CONCURRENCY_LIMIT_EXCEEDED',
        'Too many AI frame jobs are already in progress.',
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }
  }

  private async assertRegenerationAllowed(job: AiFrameJob): Promise<void> {
    if (job.deletedAt) {
      throw new BusinessException(
        'AI_FRAME_JOB_NOT_FOUND',
        'AI frame job not found.',
        HttpStatus.NOT_FOUND,
      );
    }

    if (job.latestIterationNumber >= this.maxIterationsPerJob) {
      throw new BusinessException(
        'AI_FRAME_ITERATION_LIMIT_REACHED',
        'The maximum number of iterations for this AI frame job has been reached.',
        HttpStatus.CONFLICT,
      );
    }

    const cooldownKey = this.getCooldownKey(job.id);
    if (await this.redisService.exists(cooldownKey)) {
      throw new BusinessException(
        'AI_FRAME_REGEN_COOLDOWN_ACTIVE',
        'Please wait before requesting another regeneration.',
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }
  }

  private async assertFrameReadyForAcceptance(frameId: string): Promise<void> {
    const frame = await this.frameRepository.findOne({
      where: { id: frameId },
      select: ['id', 'metadata'],
    });

    if (!frame) {
      throw new BusinessException(
        'AI_FRAME_NOT_READY',
        'Accepted AI frame could not be loaded.',
        HttpStatus.CONFLICT,
      );
    }

    if (
      resolveFrameRenderMode(frame.metadata) === 'scene' &&
      resolveFrameScenePlacementStatus(frame.metadata) !== 'ready'
    ) {
      throw new BusinessException(
        'SCENE_PLACEMENT_REQUIRED',
        'Scene AI frames must be annotated before they can be accepted.',
        HttpStatus.CONFLICT,
      );
    }
  }

  private resolveScenePlacementIteration(
    job: AiFrameJob,
  ): AiFrameIteration | null {
    if (job.acceptedIterationId) {
      return (
        job.iterations.find(
          (iteration) => iteration.id === job.acceptedIterationId,
        ) ?? null
      );
    }

    const completedIterations = job.iterations
      .filter(
        (iteration) => iteration.status === AiFrameIterationStatus.COMPLETED,
      )
      .sort((left, right) => right.iterationNumber - left.iterationNumber);

    return completedIterations[0] ?? null;
  }

  private assertSceneModeAccess(
    user: Pick<User, 'role' | 'subscriptionActive'>,
  ): void {
    const access = this.configService.get<'admin' | 'premium' | 'all'>(
      'ai.sceneModeAccess',
      'admin',
    );

    if (access === 'all') {
      return;
    }

    if (user.role === UserRole.ADMIN) {
      return;
    }

    if (access === 'premium' && user.subscriptionActive) {
      return;
    }

    throw new BusinessException(
      'AI_FRAME_SCENE_MODE_FORBIDDEN',
      'Scene AI frame generation is not available for this account.',
      HttpStatus.FORBIDDEN,
    );
  }

  private async loadOwnedJob(
    jobId: string,
    userId: string,
  ): Promise<AiFrameJob> {
    const job = await this.aiFrameJobRepository.findOne({
      where: { id: jobId },
      relations: ['iterations'],
    });

    if (!job || job.deletedAt) {
      throw new BusinessException(
        'AI_FRAME_JOB_NOT_FOUND',
        'AI frame job not found.',
        HttpStatus.NOT_FOUND,
      );
    }

    if (job.userId !== userId) {
      throw new BusinessException(
        'AI_FRAME_NOT_OWNED',
        'You do not have access to this AI frame job.',
        HttpStatus.FORBIDDEN,
      );
    }

    return job;
  }

  private async loadIteration(
    jobId: string,
    iterationId: string,
  ): Promise<AiFrameIteration> {
    const iteration = await this.aiFrameIterationRepository.findOne({
      where: { id: iterationId, jobId },
    });

    if (!iteration) {
      throw new BusinessException(
        'AI_FRAME_ITERATION_NOT_FOUND',
        'AI frame iteration not found.',
        HttpStatus.NOT_FOUND,
      );
    }

    return iteration;
  }

  private async resolveMetadataFrameId(
    job: AiFrameJob,
  ): Promise<string | null> {
    if (job.acceptedIterationId) {
      const acceptedIteration = job.iterations.find(
        (iteration) => iteration.id === job.acceptedIterationId,
      );
      return acceptedIteration?.frameId ?? null;
    }

    const latestCompleted = job.iterations
      .filter((iteration) => Boolean(iteration.frameId))
      .sort((left, right) => right.iterationNumber - left.iterationNumber)[0];
    return latestCompleted?.frameId ?? null;
  }

  private async cleanupPrivateArtifacts(
    iterations: AiFrameIteration[],
  ): Promise<void> {
    const rawStorageKeys = iterations
      .map((iteration) => iteration.rawImageStorageKey)
      .filter((value): value is string => Boolean(value));
    const frameIds = iterations
      .map((iteration) => iteration.frameId)
      .filter((value): value is string => Boolean(value));

    if (rawStorageKeys.length > 0) {
      await this.storageService.deleteObjects(rawStorageKeys);
    }

    await this.cleanupFrameArtifacts(frameIds);
  }

  private async cleanupFrameArtifacts(frameIds: string[]): Promise<void> {
    if (frameIds.length === 0) {
      return;
    }

    const frames = await this.frameRepository.find({
      where: { id: In(frameIds) },
      select: ['id', 'slug'],
    });

    for (const frame of frames) {
      await this.frameAssetsService.deleteFrameAssets(frame.id);
    }

    await this.frameRepository.delete({ id: In(frameIds) });

    if (frames.length > 0) {
      await this.framesCacheService.invalidateFramesList();
      await this.framesCacheService.invalidatePopular();
    }
  }

  private async incrementRateUsage(user: User): Promise<void> {
    await this.redisService.increment(this.getDailyKey(user.id), 86400);
    await this.redisService.increment(
      this.getBurstKey(user.id),
      this.configService.get<number>('ai.burstWindowSeconds', 60),
    );
  }

  private async addOpenJob(userId: string, jobId: string): Promise<void> {
    const key = this.getOpenJobsKey(userId);
    await this.redisService.setAdd(key, jobId);
    await this.redisService.expire(key, 86400);
  }

  private async removeOpenJob(userId: string, jobId: string): Promise<void> {
    await this.redisService.setRemove(this.getOpenJobsKey(userId), jobId);
    await this.redisService.setRemove(this.getActiveJobsKey(userId), jobId);
  }

  private async setCooldown(jobId: string): Promise<void> {
    await this.redisService.set(
      this.getCooldownKey(jobId),
      randomUUID(),
      this.configService.get<number>('ai.regenCooldownSeconds', 15),
    );
  }

  private getDailyKey(userId: string): string {
    return `ai-frames:daily:${userId}:${new Date().toISOString().slice(0, 10)}`;
  }

  private getBurstKey(userId: string): string {
    return `ai-frames:burst:${userId}`;
  }

  private getOpenJobsKey(userId: string): string {
    return `ai-frames:user:${userId}:open-jobs`;
  }

  private getActiveJobsKey(userId: string): string {
    return `ai-frames:user:${userId}:active-jobs`;
  }

  private getCooldownKey(jobId: string): string {
    return `ai-frames:job:${jobId}:regen-cooldown`;
  }

  private buildQueueJobId(jobId: string, iterationNumber: number): string {
    return `ai-frame-${jobId}-iteration-${iterationNumber}`;
  }

  private get maxIterationsPerJob(): number {
    return this.configService.get<number>('ai.maxIterationsPerJob', 10);
  }
}
