/* eslint-disable @typescript-eslint/no-require-imports */
import { randomUUID } from 'crypto';
import { InjectQueue, Processor, WorkerHost } from '@nestjs/bullmq';
import { HttpStatus, Inject, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Job, Queue } from 'bullmq';
import sharp = require('sharp');
import { Repository } from 'typeorm';
import { BusinessException } from '../../common/filters/business.exception';
import {
  AI_FRAME_GENERATION_QUEUE,
  AiFrameGenerationJobData,
} from '../../common/queue/queue.constants';
import { RedisService } from '../../common/redis/redis.service';
import { SlugService, STORAGE_PORT, StoragePort } from '../../common/services';
import { Frame } from '../../frames/entities/frame.entity';
import { FrameAssetsService } from '../../frames/services/frame-assets.service';
import { AiFrameIteration, AiFrameJob } from '../entities';
import {
  AiFrameGenerationMode,
  AiFrameIterationStatus,
  AiFrameJobStatus,
} from '../enums';
import { resolveAiFrameAspectRatioPreset } from '../ai-frame.constants';
import {
  AiFrameGenerationService,
  AiFramesCacheService,
  PromptEngineerService,
} from '../services';
import { FrameCompositorService } from '../../frames/services/frame-compositor.service';
import { normalizeFrameMetadata } from '../../frames/utils/frame-metadata.util';

@Processor(AI_FRAME_GENERATION_QUEUE)
export class AiFrameGenerationWorker extends WorkerHost {
  private readonly logger = new Logger(AiFrameGenerationWorker.name);

  constructor(
    @InjectRepository(AiFrameJob)
    private readonly aiFrameJobRepository: Repository<AiFrameJob>,
    @InjectRepository(AiFrameIteration)
    private readonly aiFrameIterationRepository: Repository<AiFrameIteration>,
    @InjectRepository(Frame)
    private readonly frameRepository: Repository<Frame>,
    @InjectQueue(AI_FRAME_GENERATION_QUEUE)
    private readonly aiFrameQueue: Queue,
    private readonly aiFrameGenerationService: AiFrameGenerationService,
    private readonly promptEngineerService: PromptEngineerService,
    private readonly frameAssetsService: FrameAssetsService,
    private readonly frameCompositorService: FrameCompositorService,
    private readonly aiFramesCacheService: AiFramesCacheService,
    private readonly redisService: RedisService,
    private readonly slugService: SlugService,
    private readonly configService: ConfigService,
    @Inject(STORAGE_PORT)
    private readonly storageService: StoragePort,
  ) {
    super();
  }

  async process(job: Job<AiFrameGenerationJobData>): Promise<void> {
    const lockKey = `ai-frames:iteration:lock:${job.data.iterationId}`;
    const lockToken = randomUUID();
    const acquired = await this.redisService.setIfNotExists(
      lockKey,
      lockToken,
      300,
    );

    if (!acquired) {
      this.logger.warn(
        `Skipping duplicate AI frame iteration ${job.data.iterationId}`,
      );
      return;
    }

    let userId = job.data.userId;
    let createdFrameId: string | null = null;
    let rawStorageKey: string | null = null;

    try {
      const [aiJob, iteration] = await Promise.all([
        this.aiFrameJobRepository.findOne({
          where: { id: job.data.jobId },
        }),
        this.aiFrameIterationRepository.findOne({
          where: { id: job.data.iterationId },
        }),
      ]);

      if (!aiJob || !iteration) {
        return;
      }

      userId = aiJob.userId;
      await this.redisService.setAdd(
        this.getActiveJobsKey(aiJob.userId),
        aiJob.id,
      );
      await this.redisService.expire(
        this.getActiveJobsKey(aiJob.userId),
        86400,
      );

      if (aiJob.cancelRequestedAt) {
        await this.markCancelled(aiJob, iteration);
        return;
      }

      aiJob.status = AiFrameJobStatus.PROCESSING;
      iteration.status = AiFrameIterationStatus.PROCESSING;
      iteration.startedAt = new Date();
      await Promise.all([
        this.aiFrameJobRepository.save(aiJob),
        this.aiFrameIterationRepository.save(iteration),
      ]);

      const engineeredPrompt =
        aiJob.generationMode === AiFrameGenerationMode.SCENE
          ? this.promptEngineerService.buildScenePrompt({
              prompt: aiJob.prompt,
              aspectRatio: aiJob.aspectRatio,
              feedback: iteration.feedback,
            })
          : this.promptEngineerService.buildPrompt({
              prompt: aiJob.prompt,
              aspectRatio: aiJob.aspectRatio,
              feedback: iteration.feedback,
            });

      const generation = await this.aiFrameGenerationService.generateImage(
        engineeredPrompt,
        aiJob.aspectRatio,
      );

      if (await this.isCancelRequested(aiJob.id)) {
        await this.markCancelled(aiJob, iteration);
        return;
      }

      const downloaded = await this.downloadGeneratedImage(generation.url);
      const rawPng = await sharp(downloaded.buffer).png().toBuffer();
      rawStorageKey = `ai-frames/${aiJob.userId}/${aiJob.id}/iterations/${iteration.iterationNumber}/raw.png`;
      const rawUpload = await this.storageService.uploadBuffer(
        rawStorageKey,
        rawPng,
        'image/png',
      );

      const preset = resolveAiFrameAspectRatioPreset(aiJob.aspectRatio);
      const name = this.promptEngineerService.buildFrameName(
        aiJob.prompt,
        iteration.iterationNumber,
      );
      const slug = await this.slugService.generateUniqueSlug(
        name,
        (candidate) =>
          this.frameRepository.exist({ where: { slug: candidate } }),
      );

      const frame = await this.frameRepository.save(
        this.frameRepository.create({
          name,
          slug,
          description: aiJob.prompt,
          isPremium: false,
          price: null,
          currency: 'USD',
          width: preset.width,
          height: preset.height,
          aspectRatio: preset.aspectRatio,
          orientation: preset.orientation,
          metadata:
            aiJob.generationMode === AiFrameGenerationMode.SCENE
              ? normalizeFrameMetadata({
                  renderMode: 'scene',
                  scenePlacementStatus: 'pending_annotation',
                })
              : normalizeFrameMetadata({
                  ...this.frameCompositorService.buildGeneratedFrameSvg(
                    rawPng,
                    preset.width,
                    preset.height,
                    this.configService.get<number>(
                      'ai.apertureInsetPct',
                      0.125,
                    ),
                  ).metadata,
                  renderMode: 'overlay',
                }),
          isActive: false,
          isAiGenerated: true,
          createdById: aiJob.userId,
          generatedById: aiJob.userId,
          sortOrder: 0,
        }),
      );
      createdFrameId = frame.id;

      if (aiJob.generationMode === AiFrameGenerationMode.SCENE) {
        const sceneBasePng = await sharp(downloaded.buffer)
          .rotate()
          .resize(preset.width, preset.height, {
            fit: sharp.fit.cover,
            withoutEnlargement: false,
          })
          .png()
          .toBuffer();
        await this.frameAssetsService.storeGeneratedSceneAsset(
          frame.id,
          sceneBasePng,
        );
      } else {
        const generated = this.frameCompositorService.buildGeneratedFrameSvg(
          rawPng,
          preset.width,
          preset.height,
          this.configService.get<number>('ai.apertureInsetPct', 0.125),
        );
        await this.frameAssetsService.storeGeneratedSvgAsset(
          frame.id,
          generated.svg,
        );
      }

      iteration.status = AiFrameIterationStatus.COMPLETED;
      iteration.engineeredPrompt = engineeredPrompt;
      iteration.provider = generation.provider;
      iteration.modelVersion = generation.modelVersion;
      iteration.generationMs = generation.generationMs;
      iteration.rawImageStorageKey = rawUpload.key;
      iteration.rawImageMimeType = 'image/png';
      iteration.rawImageSize = rawUpload.size;
      iteration.frameId = frame.id;
      iteration.completedAt = new Date();
      iteration.errorCode = null;
      iteration.errorMessage = null;

      aiJob.status = AiFrameJobStatus.COMPLETED;
      aiJob.completedAt = new Date();
      aiJob.lastErrorCode = null;
      aiJob.lastErrorMessage = null;

      await Promise.all([
        this.aiFrameIterationRepository.save(iteration),
        this.aiFrameJobRepository.save(aiJob),
      ]);

      await this.aiFramesCacheService.invalidateJob(aiJob.id);
      await this.aiFramesCacheService.invalidateUserJobs(aiJob.userId);
      await this.redisService.setRemove(
        this.getOpenJobsKey(aiJob.userId),
        aiJob.id,
      );
    } catch (error) {
      this.logger.error(
        `AI frame generation failed for iteration ${job.data.iterationId}: ${
          error instanceof Error ? error.message : 'unknown error'
        }`,
      );

      const aiJob = await this.aiFrameJobRepository.findOne({
        where: { id: job.data.jobId },
      });
      const iteration = await this.aiFrameIterationRepository.findOne({
        where: { id: job.data.iterationId },
      });

      if (iteration) {
        iteration.status = AiFrameIterationStatus.FAILED;
        iteration.failedAt = new Date();
        iteration.errorCode = this.resolveErrorCode(error);
        iteration.errorMessage =
          error instanceof Error
            ? error.message
            : 'AI frame generation failed.';
        await this.aiFrameIterationRepository.save(iteration);
      }

      if (aiJob) {
        aiJob.status = AiFrameJobStatus.FAILED;
        aiJob.lastErrorCode = this.resolveErrorCode(error);
        aiJob.lastErrorMessage =
          error instanceof Error
            ? error.message
            : 'AI frame generation failed.';
        await this.aiFrameJobRepository.save(aiJob);
        await this.aiFramesCacheService.invalidateJob(aiJob.id);
        await this.aiFramesCacheService.invalidateUserJobs(aiJob.userId);
        await this.redisService.setRemove(
          this.getOpenJobsKey(aiJob.userId),
          aiJob.id,
        );
      }

      if (rawStorageKey) {
        await this.storageService.deleteObject(rawStorageKey);
      }

      if (createdFrameId) {
        await this.cleanupFrame(createdFrameId);
      }

      if (error instanceof BusinessException) {
        throw error;
      }

      throw new BusinessException(
        'AI_FRAME_GENERATION_FAILED',
        error instanceof Error ? error.message : 'AI frame generation failed.',
        HttpStatus.BAD_GATEWAY,
      );
    } finally {
      await this.redisService.setRemove(
        this.getActiveJobsKey(userId),
        job.data.jobId,
      );
      await this.redisService.deleteIfValueMatches(lockKey, lockToken);
    }
  }

  private async markCancelled(
    aiJob: AiFrameJob,
    iteration: AiFrameIteration,
  ): Promise<void> {
    aiJob.status = AiFrameJobStatus.CANCELLED;
    iteration.status = AiFrameIterationStatus.CANCELLED;
    iteration.failedAt = new Date();
    await Promise.all([
      this.aiFrameJobRepository.save(aiJob),
      this.aiFrameIterationRepository.save(iteration),
    ]);

    await this.aiFramesCacheService.invalidateJob(aiJob.id);
    await this.aiFramesCacheService.invalidateUserJobs(aiJob.userId);
    await this.redisService.setRemove(
      this.getOpenJobsKey(aiJob.userId),
      aiJob.id,
    );
  }

  private async isCancelRequested(jobId: string): Promise<boolean> {
    const aiJob = await this.aiFrameJobRepository.findOne({
      where: { id: jobId },
      select: ['id', 'cancelRequestedAt'],
    });

    return Boolean(aiJob?.cancelRequestedAt);
  }

  private async downloadGeneratedImage(url: string): Promise<{
    buffer: Buffer;
    mimeType: string;
  }> {
    if (url.startsWith('data:')) {
      const match = url.match(/^data:([^;]+);base64,(.+)$/);
      if (!match) {
        throw new BusinessException(
          'AI_FRAME_GENERATION_FAILED',
          'AI provider returned an invalid data URI.',
          HttpStatus.BAD_GATEWAY,
        );
      }

      return {
        buffer: Buffer.from(match[2], 'base64'),
        mimeType: match[1],
      };
    }

    const response = await fetch(url, {
      signal: AbortSignal.timeout(
        this.configService.get<number>('ai.providerTimeoutMs', 90000),
      ),
    });

    if (!response.ok) {
      throw new BusinessException(
        'AI_FRAME_GENERATION_FAILED',
        'Failed to download the provider image output.',
        HttpStatus.BAD_GATEWAY,
      );
    }

    const arrayBuffer = await response.arrayBuffer();
    return {
      buffer: Buffer.from(arrayBuffer),
      mimeType: response.headers.get('content-type') || 'image/png',
    };
  }

  private async cleanupFrame(frameId: string): Promise<void> {
    await this.frameAssetsService.deleteFrameAssets(frameId);
    await this.frameRepository.delete({ id: frameId });
  }

  private resolveErrorCode(error: unknown): string {
    if (error instanceof BusinessException) {
      const response = error.getResponse() as { code?: string };
      return response.code || 'AI_FRAME_GENERATION_FAILED';
    }

    return 'AI_FRAME_GENERATION_FAILED';
  }

  private getOpenJobsKey(userId: string): string {
    return `ai-frames:user:${userId}:open-jobs`;
  }

  private getActiveJobsKey(userId: string): string {
    return `ai-frames:user:${userId}:active-jobs`;
  }
}
