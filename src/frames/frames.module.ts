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
  FramesCacheService,
  FramesService,
  FramesWarmupService,
  TagsService,
} from './services';
import { FramesSyncCron } from './cron/frames-sync.cron';
import { AdminGuard, OptionalJwtGuard, PremiumFrameGuard } from './guards';

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
    FramesCacheService,
    FramesWarmupService,
    FramesSyncCron,
    AdminGuard,
    OptionalJwtGuard,
    PremiumFrameGuard,
    AuthThrottleGuard,
  ],
  exports: [FramesService, CategoriesService, TagsService],
})
export class FramesModule {}
