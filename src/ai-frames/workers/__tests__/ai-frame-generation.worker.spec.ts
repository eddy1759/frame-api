import { Queue } from 'bullmq';
import { Repository } from 'typeorm';
import { ConfigService } from '@nestjs/config';
import { Frame } from '../../../frames/entities/frame.entity';
import { FrameAssetsService } from '../../../frames/services/frame-assets.service';
import { FrameCompositorService } from '../../../frames/services/frame-compositor.service';
import { AiFrameIteration, AiFrameJob } from '../../entities';
import {
  AiFrameGenerationMode,
  AiFrameIterationStatus,
  AiFrameJobStatus,
} from '../../enums';
import { AiFrameGenerationWorker } from '../ai-frame-generation.worker';
import { AiFrameGenerationService } from '../../services/ai-frame-generation.service';
import { AiFramesCacheService } from '../../services/ai-frames-cache.service';
import { PromptEngineerService } from '../../services/prompt-engineer.service';

describe('AiFrameGenerationWorker', () => {
  let worker: AiFrameGenerationWorker;
  let aiFrameJobRepository: jest.Mocked<Repository<AiFrameJob>>;
  let aiFrameIterationRepository: jest.Mocked<Repository<AiFrameIteration>>;
  let frameRepository: jest.Mocked<Repository<Frame>>;
  let aiFrameQueue: jest.Mocked<Queue>;
  let aiFrameGenerationService: jest.Mocked<AiFrameGenerationService>;
  let promptEngineerService: jest.Mocked<PromptEngineerService>;
  let frameAssetsService: jest.Mocked<FrameAssetsService>;
  let frameCompositorService: jest.Mocked<FrameCompositorService>;
  let aiFramesCacheService: jest.Mocked<AiFramesCacheService>;
  const redisService = {
    setIfNotExists: jest.fn(),
    setAdd: jest.fn(),
    expire: jest.fn(),
    setRemove: jest.fn(),
    deleteIfValueMatches: jest.fn(),
  };
  const slugService = {
    generateUniqueSlug: jest.fn(),
  };
  const configService = {
    get: jest.fn((key: string, fallback?: unknown) => {
      if (key === 'ai.apertureInsetPct') return 0.125;
      if (key === 'ai.providerTimeoutMs') return 1000;
      return fallback;
    }),
  } as unknown as jest.Mocked<ConfigService>;
  const storageService = {
    uploadBuffer: jest.fn(),
    deleteObject: jest.fn(),
  };

  beforeEach(() => {
    aiFrameJobRepository = {
      findOne: jest.fn(),
      save: jest.fn(async (value) => value),
    } as unknown as jest.Mocked<Repository<AiFrameJob>>;

    aiFrameIterationRepository = {
      findOne: jest.fn(),
      save: jest.fn(async (value) => value),
    } as unknown as jest.Mocked<Repository<AiFrameIteration>>;

    frameRepository = {
      save: jest.fn(async (value) => ({ id: 'frame-1', ...value })),
      create: jest.fn((value: unknown) => value as Frame),
      exist: jest.fn().mockResolvedValue(false),
      delete: jest.fn(),
    } as unknown as jest.Mocked<Repository<Frame>>;

    aiFrameQueue = {} as jest.Mocked<Queue>;
    aiFrameGenerationService = {
      generateImage: jest.fn(),
    } as unknown as jest.Mocked<AiFrameGenerationService>;
    promptEngineerService = {
      buildPrompt: jest.fn(),
      buildScenePrompt: jest.fn(),
      buildFrameName: jest.fn(),
    } as unknown as jest.Mocked<PromptEngineerService>;
    frameAssetsService = {
      storeGeneratedSvgAsset: jest.fn(),
      storeGeneratedSceneAsset: jest.fn(),
      deleteFrameAssets: jest.fn(),
    } as unknown as jest.Mocked<FrameAssetsService>;
    frameCompositorService = {
      buildGeneratedFrameSvg: jest.fn(),
    } as unknown as jest.Mocked<FrameCompositorService>;
    aiFramesCacheService = {
      invalidateJob: jest.fn(),
      invalidateUserJobs: jest.fn(),
    } as unknown as jest.Mocked<AiFramesCacheService>;

    worker = new AiFrameGenerationWorker(
      aiFrameJobRepository,
      aiFrameIterationRepository,
      frameRepository,
      aiFrameQueue,
      aiFrameGenerationService,
      promptEngineerService,
      frameAssetsService,
      frameCompositorService,
      aiFramesCacheService,
      redisService as never,
      slugService as never,
      configService,
      storageService as never,
    );
  });

  it('skips duplicate jobs when the Redis idempotency lock is already held', async () => {
    redisService.setIfNotExists.mockResolvedValue(false);

    await worker.process({
      data: {
        jobId: 'job-1',
        iterationId: 'iteration-1',
        iterationNumber: 1,
        userId: 'user-1',
        prompt: 'ornate frame',
        aspectRatio: '9:16',
        generationMode: AiFrameGenerationMode.OVERLAY,
      },
    } as never);

    expect(aiFrameJobRepository.findOne).not.toHaveBeenCalled();
    expect(aiFrameGenerationService.generateImage).not.toHaveBeenCalled();
  });

  it('completes a queued iteration and persists the generated frame assets', async () => {
    const job = {
      id: 'job-1',
      userId: 'user-1',
      prompt: 'ornate frame',
      aspectRatio: '9:16',
      status: AiFrameJobStatus.QUEUED,
      cancelRequestedAt: null,
      completedAt: null,
      lastErrorCode: null,
      lastErrorMessage: null,
      generationMode: AiFrameGenerationMode.OVERLAY,
    } as AiFrameJob;
    const iteration = {
      id: 'iteration-1',
      jobId: 'job-1',
      iterationNumber: 1,
      feedback: null,
      status: AiFrameIterationStatus.QUEUED,
      frameId: null,
    } as AiFrameIteration;

    redisService.setIfNotExists.mockResolvedValue(true);
    redisService.setAdd.mockResolvedValue(undefined);
    redisService.expire.mockResolvedValue(undefined);
    redisService.setRemove.mockResolvedValue(undefined);
    redisService.deleteIfValueMatches.mockResolvedValue(true);
    aiFrameJobRepository.findOne
      .mockResolvedValueOnce(job)
      .mockResolvedValueOnce({
        id: 'job-1',
        cancelRequestedAt: null,
      } as AiFrameJob);
    aiFrameIterationRepository.findOne.mockResolvedValue(iteration);
    promptEngineerService.buildPrompt.mockReturnValue('engineered prompt');
    promptEngineerService.buildFrameName.mockReturnValue('AI Frame');
    aiFrameGenerationService.generateImage.mockResolvedValue({
      url: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4//8/AwAI/AL+ZgoN3wAAAABJRU5ErkJggg==',
      provider: 'dalle3',
      modelVersion: 'dall-e-3',
      generationMs: 1400,
    });
    storageService.uploadBuffer.mockResolvedValue({
      key: 'ai-frames/user-1/job-1/iterations/1/raw.png',
      size: 3,
      url: 'https://storage.example.com/raw.png',
    });
    frameCompositorService.buildGeneratedFrameSvg.mockReturnValue({
      svg: '<svg viewBox="0 0 1080 1920"></svg>',
      metadata: {
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
      },
    });
    slugService.generateUniqueSlug.mockResolvedValue('ai-frame');
    frameAssetsService.storeGeneratedSvgAsset.mockResolvedValue({
      svgUrl: 'https://storage.example.com/frame.svg',
      editorPreviewUrl: 'https://storage.example.com/preview.png',
      thumbnails: {
        small: 'https://storage.example.com/thumb-sm.png',
        medium: 'https://storage.example.com/thumb-md.png',
        large: 'https://storage.example.com/thumb-lg.png',
      },
    });

    await worker.process({
      data: {
        jobId: 'job-1',
        iterationId: 'iteration-1',
        iterationNumber: 1,
        userId: 'user-1',
        prompt: 'ornate frame',
        aspectRatio: '9:16',
        generationMode: AiFrameGenerationMode.OVERLAY,
      },
    } as never);

    expect(promptEngineerService.buildPrompt).toHaveBeenCalled();
    expect(aiFrameGenerationService.generateImage).toHaveBeenCalledWith(
      'engineered prompt',
      '9:16',
    );
    expect(storageService.uploadBuffer).toHaveBeenCalledWith(
      'ai-frames/user-1/job-1/iterations/1/raw.png',
      expect.any(Buffer),
      'image/png',
    );
    expect(frameAssetsService.storeGeneratedSvgAsset).toHaveBeenCalledWith(
      'frame-1',
      '<svg viewBox="0 0 1080 1920"></svg>',
    );
    expect(aiFramesCacheService.invalidateJob).toHaveBeenCalledWith('job-1');
    expect(aiFramesCacheService.invalidateUserJobs).toHaveBeenCalledWith(
      'user-1',
    );
    expect(iteration.status).toBe(AiFrameIterationStatus.COMPLETED);
    expect(job.status).toBe(AiFrameJobStatus.COMPLETED);
  });

  it('uses the scene prompt path and raster asset storage for scene jobs', async () => {
    const job = {
      id: 'job-scene-1',
      userId: 'user-1',
      prompt: 'held wedding sign scene',
      aspectRatio: '9:16',
      status: AiFrameJobStatus.QUEUED,
      cancelRequestedAt: null,
      completedAt: null,
      lastErrorCode: null,
      lastErrorMessage: null,
      generationMode: AiFrameGenerationMode.SCENE,
    } as AiFrameJob;
    const iteration = {
      id: 'iteration-scene-1',
      jobId: 'job-scene-1',
      iterationNumber: 1,
      feedback: null,
      status: AiFrameIterationStatus.QUEUED,
      frameId: null,
    } as AiFrameIteration;

    redisService.setIfNotExists.mockResolvedValue(true);
    redisService.setAdd.mockResolvedValue(undefined);
    redisService.expire.mockResolvedValue(undefined);
    redisService.setRemove.mockResolvedValue(undefined);
    redisService.deleteIfValueMatches.mockResolvedValue(true);
    aiFrameJobRepository.findOne
      .mockResolvedValueOnce(job)
      .mockResolvedValueOnce({
        id: 'job-scene-1',
        cancelRequestedAt: null,
      } as AiFrameJob);
    aiFrameIterationRepository.findOne.mockResolvedValue(iteration);
    promptEngineerService.buildScenePrompt.mockReturnValue(
      'engineered scene prompt',
    );
    promptEngineerService.buildFrameName.mockReturnValue('AI Scene Frame');
    aiFrameGenerationService.generateImage.mockResolvedValue({
      url: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4//8/AwAI/AL+ZgoN3wAAAABJRU5ErkJggg==',
      provider: 'dalle3',
      modelVersion: 'dall-e-3',
      generationMs: 1400,
    });
    storageService.uploadBuffer.mockResolvedValue({
      key: 'ai-frames/user-1/job-scene-1/iterations/1/raw.png',
      size: 3,
      url: 'https://storage.example.com/raw.png',
    });
    slugService.generateUniqueSlug.mockResolvedValue('ai-scene-frame');
    frameAssetsService.storeGeneratedSceneAsset.mockResolvedValue({
      editorPreviewUrl: 'https://storage.example.com/preview.png',
      thumbnails: {
        small: 'https://storage.example.com/thumb-sm.png',
        medium: 'https://storage.example.com/thumb-md.png',
        large: 'https://storage.example.com/thumb-lg.png',
      },
    });

    await worker.process({
      data: {
        jobId: 'job-scene-1',
        iterationId: 'iteration-scene-1',
        iterationNumber: 1,
        userId: 'user-1',
        prompt: 'held wedding sign scene',
        aspectRatio: '9:16',
        generationMode: AiFrameGenerationMode.SCENE,
      },
    } as never);

    expect(promptEngineerService.buildScenePrompt).toHaveBeenCalled();
    expect(frameAssetsService.storeGeneratedSceneAsset).toHaveBeenCalledWith(
      'frame-1',
      expect.any(Buffer),
    );
    expect(frameAssetsService.storeGeneratedSvgAsset).not.toHaveBeenCalled();
    expect(iteration.status).toBe(AiFrameIterationStatus.COMPLETED);
    expect(job.status).toBe(AiFrameJobStatus.COMPLETED);
  });
});
