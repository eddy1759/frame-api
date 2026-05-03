import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  AI_FRAME_PROVIDER_DALLE3,
  resolveAiFrameAspectRatioPreset,
} from '../ai-frame.constants';
import { IAiImageGenerator } from '../interfaces';
import { AiProviderError } from './ai-provider.error';

@Injectable()
export class DallE3ImageGenerator implements IAiImageGenerator {
  constructor(private readonly configService: ConfigService) {}

  async generateImage(
    prompt: string,
    aspectRatio: string,
  ): Promise<{
    url: string;
    provider: string;
    modelVersion: string;
    generationMs: number;
  }> {
    const apiKey = this.configService.get<string>('ai.openAiApiKey');
    if (!apiKey) {
      throw new AiProviderError(
        AI_FRAME_PROVIDER_DALLE3,
        'OPENAI_API_KEY_MISSING',
        false,
        'OpenAI API key is not configured.',
      );
    }

    const startedAt = Date.now();
    const size = this.resolveOpenAiSize(aspectRatio);
    const response = await fetch(
      'https://api.openai.com/v1/images/generations',
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: 'dall-e-3',
          prompt,
          size,
          n: 1,
          response_format: 'b64_json',
        }),
        signal: AbortSignal.timeout(
          this.configService.get<number>('ai.providerTimeoutMs', 90000),
        ),
      },
    );

    if (!response.ok) {
      const message = await this.readErrorMessage(response);
      throw new AiProviderError(
        AI_FRAME_PROVIDER_DALLE3,
        `OPENAI_${response.status}`,
        response.status >= 500 || response.status === 429,
        message,
      );
    }

    const payload = (await response.json()) as {
      data?: Array<{
        url?: string;
        b64_json?: string;
        revised_prompt?: string;
      }>;
    };
    const result = payload.data?.[0];

    if (!result?.url && !result?.b64_json) {
      throw new AiProviderError(
        AI_FRAME_PROVIDER_DALLE3,
        'OPENAI_EMPTY_RESPONSE',
        true,
        'OpenAI image generation returned no usable image payload.',
      );
    }

    return {
      url: result.url ?? `data:image/png;base64,${result.b64_json}`,
      provider: AI_FRAME_PROVIDER_DALLE3,
      modelVersion: 'dall-e-3',
      generationMs: Date.now() - startedAt,
    };
  }

  private resolveOpenAiSize(aspectRatio: string): string {
    const preset = resolveAiFrameAspectRatioPreset(aspectRatio);
    if (preset.width === preset.height) {
      return '1024x1024';
    }

    if (preset.width > preset.height) {
      return '1792x1024';
    }

    return '1024x1792';
  }

  private async readErrorMessage(response: Response): Promise<string> {
    try {
      const payload = (await response.json()) as {
        error?: { message?: string };
      };
      return payload.error?.message || 'OpenAI image generation failed.';
    } catch {
      return 'OpenAI image generation failed.';
    }
  }
}
