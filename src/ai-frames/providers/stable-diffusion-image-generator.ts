import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  AI_FRAME_PROVIDER_STABLE_DIFFUSION,
  resolveAiFrameAspectRatioPreset,
} from '../ai-frame.constants';
import { IAiImageGenerator } from '../interfaces';
import { AiProviderError } from './ai-provider.error';

@Injectable()
export class StableDiffusionImageGenerator implements IAiImageGenerator {
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
    const apiKey = this.configService.get<string>('ai.stableDiffusionApiKey');
    if (!apiKey) {
      throw new AiProviderError(
        AI_FRAME_PROVIDER_STABLE_DIFFUSION,
        'STABLE_DIFFUSION_API_KEY_MISSING',
        false,
        'Stable Diffusion API key is not configured.',
      );
    }

    const startedAt = Date.now();
    const { width, height } = this.resolveProviderSize(aspectRatio);
    const response = await fetch(
      'https://api.stability.ai/v1/generation/stable-diffusion-xl-1024-v1-0/text-to-image',
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${apiKey}`,
          Accept: 'application/json',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          text_prompts: [{ text: prompt, weight: 1 }],
          cfg_scale: 7,
          samples: 1,
          steps: 40,
          width,
          height,
        }),
        signal: AbortSignal.timeout(
          this.configService.get<number>('ai.providerTimeoutMs', 90000),
        ),
      },
    );

    if (!response.ok) {
      const message = await this.readErrorMessage(response);
      throw new AiProviderError(
        AI_FRAME_PROVIDER_STABLE_DIFFUSION,
        `STABILITY_${response.status}`,
        response.status >= 500 || response.status === 429,
        message,
      );
    }

    const payload = (await response.json()) as {
      artifacts?: Array<{ base64?: string }>;
    };
    const artifact = payload.artifacts?.find((item) => Boolean(item.base64));

    if (!artifact?.base64) {
      throw new AiProviderError(
        AI_FRAME_PROVIDER_STABLE_DIFFUSION,
        'STABILITY_EMPTY_RESPONSE',
        true,
        'Stable Diffusion returned no usable image payload.',
      );
    }

    return {
      url: `data:image/png;base64,${artifact.base64}`,
      provider: AI_FRAME_PROVIDER_STABLE_DIFFUSION,
      modelVersion: 'stable-diffusion-xl-1024-v1-0',
      generationMs: Date.now() - startedAt,
    };
  }

  private resolveProviderSize(aspectRatio: string): {
    width: number;
    height: number;
  } {
    const preset = resolveAiFrameAspectRatioPreset(aspectRatio);

    if (preset.width === preset.height) {
      return { width: 1024, height: 1024 };
    }

    if (preset.width > preset.height) {
      return { width: 1536, height: 1024 };
    }

    return { width: 1024, height: 1536 };
  }

  private async readErrorMessage(response: Response): Promise<string> {
    try {
      const payload = (await response.json()) as {
        message?: string;
        errors?: string[];
      };
      return (
        payload.message || payload.errors?.[0] || 'Stable Diffusion failed.'
      );
    } catch {
      return 'Stable Diffusion failed.';
    }
  }
}
