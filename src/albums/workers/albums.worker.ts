import { Processor, WorkerHost, InjectQueue } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Job, Queue } from 'bullmq';
import { Repository } from 'typeorm';
import {
  ALBUM_EVENTS_QUEUE,
  AlbumAnalyticsJobData,
  AlbumEventJobType,
  AlbumImageAddedJobData,
  AlbumIndexUpdateJobData,
} from '../../common/queue/queue.constants';
import { Album } from '../entities/album.entity';
import { AlbumStats } from '../entities/album-stats.entity';
import { AlbumIngestionService } from '../services/album.ingestion.service';
import { AlbumsCacheService } from '../services/albums-cache.service';

@Processor(ALBUM_EVENTS_QUEUE)
export class AlbumsWorker extends WorkerHost {
  private readonly logger = new Logger(AlbumsWorker.name);

  constructor(
    @InjectRepository(Album)
    private readonly albumRepository: Repository<Album>,
    @InjectRepository(AlbumStats)
    private readonly albumStatsRepository: Repository<AlbumStats>,
    @InjectQueue(ALBUM_EVENTS_QUEUE)
    private readonly albumEventsQueue: Queue,
    private readonly albumIngestionService: AlbumIngestionService,
    private readonly albumsCacheService: AlbumsCacheService,
  ) {
    super();
  }

  async process(
    job: Job<
      AlbumImageAddedJobData | AlbumAnalyticsJobData | AlbumIndexUpdateJobData
    >,
  ): Promise<void> {
    const jobType = job.name as AlbumEventJobType;
    switch (jobType) {
      case AlbumEventJobType.IMAGE_ADDED:
        await this.handleImageAdded(job as Job<AlbumImageAddedJobData>);
        return;
      case AlbumEventJobType.ANALYTICS_UPDATE:
        await this.handleAnalyticsUpdate(job as Job<AlbumAnalyticsJobData>);
        return;
      case AlbumEventJobType.INDEX_UPDATE:
        await this.handleIndexUpdate();
        return;
      default:
        throw new Error(`Unsupported album job type: ${job.name}`);
    }
  }

  private async handleImageAdded(
    job: Job<AlbumImageAddedJobData>,
  ): Promise<void> {
    const result = await this.albumIngestionService.ingestImage(job.data);

    if (!result.inserted) {
      return;
    }

    await this.albumsCacheService.invalidateAlbumDetail(
      result.album.id,
      result.album.shortCode,
    );
    await this.albumsCacheService.invalidateAlbumItems(result.album.id);

    await this.albumEventsQueue.add(
      AlbumEventJobType.INDEX_UPDATE,
      {
        albumId: result.album.id,
        reason: 'album-item-added',
      },
      {
        jobId: `album-index-${result.album.id}-${job.data.imageId}`,
      },
    );

    this.logger.log(
      `Album image ingested: album=${result.album.id} image=${job.data.imageId}`,
    );
  }

  private async handleAnalyticsUpdate(
    job: Job<AlbumAnalyticsJobData>,
  ): Promise<void> {
    if (job.data.metric === 'view') {
      await this.albumStatsRepository.query(
        `
          INSERT INTO album_stats (album_id, view_count, share_count)
          VALUES ($1, 1, 0)
          ON CONFLICT (album_id)
          DO UPDATE SET view_count = album_stats.view_count + 1
        `,
        [job.data.albumId],
      );
    } else {
      await this.albumStatsRepository.query(
        `
          INSERT INTO album_stats (album_id, view_count, share_count)
          VALUES ($1, 0, 1)
          ON CONFLICT (album_id)
          DO UPDATE SET share_count = album_stats.share_count + 1
        `,
        [job.data.albumId],
      );
    }

    await this.albumsCacheService.invalidateAlbumStats(job.data.albumId);
    const album = await this.albumRepository.findOne({
      where: { id: job.data.albumId },
      select: ['id', 'shortCode'],
    });
    if (album) {
      await this.albumsCacheService.invalidateAlbumDetail(
        album.id,
        album.shortCode,
      );
    }
  }

  private async handleIndexUpdate(): Promise<void> {
    await this.albumsCacheService.bumpSearchVersion();
  }
}
