import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { TypeOrmModule } from '@nestjs/typeorm';
import { User } from '../auth/entities/user.entity';
import { AdminGuard } from '../auth/guards/admin.guard';
import { AuthThrottleGuard } from '../auth/guards/custom-throttle.guard';
import { OptionalJwtGuard } from '../auth/guards/optional-jwt.guard';
import { ALBUM_EVENTS_QUEUE } from '../common/queue/queue.constants';
import { Frame } from '../frames/entities/frame.entity';
import { FramesModule } from '../frames/frames.module';
import { Image } from '../images/entities/image.entity';
import { ImageRenderVariant } from '../images/entities/image-render-variant.entity';
import { ImageVariant } from '../images/entities/image-variant.entity';
import { AlbumsController } from './controllers/albums.controller';
import { AlbumItem } from './entities/album-item.entity';
import { AlbumStats } from './entities/album-stats.entity';
import { Album } from './entities/album.entity';
import { AlbumIngestionService } from './services/album.ingestion.service';
import { AlbumQueryService } from './services/album.query.service';
import { AlbumsCacheService } from './services/albums-cache.service';
import { AlbumService } from './services/album.service';
import { ShortCodeService } from './services/short-code.service';
import { AlbumsWorker } from './workers/albums.worker';

@Module({
  imports: [
    FramesModule,
    TypeOrmModule.forFeature([
      Album,
      AlbumItem,
      AlbumStats,
      Frame,
      User,
      Image,
      ImageVariant,
      ImageRenderVariant,
    ]),
    BullModule.registerQueue({
      name: ALBUM_EVENTS_QUEUE,
    }),
  ],
  controllers: [AlbumsController],
  providers: [
    AlbumService,
    AlbumQueryService,
    AlbumIngestionService,
    AlbumsCacheService,
    ShortCodeService,
    AlbumsWorker,
    OptionalJwtGuard,
    AdminGuard,
    AuthThrottleGuard,
  ],
})
export class AlbumsModule {}
