import { HttpStatus } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { BusinessException } from '../../../common/filters/business.exception';
import { ModerationService } from '../moderation.service';

describe('ModerationService', () => {
  let service: ModerationService;
  let configService: jest.Mocked<ConfigService>;
  const fetchMock = jest.fn();

  beforeEach(() => {
    configService = {
      get: jest.fn((key: string) => {
        if (key === 'ai.openAiApiKey') return 'test-key';
        if (key === 'ai.providerTimeoutMs') return 1000;
        return undefined;
      }),
    } as unknown as jest.Mocked<ConfigService>;

    service = new ModerationService(configService);
    global.fetch = fetchMock as unknown as typeof fetch;
  });

  afterEach(() => {
    fetchMock.mockReset();
  });

  it('throws AI_FRAME_PROMPT_FLAGGED when moderation flags the prompt', async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({
        results: [{ flagged: true }],
      }),
    });

    await expect(service.assertPromptIsSafe('unsafe prompt')).rejects.toThrow(
      BusinessException,
    );

    try {
      await service.assertPromptIsSafe('unsafe prompt');
    } catch (error) {
      expect((error as BusinessException).getStatus()).toBe(
        HttpStatus.UNPROCESSABLE_ENTITY,
      );
      expect((error as BusinessException).getResponse()).toMatchObject({
        code: 'AI_FRAME_PROMPT_FLAGGED',
      });
    }
  });

  it('throws AI_FRAME_PROVIDER_UNAVAILABLE when moderation request fails', async () => {
    fetchMock.mockResolvedValue({
      ok: false,
    });

    await expect(service.assertPromptIsSafe('safe prompt')).rejects.toThrow(
      BusinessException,
    );

    try {
      await service.assertPromptIsSafe('safe prompt');
    } catch (error) {
      expect((error as BusinessException).getStatus()).toBe(
        HttpStatus.SERVICE_UNAVAILABLE,
      );
      expect((error as BusinessException).getResponse()).toMatchObject({
        code: 'AI_FRAME_PROVIDER_UNAVAILABLE',
      });
    }
  });
});
