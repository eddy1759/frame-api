import { Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common';
import { FramesService } from './frames.service';

@Injectable()
export class FramesWarmupService implements OnApplicationBootstrap {
  private readonly logger = new Logger(FramesWarmupService.name);

  constructor(private readonly framesService: FramesService) {}

  async onApplicationBootstrap(): Promise<void> {
    try {
      await this.framesService.warmCaches();
      this.logger.log('Frames cache warmup completed');
    } catch (error) {
      this.logger.warn(
        `Frames cache warmup skipped: ${error instanceof Error ? error.message : 'unknown error'}`,
      );
    }
  }
}
