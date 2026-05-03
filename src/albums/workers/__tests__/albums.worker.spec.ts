import { Queue } from 'bullmq';
import { Repository } from 'typeorm';
import {
  AlbumEventJobType,
  AlbumImageAddedJobData,
} from '../../../common/queue/queue.constants';
import { Album } from '../../entities/album.entity';
import { AlbumStats } from '../../entities/album-stats.entity';
import { AlbumIngestionService } from '../../services/album.ingestion.service';
import { AlbumsCacheService } from '../../services/albums-cache.service';
import { AlbumsWorker } from '../albums.worker';

describe('AlbumsWorker', () => {
  let worker: AlbumsWorker;
  let albumRepository: jest.Mocked<Repository<Album>>;
  let albumStatsRepository: jest.Mocked<Repository<AlbumStats>>;
  let albumEventsQueue: jest.Mocked<Queue>;
  let albumIngestionService: jest.Mocked<AlbumIngestionService>;
  let albumsCacheService: jest.Mocked<AlbumsCacheService>;

  beforeEach(() => {
    albumRepository = {
      findOne: jest.fn(),
    } as unknown as jest.Mocked<Repository<Album>>;
    albumStatsRepository = {
      query: jest.fn(),
    } as unknown as jest.Mocked<Repository<AlbumStats>>;
    albumEventsQueue = {
      add: jest.fn(),
    } as unknown as jest.Mocked<Queue>;
    albumIngestionService = {
      ingestImage: jest.fn(),
    } as unknown as jest.Mocked<AlbumIngestionService>;
    albumsCacheService = {
      invalidateAlbumDetail: jest.fn(),
      invalidateAlbumItems: jest.fn(),
      invalidateAlbumStats: jest.fn(),
      bumpSearchVersion: jest.fn(),
    } as unknown as jest.Mocked<AlbumsCacheService>;

    worker = new AlbumsWorker(
      albumRepository,
      albumStatsRepository,
      albumEventsQueue,
      albumIngestionService,
      albumsCacheService,
    );
  });

  it('invalidates album caches and enqueues an index refresh when an image is added', async () => {
    const jobData: AlbumImageAddedJobData = {
      albumId: 'album-1',
      imageId: 'image-1',
      frameId: 'frame-1',
      userId: 'user-1',
      imageRenderRevision: 1,
    };

    albumIngestionService.ingestImage.mockResolvedValue({
      album: {
        id: 'album-1',
        shortCode: '3mH8cQpL',
      } as Album,
      inserted: true,
    });

    await worker.process({
      name: AlbumEventJobType.IMAGE_ADDED,
      data: jobData,
    } as never);

    expect(albumsCacheService.invalidateAlbumDetail).toHaveBeenCalledWith(
      'album-1',
      '3mH8cQpL',
    );
    expect(albumsCacheService.invalidateAlbumItems).toHaveBeenCalledWith(
      'album-1',
    );
    expect(albumEventsQueue.add).toHaveBeenCalledWith(
      AlbumEventJobType.INDEX_UPDATE,
      expect.objectContaining({
        albumId: 'album-1',
        reason: 'album-item-added',
      }),
      expect.objectContaining({
        jobId: 'album-index-album-1-image-1',
      }),
    );
  });

  it('updates analytics counters and invalidates stats/detail caches', async () => {
    albumRepository.findOne.mockResolvedValue({
      id: 'album-1',
      shortCode: '3mH8cQpL',
    } as Album);

    await worker.process({
      name: AlbumEventJobType.ANALYTICS_UPDATE,
      data: {
        albumId: 'album-1',
        metric: 'view',
      },
    } as never);

    expect(albumStatsRepository.query).toHaveBeenCalled();
    expect(albumsCacheService.invalidateAlbumStats).toHaveBeenCalledWith(
      'album-1',
    );
    expect(albumsCacheService.invalidateAlbumDetail).toHaveBeenCalledWith(
      'album-1',
      '3mH8cQpL',
    );
  });

  it('bumps the shared search version for index refresh jobs', async () => {
    await worker.process({
      name: AlbumEventJobType.INDEX_UPDATE,
      data: { albumId: 'album-1', reason: 'album-created' },
    } as never);

    expect(albumsCacheService.bumpSearchVersion).toHaveBeenCalled();
  });
});
