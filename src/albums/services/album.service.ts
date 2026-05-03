import { HttpStatus, Injectable, Logger } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { InjectRepository } from '@nestjs/typeorm';
import { Queue } from 'bullmq';
import { Repository } from 'typeorm';
import { User } from '../../auth/entities/user.entity';
import { UserRole } from '../../auth/enums/user-role.enum';
import { BusinessException } from '../../common/filters/business.exception';
import {
  ALBUM_EVENTS_QUEUE,
  AlbumAnalyticsJobData,
  AlbumEventJobType,
  AlbumIndexUpdateJobData,
} from '../../common/queue/queue.constants';
import { FramesService } from '../../frames/services/frames.service';
import { CheckAlbumShortCodeAvailabilityDto } from '../dto/check-album-shortcode-availability.dto';
import { CreateAlbumDto } from '../dto/create-album.dto';
import { UpdateAlbumDto } from '../dto/update-album.dto';
import { Album } from '../entities/album.entity';
import { AlbumStats } from '../entities/album-stats.entity';
import { AlbumsCacheService } from './albums-cache.service';
import { ShortCodeService } from './short-code.service';

type AlbumSummary = {
  id: string;
  shortCode: string;
  frameId: string;
  ownerId: string;
  name: string;
  description: string | null;
  isPublic: boolean;
  sharePath: string;
};

@Injectable()
export class AlbumService {
  private readonly logger = new Logger(AlbumService.name);

  constructor(
    @InjectRepository(Album)
    private readonly albumRepository: Repository<Album>,
    @InjectQueue(ALBUM_EVENTS_QUEUE)
    private readonly albumEventsQueue: Queue,
    private readonly framesService: FramesService,
    private readonly shortCodeService: ShortCodeService,
    private readonly albumsCacheService: AlbumsCacheService,
  ) {}

  async createAlbum(user: User, dto: CreateAlbumDto): Promise<AlbumSummary> {
    await this.framesService.assertFrameEligibleForImage(dto.frameId, user);

    const album = await this.createAlbumRecord(user, dto);

    await this.queueAnalyticsUpdate(album.id, 'share');
    await this.queueIndexUpdate(album.id, 'album-created');

    return this.serializeAlbum(album);
  }

  async updateAlbum(
    user: User,
    albumId: string,
    dto: UpdateAlbumDto,
  ): Promise<AlbumSummary> {
    const album = await this.getAlbumForMutation(albumId);
    this.ensureAlbumOwnerAccess(user, album);

    const previousShortCode = album.shortCode;
    const nextName =
      dto.name !== undefined ? this.normalizeAlbumName(dto.name) : album.name;
    const nextDescription =
      dto.description !== undefined
        ? this.normalizeDescription(dto.description)
        : album.description;
    const nextShortCode =
      dto.shortCode !== undefined
        ? await this.resolveUniqueShortCode({
            requestedShortCode: dto.shortCode,
            albumName: nextName,
            excludeAlbumId: album.id,
          })
        : album.shortCode;

    album.name = nextName;
    album.description = nextDescription;
    album.shortCode = nextShortCode;

    const savedAlbum = await this.saveAlbumWithShortCodeRetry(
      album,
      Boolean(dto.shortCode),
      nextName,
      album.id,
    );

    await this.albumsCacheService.invalidateAlbumDetail(
      savedAlbum.id,
      previousShortCode,
    );
    await this.queueIndexUpdate(savedAlbum.id, 'album-updated');

    return this.serializeAlbum(savedAlbum);
  }

  async checkShortCodeAvailability(
    dto: CheckAlbumShortCodeAvailabilityDto,
  ): Promise<{
    shortCode: string;
    available: boolean;
    valid: boolean;
    message: string;
  }> {
    const normalized = this.shortCodeService.normalizeCustomShortCode(
      dto.shortCode,
    );

    if (!normalized || !this.shortCodeService.isValidShortCode(normalized)) {
      return {
        shortCode: normalized,
        available: false,
        valid: false,
        message:
          'Short code must be 4-32 characters and use lowercase letters, numbers, or hyphens.',
      };
    }

    const exists = await this.shortCodeExists(normalized, dto.excludeAlbumId);

    return {
      shortCode: normalized,
      available: !exists,
      valid: true,
      message: exists
        ? 'Short code is already in use.'
        : 'Short code is available.',
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

  private async createAlbumRecord(
    user: User,
    dto: CreateAlbumDto,
  ): Promise<Album> {
    const name = this.normalizeAlbumName(dto.name);
    const description = this.normalizeDescription(dto.description);
    const shortCode = await this.resolveUniqueShortCode({
      requestedShortCode: dto.shortCode,
      albumName: name,
    });

    const album = this.albumRepository.create({
      ownerId: user.id,
      frameId: dto.frameId,
      shortCode,
      name,
      description,
      isPublic: true,
    });

    const savedAlbum = await this.saveAlbumWithShortCodeRetry(
      album,
      Boolean(dto.shortCode),
      name,
    );

    this.logger.log(
      `Album created: ${savedAlbum.id} for owner ${savedAlbum.ownerId}`,
    );

    return savedAlbum;
  }

  private async saveAlbumWithShortCodeRetry(
    album: Album,
    requestedShortCodeProvided: boolean,
    albumName: string,
    excludeAlbumId?: string,
  ): Promise<Album> {
    for (let attempt = 0; attempt < 5; attempt++) {
      try {
        return await this.albumRepository.manager.transaction(
          async (manager) => {
            const albumRepository = manager.getRepository(Album);
            const statsRepository = manager.getRepository(AlbumStats);
            const savedAlbum = await albumRepository.save(album);

            const existingStats = await statsRepository.findOne({
              where: { albumId: savedAlbum.id },
              select: ['albumId'],
            });

            if (!existingStats) {
              await statsRepository.save({
                albumId: savedAlbum.id,
                viewCount: 0,
                shareCount: 0,
              });
            }

            return savedAlbum;
          },
        );
      } catch (error) {
        if (this.isUniqueViolation(error, 'idx_album_shortcode')) {
          if (requestedShortCodeProvided) {
            throw new BusinessException(
              'ALBUM_SHORT_CODE_TAKEN',
              'That album short code is already in use.',
              HttpStatus.CONFLICT,
            );
          }

          album.shortCode = await this.shortCodeService.generateUniqueFromName(
            albumName,
            (candidate) => this.shortCodeExists(candidate, excludeAlbumId),
          );
          continue;
        }

        throw error;
      }
    }

    throw new BusinessException(
      'ALBUM_CREATE_FAILED',
      'Unable to create or update album at this time.',
      HttpStatus.INTERNAL_SERVER_ERROR,
    );
  }

  private async resolveUniqueShortCode({
    requestedShortCode,
    albumName,
    excludeAlbumId,
  }: {
    requestedShortCode?: string;
    albumName: string;
    excludeAlbumId?: string;
  }): Promise<string> {
    if (requestedShortCode !== undefined) {
      const normalized =
        this.shortCodeService.normalizeCustomShortCode(requestedShortCode);

      if (!normalized || !this.shortCodeService.isValidShortCode(normalized)) {
        throw new BusinessException(
          'ALBUM_SHORT_CODE_INVALID',
          'Short code must be 4-32 characters and use lowercase letters, numbers, or hyphens.',
          HttpStatus.BAD_REQUEST,
        );
      }

      if (await this.shortCodeExists(normalized, excludeAlbumId)) {
        throw new BusinessException(
          'ALBUM_SHORT_CODE_TAKEN',
          'That album short code is already in use.',
          HttpStatus.CONFLICT,
        );
      }

      return normalized;
    }

    return this.shortCodeService.generateUniqueFromName(
      albumName,
      (candidate) => this.shortCodeExists(candidate, excludeAlbumId),
    );
  }

  private async shortCodeExists(
    shortCode: string,
    excludeAlbumId?: string,
  ): Promise<boolean> {
    const qb = this.albumRepository
      .createQueryBuilder('album')
      .select('album.id', 'id')
      .where('LOWER(album.shortCode) = LOWER(:shortCode)', { shortCode });

    if (excludeAlbumId) {
      qb.andWhere('album.id != :excludeAlbumId', { excludeAlbumId });
    }

    const existing = await qb.getRawOne<{ id: string }>();
    return Boolean(existing?.id);
  }

  private async getAlbumForMutation(albumId: string): Promise<Album> {
    const album = await this.albumRepository.findOne({
      where: { id: albumId },
      select: [
        'id',
        'ownerId',
        'frameId',
        'shortCode',
        'name',
        'description',
        'isPublic',
        'createdAt',
        'updatedAt',
      ],
    });

    if (!album) {
      throw new BusinessException(
        'ALBUM_NOT_FOUND',
        'Album not found.',
        HttpStatus.NOT_FOUND,
      );
    }

    return album;
  }

  private ensureAlbumOwnerAccess(user: User, album: Album): void {
    if (user.role === UserRole.ADMIN || album.ownerId === user.id) {
      return;
    }

    throw new BusinessException(
      'ALBUM_FORBIDDEN',
      'You do not have permission to modify this album.',
      HttpStatus.FORBIDDEN,
    );
  }

  private normalizeAlbumName(name: string): string {
    const normalized = name.trim();

    if (!normalized) {
      throw new BusinessException(
        'ALBUM_NAME_REQUIRED',
        'Album name is required.',
        HttpStatus.BAD_REQUEST,
      );
    }

    return normalized;
  }

  private normalizeDescription(description?: string | null): string | null {
    if (description === undefined || description === null) {
      return null;
    }

    const normalized = description.trim();
    return normalized ? normalized : null;
  }

  private serializeAlbum(album: Album): AlbumSummary {
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
