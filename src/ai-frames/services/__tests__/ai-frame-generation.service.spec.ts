import { ConfigService } from '@nestjs/config';
import { BusinessException } from '../../../common/filters/business.exception';
import { AiProviderError } from '../../providers/ai-provider.error';
import { AiImageGeneratorFactory } from '../../providers/ai-image-generator.factory';
import { AiFrameGenerationService } from '../ai-frame-generation.service';

describe('AiFrameGenerationService', () => {
  let service: AiFrameGenerationService;
  let configService: jest.Mocked<ConfigService>;
  let factory: jest.Mocked<AiImageGeneratorFactory>;

  beforeEach(() => {
    configService = {
      get: jest.fn((key: string, fallback?: unknown) => {
        if (key === 'ai.provider') return 'dalle3';
        if (key === 'ai.providerFallbacks') return ['stable-diffusion'];
        return fallback;
      }),
    } as unknown as jest.Mocked<ConfigService>;

    factory = {
      getProvider: jest.fn(),
    } as unknown as jest.Mocked<AiImageGeneratorFactory>;

    service = new AiFrameGenerationService(configService, factory);
  });

  it('uses the primary provider when it succeeds', async () => {
    factory.getProvider.mockReturnValue({
      generateImage: jest.fn().mockResolvedValue({
        url: 'https://example.com/frame.png',
        provider: 'dalle3',
        modelVersion: 'dall-e-3',
        generationMs: 1200,
      }),
    });

    await expect(
      service.generateImage('ornate frame', '9:16'),
    ).resolves.toEqual({
      url: 'https://example.com/frame.png',
      provider: 'dalle3',
      modelVersion: 'dall-e-3',
      generationMs: 1200,
    });

    expect(factory.getProvider).toHaveBeenCalledWith('dalle3');
  });

  it('falls back to the next provider when the primary fails with a retryable error', async () => {
    const primary = {
      generateImage: jest
        .fn()
        .mockRejectedValue(
          new AiProviderError('dalle3', 'OPENAI_500', true, 'temporary outage'),
        ),
    };
    const fallback = {
      generateImage: jest.fn().mockResolvedValue({
        url: 'https://example.com/fallback.png',
        provider: 'stable-diffusion',
        modelVersion: 'stable-diffusion-xl-1024-v1-0',
        generationMs: 2400,
      }),
    };

    factory.getProvider.mockImplementation((provider: string) => {
      return provider === 'dalle3' ? (primary as never) : (fallback as never);
    });

    await expect(
      service.generateImage('ornate frame', '9:16'),
    ).resolves.toMatchObject({
      provider: 'stable-diffusion',
      url: 'https://example.com/fallback.png',
    });

    expect(primary.generateImage).toHaveBeenCalled();
    expect(fallback.generateImage).toHaveBeenCalled();
  });

  it('throws a business exception when every provider fails', async () => {
    factory.getProvider.mockReturnValue({
      generateImage: jest
        .fn()
        .mockRejectedValue(
          new AiProviderError('dalle3', 'OPENAI_400', false, 'prompt rejected'),
        ),
    });

    await expect(service.generateImage('ornate frame', '9:16')).rejects.toThrow(
      BusinessException,
    );
  });
});
