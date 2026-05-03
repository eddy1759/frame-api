import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { User } from '../auth/entities/user.entity';
import { AuthThrottleGuard } from '../auth/guards/custom-throttle.guard';
import {
  Category,
  Frame,
  FrameAsset,
  FrameCategory,
  FrameTag,
  Tag,
  UserSavedFrame,
} from './entities';
import {
  CategoriesController,
  CategoriesAdminController,
  FramesAdminController,
  FramesController,
  TagsAdminController,
} from './controllers';
import {
  CategoriesService,
  FrameAssetsService,
  FrameCompositorService,
  FramesCacheService,
  FramesService,
  FramesWarmupService,
  TagsService,
} from './services';
import { FramesSyncCron } from './cron/frames-sync.cron';
import { PremiumFrameGuard } from './guards';
import { AdminGuard, OptionalJwtGuard } from '../auth/guards';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      User,
      Frame,
      Category,
      Tag,
      FrameAsset,
      FrameCategory,
      FrameTag,
      UserSavedFrame,
    ]),
  ],
  controllers: [
    FramesController,
    FramesAdminController,
    CategoriesController,
    CategoriesAdminController,
    TagsAdminController,
  ],
  providers: [
    FramesService,
    CategoriesService,
    TagsService,
    FrameAssetsService,
    FrameCompositorService,
    FramesCacheService,
    FramesWarmupService,
    FramesSyncCron,
    AdminGuard,
    OptionalJwtGuard,
    PremiumFrameGuard,
    AuthThrottleGuard,
  ],
  exports: [
    FramesService,
    CategoriesService,
    TagsService,
    FrameAssetsService,
    FrameCompositorService,
    FramesCacheService,
  ],
})
export class FramesModule {}
