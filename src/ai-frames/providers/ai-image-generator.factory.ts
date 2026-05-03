import { BadRequestException, Injectable } from '@nestjs/common';
import {
  AI_FRAME_PROVIDER_DALLE3,
  AI_FRAME_PROVIDER_STABLE_DIFFUSION,
} from '../ai-frame.constants';
import { IAiImageGenerator } from '../interfaces';
import { DallE3ImageGenerator } from './dalle3-image-generator';
import { StableDiffusionImageGenerator } from './stable-diffusion-image-generator';

@Injectable()
export class AiImageGeneratorFactory {
  private readonly providers: Map<string, IAiImageGenerator>;

  constructor(
    private readonly dalle3ImageGenerator: DallE3ImageGenerator,
    private readonly stableDiffusionImageGenerator: StableDiffusionImageGenerator,
  ) {
    this.providers = new Map<string, IAiImageGenerator>([
      [AI_FRAME_PROVIDER_DALLE3, this.dalle3ImageGenerator],
      [AI_FRAME_PROVIDER_STABLE_DIFFUSION, this.stableDiffusionImageGenerator],
    ]);
  }

  getProvider(provider: string): IAiImageGenerator {
    const resolved = this.providers.get(provider);

    if (!resolved) {
      throw new BadRequestException({
        code: 'AI_FRAME_PROVIDER_UNAVAILABLE',
        message: `AI provider '${provider}' is not configured.`,
      });
    }

    return resolved;
  }
}
