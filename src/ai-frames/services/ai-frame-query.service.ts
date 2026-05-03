import { HttpStatus, Inject, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { BusinessException } from '../../common/filters/business.exception';
import {
  PaginationService,
  PaginatedResult,
  STORAGE_PORT,
  StoragePort,
} from '../../common/services';
import { Frame } from '../../frames/entities/frame.entity';
import { FrameAsset } from '../../frames/entities/frame-asset.entity';
import { FrameAssetType } from '../../frames/entities/frame-asset-type.enum';
import {
  resolveFrameRenderMode,
  resolveFrameScenePlacementStatus,
} from '../../frames/utils/frame-metadata.util';
import { AiFrameIteration, AiFrameJob } from '../entities';
import { AiFrameIterationStatus, AiFrameJobStatus } from '../enums';
import { QueryAiFrameJobsDto } from '../dto';
import { AiFramesCacheService } from './ai-frames-cache.service';

@Injectable()
export class AiFrameQueryService {
  constructor(
    @InjectRepository(AiFrameJob)
    private readonly aiFrameJobRepository: Repository<AiFrameJob>,
    @InjectRepository(AiFrameIteration)
    private readonly aiFrameIterationRepository: Repository<AiFrameIteration>,
    @InjectRepository(Frame)
    private readonly frameRepository: Repository<Frame>,
    @InjectRepository(FrameAsset)
    private readonly frameAssetRepository: Repository<FrameAsset>,
    private readonly aiFramesCacheService: AiFramesCacheService,
    private readonly paginationService: PaginationService,
    @Inject(STORAGE_PORT)
    private readonly storageService: StoragePort,
  ) {}

  async getJobStatus(jobId: string): Promise<Record<string, unknown>> {
    const cached =
      await this.aiFramesCacheService.getJobStatus<Record<string, unknown>>(
        jobId,
      );
    if (cached) {
      return cached;
    }

    const job = await this.loadJob(jobId);
    const latestIteration = this.getLatestIteration(job.iterations ?? []);
    const latestIterationFrame = latestIteration?.frameId
      ? await this.frameRepository.findOne({
          where: { id: latestIteration.frameId },
          select: ['id', 'metadata'],
        })
      : null;

    const payload = {
      jobId: job.id,
      status: job.status,
      prompt: job.prompt,
      aspectRatio: job.aspectRatio,
      generationMode: job.generationMode,
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
            scenePlacementStatus:
              latestIterationFrame &&
              resolveFrameRenderMode(latestIterationFrame.metadata) === 'scene'
                ? resolveFrameScenePlacementStatus(
                    latestIterationFrame.metadata,
                  )
                : null,
            errorCode: latestIteration.errorCode,
            errorMessage: latestIteration.errorMessage,
            startedAt: latestIteration.startedAt,
            completedAt: latestIteration.completedAt,
          }
        : null,
    };

    await this.aiFramesCacheService.setJobStatus(jobId, payload);
    return payload;
  }

  async getJobResult(jobId: string): Promise<Record<string, unknown>> {
    const cached =
      await this.aiFramesCacheService.getJobResult<Record<string, unknown>>(
        jobId,
      );
    if (cached) {
      return cached;
    }

    const job = await this.loadJob(jobId);
    const iteration = this.resolveResultIteration(job);

    if (!iteration || !iteration.frameId) {
      throw new BusinessException(
        'AI_FRAME_NOT_READY',
        'The AI frame result is not ready yet.',
        HttpStatus.CONFLICT,
      );
    }

    const frame = await this.frameRepository.findOne({
      where: { id: iteration.frameId },
    });

    if (!frame) {
      throw new BusinessException(
        'AI_FRAME_NOT_READY',
        'The AI frame result could not be resolved.',
        HttpStatus.CONFLICT,
      );
    }

    const assets = await this.frameAssetRepository.find({
      where: { frameId: frame.id },
    });

    const payload = {
      jobId: job.id,
      status: job.status,
      generationMode: job.generationMode,
      acceptedIterationId: job.acceptedIterationId,
      promotedFrameId: job.promotedFrameId,
      scenePlacementStatus:
        resolveFrameRenderMode(frame.metadata) === 'scene'
          ? resolveFrameScenePlacementStatus(frame.metadata)
          : null,
      iteration: {
        id: iteration.id,
        iterationNumber: iteration.iterationNumber,
        status: iteration.status,
        provider: iteration.provider,
        modelVersion: iteration.modelVersion,
        generationMs: iteration.generationMs,
        completedAt: iteration.completedAt,
      },
      frame: {
        id: frame.id,
        name: frame.name,
        slug: frame.slug,
        description: frame.description,
        aspectRatio: frame.aspectRatio,
        width: frame.width,
        height: frame.height,
        orientation: frame.orientation,
        isAiGenerated: frame.isAiGenerated,
        isActive: frame.isActive,
        metadata: frame.metadata,
        svgUrl:
          resolveFrameRenderMode(frame.metadata) === 'scene'
            ? null
            : await this.resolveAssetUrl(assets, FrameAssetType.SVG),
        editorPreviewUrl: await this.resolveAssetUrl(
          assets,
          FrameAssetType.PREVIEW_PNG,
        ),
        thumbnailUrl: await this.resolveAssetUrl(
          assets,
          FrameAssetType.THUMBNAIL_MD,
        ),
      },
    };

    await this.aiFramesCacheService.setJobResult(jobId, payload);
    return payload;
  }

  async listJobIterations(jobId: string): Promise<Record<string, unknown>[]> {
    const job = await this.loadJob(jobId);
    const frameIds = job.iterations
      .map((iteration) => iteration.frameId)
      .filter((value): value is string => Boolean(value));
    const assetsByFrameId = await this.loadAssetsByFrameId(frameIds);

    return Promise.all(
      job.iterations
        .slice()
        .sort((left, right) => right.iterationNumber - left.iterationNumber)
        .map(async (iteration) => ({
          id: iteration.id,
          iterationNumber: iteration.iterationNumber,
          status: iteration.status,
          feedback: iteration.feedback,
          provider: iteration.provider,
          modelVersion: iteration.modelVersion,
          generationMs: iteration.generationMs,
          frameId: iteration.frameId,
          thumbnailUrl: iteration.frameId
            ? await this.resolveAssetUrl(
                assetsByFrameId.get(iteration.frameId) ?? [],
                FrameAssetType.THUMBNAIL_MD,
              )
            : null,
          errorCode: iteration.errorCode,
          errorMessage: iteration.errorMessage,
          startedAt: iteration.startedAt,
          completedAt: iteration.completedAt,
          failedAt: iteration.failedAt,
          cleanedAt: iteration.cleanedAt,
          createdAt: iteration.createdAt,
        })),
    );
  }

  async listJobs(
    userId: string,
    query: QueryAiFrameJobsDto,
  ): Promise<PaginatedResult<Record<string, unknown>>> {
    const cacheParams = {
      ...query,
    };
    const cached = await this.aiFramesCacheService.getUserJobs<
      PaginatedResult<Record<string, unknown>>
    >(userId, cacheParams);

    if (cached) {
      return cached;
    }

    const pagination = this.paginationService.resolve(query);
    const qb = this.aiFrameJobRepository
      .createQueryBuilder('job')
      .leftJoinAndSelect('job.iterations', 'iteration')
      .where('job.userId = :userId', { userId })
      .andWhere('job.deletedAt IS NULL');

    if (query.status) {
      qb.andWhere('job.status = :status', { status: query.status });
    }

    qb.orderBy('job.createdAt', 'DESC')
      .addOrderBy('job.id', 'ASC')
      .skip(pagination.skip)
      .take(pagination.take);

    const [jobs, total] = await qb.getManyAndCount();
    const result: PaginatedResult<Record<string, unknown>> = {
      data: jobs.map((job) => {
        const latestIteration = this.getLatestIteration(job.iterations ?? []);
        return {
          jobId: job.id,
          status: job.status,
          prompt: job.prompt,
          aspectRatio: job.aspectRatio,
          generationMode: job.generationMode,
          latestIterationNumber: job.latestIterationNumber,
          acceptedIterationId: job.acceptedIterationId,
          createdAt: job.createdAt,
          updatedAt: job.updatedAt,
          latestIteration: latestIteration
            ? {
                id: latestIteration.id,
                iterationNumber: latestIteration.iterationNumber,
                status: latestIteration.status,
                frameId: latestIteration.frameId,
                provider: latestIteration.provider,
              }
            : null,
        };
      }),
      meta: this.paginationService.buildMeta(
        total,
        pagination.page,
        pagination.limit,
      ),
    };

    await this.aiFramesCacheService.setUserJobs(userId, cacheParams, result);
    return result;
  }

  async listAdminJobs(
    query: QueryAiFrameJobsDto & { userId?: string },
  ): Promise<PaginatedResult<Record<string, unknown>>> {
    const pagination = this.paginationService.resolve(query);
    const qb = this.aiFrameJobRepository
      .createQueryBuilder('job')
      .leftJoinAndSelect('job.iterations', 'iteration')
      .orderBy('job.createdAt', 'DESC')
      .addOrderBy('job.id', 'ASC')
      .skip(pagination.skip)
      .take(pagination.take);

    if (query.status) {
      qb.andWhere('job.status = :status', { status: query.status });
    }

    if (query.userId) {
      qb.andWhere('job.userId = :userId', { userId: query.userId });
    }

    const [jobs, total] = await qb.getManyAndCount();

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
      meta: this.paginationService.buildMeta(
        total,
        pagination.page,
        pagination.limit,
      ),
    };
  }

  private async loadJob(jobId: string): Promise<AiFrameJob> {
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

    return job;
  }

  private getLatestIteration(
    iterations: AiFrameIteration[],
  ): AiFrameIteration | null {
    if (iterations.length === 0) {
      return null;
    }

    return iterations.reduce((latest, current) =>
      current.iterationNumber > latest.iterationNumber ? current : latest,
    );
  }

  private resolveResultIteration(job: AiFrameJob): AiFrameIteration | null {
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

    if (completedIterations.length > 0) {
      return completedIterations[0];
    }

    if (
      ![AiFrameJobStatus.COMPLETED, AiFrameJobStatus.ACCEPTED].includes(
        job.status,
      )
    ) {
      return null;
    }

    return this.getLatestIteration(job.iterations);
  }

  private async loadAssetsByFrameId(
    frameIds: string[],
  ): Promise<Map<string, FrameAsset[]>> {
    if (frameIds.length === 0) {
      return new Map();
    }

    const assets = await this.frameAssetRepository.find({
      where: { frameId: In(frameIds) },
    });

    const map = new Map<string, FrameAsset[]>();
    for (const asset of assets) {
      if (!map.has(asset.frameId)) {
        map.set(asset.frameId, []);
      }
      map.get(asset.frameId)?.push(asset);
    }

    return map;
  }

  private async resolveAssetUrl(
    assets: FrameAsset[],
    type: FrameAssetType,
  ): Promise<string | null> {
    const asset = assets.find((item) => item.type === type);
    if (!asset) {
      return null;
    }

    return this.storageService.generatePresignedGetUrl(asset.storageKey);
  }
}
