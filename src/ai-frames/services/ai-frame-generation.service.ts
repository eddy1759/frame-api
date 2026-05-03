import { HttpStatus, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { BusinessException } from '../../common/filters/business.exception';
import { AiProviderError, AiImageGeneratorFactory } from '../providers';

@Injectable()
export class AiFrameGenerationService {
  constructor(
    private readonly configService: ConfigService,
    private readonly aiImageGeneratorFactory: AiImageGeneratorFactory,
  ) {}

  async generateImage(
    prompt: string,
    aspectRatio: string,
  ): Promise<{
    url: string;
    provider: string;
    modelVersion: string;
    generationMs: number;
  }> {
    const providers = this.getProviderOrder();
    let lastError: AiProviderError | null = null;

    for (const provider of providers) {
      try {
        return await this.aiImageGeneratorFactory
          .getProvider(provider)
          .generateImage(prompt, aspectRatio);
      } catch (error) {
        if (error instanceof AiProviderError) {
          lastError = error;
          if (!error.retryable) {
            break;
          }
          continue;
        }

        throw error;
      }
    }

    throw new BusinessException(
      'AI_FRAME_PROVIDER_UNAVAILABLE',
      lastError?.message || 'All AI providers failed to generate the frame.',
      HttpStatus.BAD_GATEWAY,
    );
  }

  private getProviderOrder(): string[] {
    const primary = this.configService.get<string>('ai.provider', 'dalle3');
    const fallbacks = this.configService.get<string[]>(
      'ai.providerFallbacks',
      [],
    );

    return Array.from(new Set([primary, ...fallbacks]));
  }
}
