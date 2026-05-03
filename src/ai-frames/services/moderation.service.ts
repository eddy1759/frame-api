import { HttpStatus, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { BusinessException } from '../../common/filters/business.exception';

@Injectable()
export class ModerationService {
  constructor(private readonly configService: ConfigService) {}

  async assertPromptIsSafe(input: string): Promise<void> {
    const apiKey = this.configService.get<string>('ai.openAiApiKey');
    if (!apiKey) {
      throw new BusinessException(
        'AI_FRAME_PROVIDER_UNAVAILABLE',
        'AI moderation is not configured.',
        HttpStatus.SERVICE_UNAVAILABLE,
      );
    }

    const response = await fetch('https://api.openai.com/v1/moderations', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'omni-moderation-latest',
        input,
      }),
      signal: AbortSignal.timeout(
        this.configService.get<number>('ai.providerTimeoutMs', 90000),
      ),
    });

    if (!response.ok) {
      throw new BusinessException(
        'AI_FRAME_PROVIDER_UNAVAILABLE',
        'AI moderation request failed.',
        HttpStatus.SERVICE_UNAVAILABLE,
      );
    }

    const payload = (await response.json()) as {
      results?: Array<{ flagged?: boolean }>;
    };

    if (payload.results?.some((result) => result.flagged)) {
      throw new BusinessException(
        'AI_FRAME_PROMPT_FLAGGED',
        'The supplied prompt was flagged by content moderation.',
        HttpStatus.UNPROCESSABLE_ENTITY,
      );
    }
  }
}
