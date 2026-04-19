// src/images/images.module.ts
import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ConfigModule } from '@nestjs/config';
import { BullModule } from '@nestjs/bullmq';
import { Album } from '../albums/entities/album.entity';
import { AlbumItem } from '../albums/entities/album-item.entity';
import { FramesModule } from '../frames/frames.module';

// Entities
import { Image } from './entities/image.entity';
import { ImageVariant } from './entities/image-variant.entity';
import { ImageRenderVariant } from './entities/image-render-variant.entity';
import { UploadSession } from './entities/upload-session.entity';
import { UserStorageQuota } from './entities/user-storage-quota.entity';

// Controllers
import { ImagesController } from './controllers/images.controller';
import { ImagesAdminController } from './controllers/images-admin.controller';
import { UploadSessionsController } from './controllers/upload-sessions.controller';

// Services
import { ImagesService } from './services/images.service';
import { UploadService } from './services/upload.service';
import { ImageProcessingService } from './services/image-processing.service';
import { ImageVariantService } from './services/image-variant.service';
import { ImageRenderVariantService } from './services/image-render-variant.service';
import { ImageCompositingService } from './services/image-compositing.service';
import { StorageQuotaService } from './services/storage-quota.service';
import { ImagesCacheService } from './services/images-cache.service';

// Workers
import { ImageProcessingWorker } from './workers/image-processing.worker';
import { UploadCleanupService } from './workers/upload-cleanup.worker';

// Constants
import {
  ALBUM_EVENTS_QUEUE,
  IMAGE_PROCESSING_QUEUE,
  IMAGE_CLEANUP_QUEUE,
} from '../common/queue/queue.constants';

@Module({
  imports: [
    ConfigModule,
    FramesModule,
    TypeOrmModule.forFeature([
      Album,
      AlbumItem,
      Image,
      ImageVariant,
      ImageRenderVariant,
      UploadSession,
      UserStorageQuota,
    ]),
    BullModule.registerQueue(
      { name: ALBUM_EVENTS_QUEUE },
      { name: IMAGE_PROCESSING_QUEUE },
      { name: IMAGE_CLEANUP_QUEUE },
    ),
  ],
  controllers: [
    ImagesController,
    ImagesAdminController,
    UploadSessionsController,
  ],
  providers: [
    ImagesService,
    UploadService,
    ImageProcessingService,
    ImageVariantService,
    ImageRenderVariantService,
    ImageCompositingService,
    StorageQuotaService,
    ImagesCacheService,
    ImageProcessingWorker,
    UploadCleanupService,
  ],
  exports: [
    ImagesService,
    ImageVariantService,
    ImageRenderVariantService,
    ImageCompositingService,
    StorageQuotaService,
  ],
})
export class ImagesModule {}
