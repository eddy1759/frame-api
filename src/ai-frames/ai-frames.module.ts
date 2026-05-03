import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuthModule } from '../auth/auth.module';
import { User } from '../auth/entities/user.entity';
import { AI_FRAME_GENERATION_QUEUE } from '../common/queue/queue.constants';
import { Frame, FrameAsset } from '../frames/entities';
import { FramesModule } from '../frames/frames.module';
import { AiFrameIteration, AiFrameJob } from './entities';
import { AiFramesController, AiFramesAdminController } from './controllers';
import {
  AiFrameGenerationService,
  AiFrameQueryService,
  AiFramesCacheService,
  AiFrameService,
  ModerationService,
  PromptEngineerService,
} from './services';
import {
  AiImageGeneratorFactory,
  DallE3ImageGenerator,
  StableDiffusionImageGenerator,
} from './providers';
import {
  AiFrameAdminGuard,
  AiFrameIterationGuard,
  AiFrameOwnerGuard,
} from './guards';
import { AiFrameGenerationWorker } from './workers/ai-frame-generation.worker';

@Module({
  imports: [
    AuthModule,
    FramesModule,
    TypeOrmModule.forFeature([
      AiFrameJob,
      AiFrameIteration,
      Frame,
      FrameAsset,
      User,
    ]),
    BullModule.registerQueue({
      name: AI_FRAME_GENERATION_QUEUE,
    }),
  ],
  controllers: [AiFramesController, AiFramesAdminController],
  providers: [
    ModerationService,
    PromptEngineerService,
    AiFrameGenerationService,
    AiFramesCacheService,
    AiFrameQueryService,
    AiFrameService,
    AiImageGeneratorFactory,
    DallE3ImageGenerator,
    StableDiffusionImageGenerator,
    AiFrameOwnerGuard,
    AiFrameIterationGuard,
    AiFrameAdminGuard,
    AiFrameGenerationWorker,
  ],
  exports: [AiFrameService, AiFrameQueryService],
})
export class AiFramesModule {}
