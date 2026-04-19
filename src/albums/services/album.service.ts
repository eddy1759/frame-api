import { HttpStatus, Injectable, Logger } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { InjectRepository } from '@nestjs/typeorm';
import { Queue } from 'bullmq';
import { Repository } from 'typeorm';
import { User } from '../../auth/entities/user.entity';
import { BusinessException } from '../../common/filters/business.exception';
import {
  ALBUM_EVENTS_QUEUE,
  AlbumAnalyticsJobData,
  AlbumEventJobType,
  AlbumIndexUpdateJobData,
} from '../../common/queue/queue.constants';
import { Frame } from '../../frames/entities/frame.entity';
import { FramesService } from '../../frames/services/frames.service';
import { CreateAlbumDto } from '../dto/create-album.dto';
import { Album } from '../entities/album.entity';
import { AlbumStats } from '../entities/album-stats.entity';
import { ShortCodeService } from './short-code.service';

@Injectable()
export class AlbumService {
  private readonly logger = new Logger(AlbumService.name);

  constructor(
    @InjectRepository(Album)
    private readonly albumRepository: Repository<Album>,
    @InjectRepository(Frame)
    private readonly frameRepository: Repository<Frame>,
    @InjectQueue(ALBUM_EVENTS_QUEUE)
    private readonly albumEventsQueue: Queue,
    private readonly framesService: FramesService,
    private readonly shortCodeService: ShortCodeService,
  ) {}

  async createAlbum(
    user: User,
    dto: CreateAlbumDto,
  ): Promise<{
    id: string;
    shortCode: string;
    frameId: string;
    ownerId: string;
    name: string;
    description: string | null;
    isPublic: boolean;
    sharePath: string;
  }> {
    await this.framesService.assertFrameEligibleForImage(dto.frameId, user);

    const { album, created } = await this.findOrCreateAlbum(user.id, dto);

    await this.queueAnalyticsUpdate(album.id, 'share');

    if (created) {
      await this.queueIndexUpdate(album.id, 'album-created');
    }

    return {
      id: album.id,
      shortCode: album.shortCode,
      frameId: album.frameId,
      ownerId: album.ownerId,
      name: album.name,
      description: album.description,
      isPublic: album.isPublic,
      sharePath: `/albums/${album.shortCode}`,
    };
  }

  async queueAnalyticsUpdate(
    albumId: string,
    metric: AlbumAnalyticsJobData['metric'],
  ): Promise<void> {
    await this.albumEventsQueue.add(
      AlbumEventJobType.ANALYTICS_UPDATE,
      { albumId, metric },
      {
        jobId: `album-analytics-${metric}-${albumId}-${Date.now()}`,
      },
    );
  }

  async queueIndexUpdate(
    albumId: string,
    reason: AlbumIndexUpdateJobData['reason'],
  ): Promise<void> {
    await this.albumEventsQueue.add(
      AlbumEventJobType.INDEX_UPDATE,
      { albumId, reason },
      {
        jobId: `album-index-${albumId}-${reason}-${Date.now()}`,
      },
    );
  }

  private async findOrCreateAlbum(
    ownerId: string,
    dto: CreateAlbumDto,
  ): Promise<{ album: Album; created: boolean }> {
    const existing = await this.albumRepository.findOne({
      where: {
        ownerId,
        frameId: dto.frameId,
      },
    });

    if (existing) {
      return { album: existing, created: false };
    }

    const frame = await this.frameRepository.findOne({
      where: { id: dto.frameId },
      select: ['id', 'name'],
    });

    if (!frame) {
      throw new BusinessException(
        'FRAME_NOT_FOUND',
        'Frame with the specified ID does not exist.',
        HttpStatus.NOT_FOUND,
      );
    }

    for (let attempt = 0; attempt < 5; attempt++) {
      const shortCode = await this.shortCodeService.generateUnique(
        async (candidate) => {
          const album = await this.albumRepository.findOne({
            where: { shortCode: candidate },
            select: ['id'],
          });
          return Boolean(album);
        },
      );

      try {
        const createdAlbum = await this.albumRepository.manager.transaction(
          async (manager) => {
            const album = manager.getRepository(Album).create({
              ownerId,
              frameId: dto.frameId,
              shortCode,
              name: dto.name?.trim() || frame.name,
              description: dto.description?.trim() || null,
              isPublic: true,
            });

            const savedAlbum = await manager.getRepository(Album).save(album);

            await manager.getRepository(AlbumStats).save({
              albumId: savedAlbum.id,
              viewCount: 0,
              shareCount: 0,
            });

            return savedAlbum;
          },
        );

        this.logger.log(
          `Album created: ${createdAlbum.id} for owner ${createdAlbum.ownerId}`,
        );

        return { album: createdAlbum, created: true };
      } catch (error) {
        if (this.isUniqueViolation(error, 'idx_album_owner_frame')) {
          const concurrentAlbum = await this.albumRepository.findOne({
            where: {
              ownerId,
              frameId: dto.frameId,
            },
          });

          if (concurrentAlbum) {
            return { album: concurrentAlbum, created: false };
          }
        }

        if (this.isUniqueViolation(error, 'idx_album_shortcode')) {
          continue;
        }

        throw error;
      }
    }

    throw new BusinessException(
      'ALBUM_CREATE_FAILED',
      'Unable to create album at this time.',
      HttpStatus.INTERNAL_SERVER_ERROR,
    );
  }

  private isUniqueViolation(error: unknown, constraint: string): boolean {
    if (
      typeof error !== 'object' ||
      error === null ||
      !('code' in error) ||
      !('constraint' in error)
    ) {
      return false;
    }

    return (
      (error as { code?: string }).code === '23505' &&
      (error as { constraint?: string }).constraint === constraint
    );
  }
}
