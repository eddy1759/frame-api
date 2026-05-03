import { HttpStatus, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Brackets, In, Repository } from 'typeorm';
import { User } from '../../auth/entities/user.entity';
import { UserRole } from '../../auth/enums/user-role.enum';
import { BusinessException } from '../../common/filters/business.exception';
import { StorageService } from '../../common/services';
import {
  PaginatedResult,
  PaginationService,
} from '../../common/services/pagination.service';
import { Frame } from '../../frames/entities/frame.entity';
import { ImageRenderVariant } from '../../images/entities/image-render-variant.entity';
import { ImageVariant } from '../../images/entities/image-variant.entity';
import { VariantType } from '../../images/types/image.types';
import { QueryAlbumImagesDto } from '../dto/query-album-images.dto';
import { QueryAlbumsDto } from '../dto/query-albums.dto';
import { AlbumItem } from '../entities/album-item.entity';
import { AlbumStats } from '../entities/album-stats.entity';
import { Album } from '../entities/album.entity';
import { AlbumsCacheService } from './albums-cache.service';

type AlbumMediaUrls = {
  thumbnailUrl: string | null;
  mediumUrl: string | null;
};

type AlbumMediaDetailUrls = AlbumMediaUrls & {
  largeUrl: string | null;
};

type AlbumItemPageEntry = {
  id: string;
  imageId: string;
  frameId: string;
  userId: string;
  imageRenderRevision: number;
  createdAt: Date;
};

@Injectable()
export class AlbumQueryService {
  constructor(
    @InjectRepository(Album)
    private readonly albumRepository: Repository<Album>,
    @InjectRepository(AlbumItem)
    private readonly albumItemRepository: Repository<AlbumItem>,
    @InjectRepository(AlbumStats)
    private readonly albumStatsRepository: Repository<AlbumStats>,
    @InjectRepository(ImageVariant)
    private readonly imageVariantRepository: Repository<ImageVariant>,
    @InjectRepository(ImageRenderVariant)
    private readonly imageRenderVariantRepository: Repository<ImageRenderVariant>,
    private readonly paginationService: PaginationService,
    private readonly storageService: StorageService,
    private readonly albumsCacheService: AlbumsCacheService,
  ) {}

  async searchAlbums(
    query: QueryAlbumsDto,
    viewer?: User,
  ): Promise<PaginatedResult<Record<string, unknown>>> {
    const ownerScoped = this.isOwnerScopedSearch(query.ownerId, viewer);
    const cacheParams = this.toCacheParams(query, ownerScoped, viewer);
    const cached =
      await this.albumsCacheService.getSearch<
        PaginatedResult<Record<string, unknown>>
      >(cacheParams);

    if (cached) {
      return cached;
    }

    const pagination = this.paginationService.resolve(query);
    const qb = this.albumRepository
      .createQueryBuilder('album')
      .innerJoinAndSelect('album.owner', 'owner')
      .innerJoinAndSelect('album.frame', 'frame');

    if (ownerScoped) {
      qb.where('album.ownerId = :ownerId', { ownerId: query.ownerId });
    } else {
      qb.where('album.isPublic = :isPublic', { isPublic: true }).andWhere(
        `EXISTS (
          SELECT 1
          FROM album_items item
          INNER JOIN images image ON image.id = item.image_id
          WHERE item.album_id = album.id
            AND image.is_deleted = false
        )`,
      );
    }

    if (query.shortCode) {
      qb.andWhere('LOWER(album.shortCode) = LOWER(:shortCode)', {
        shortCode: query.shortCode,
      });
    }

    if (query.frameId) {
      qb.andWhere('album.frameId = :frameId', { frameId: query.frameId });
    }

    if (query.ownerId) {
      qb.andWhere('album.ownerId = :ownerId', { ownerId: query.ownerId });
    }

    if (query.creator) {
      qb.andWhere('owner.displayName ILIKE :creator', {
        creator: `%${query.creator.trim()}%`,
      });
    }

    if (query.search) {
      qb.andWhere(
        new Brackets((searchQb) => {
          searchQb
            .where('album.name ILIKE :search', {
              search: `%${query.search?.trim()}%`,
            })
            .orWhere('album.shortCode ILIKE :search', {
              search: `%${query.search?.trim()}%`,
            });
        }),
      );
    }

    qb.orderBy('album.createdAt', 'DESC')
      .addOrderBy('album.id', 'ASC')
      .skip(pagination.skip)
      .take(pagination.take);

    const [albums, total] = await qb.getManyAndCount();
    const albumIds = albums.map((album) => album.id);

    const renderCounts = await this.getRenderCounts(albumIds);
    const coverItems = await this.getLatestVisibleAlbumItems(albumIds);
    const coverMedia = await this.resolveMediaForItems(coverItems);

    const data = albums.map((album) => {
      const cover = coverItems.find((item) => item.albumId === album.id);
      const coverKey = cover
        ? `${cover.imageId}:${cover.imageRenderRevision}`
        : null;

      return {
        id: album.id,
        shortCode: album.shortCode,
        name: album.name,
        description: album.description,
        isPublic: album.isPublic,
        createdAt: album.createdAt,
        owner: {
          id: album.owner.id,
          displayName: album.owner.displayName,
          avatarUrl: album.owner.avatarUrl,
        },
        frame: this.formatFrameSummary(album.frame),
        renderCount: renderCounts.get(album.id) ?? 0,
        coverThumbnailUrl: coverKey
          ? (coverMedia.get(coverKey)?.thumbnailUrl ?? null)
          : null,
      };
    });

    const result: PaginatedResult<Record<string, unknown>> = {
      data,
      meta: this.paginationService.buildMeta(
        total,
        pagination.page,
        pagination.limit,
      ),
    };

    await this.albumsCacheService.setSearch(cacheParams, result);
    return result;
  }

  async getAlbumDetail(
    shortCode: string,
    viewer?: User,
  ): Promise<Record<string, unknown>> {
    const usePublicCache = !viewer;
    if (usePublicCache) {
      const cached =
        await this.albumsCacheService.getAlbumByShortCode<
          Record<string, unknown>
        >(shortCode);

      if (cached) {
        return cached;
      }
    }

    const album = await this.getAccessibleAlbumByShortCode(shortCode, viewer);
    const stats = await this.getAlbumStats(album.id);
    const previewItems = await this.listAlbumImagesInternal(
      album.id,
      {
        page: 1,
        limit: 6,
      },
      viewer,
    );

    const detail = {
      id: album.id,
      shortCode: album.shortCode,
      name: album.name,
      description: album.description,
      isPublic: album.isPublic,
      sharePath: `/albums/${album.shortCode}`,
      createdAt: album.createdAt,
      updatedAt: album.updatedAt,
      owner: {
        id: album.owner.id,
        displayName: album.owner.displayName,
        avatarUrl: album.owner.avatarUrl,
      },
      frame: this.formatFrameSummary(album.frame),
      stats: {
        viewCount: stats.viewCount,
        shareCount: stats.shareCount,
        renderCount: previewItems.meta.pagination.total,
      },
      previewItems: previewItems.data,
    };

    if (album.isPublic) {
      await this.albumsCacheService.setAlbumById(album.id, detail);
      await this.albumsCacheService.setAlbumByShortCode(
        album.shortCode,
        detail,
      );
    }

    return detail;
  }

  async listAlbumImages(
    albumId: string,
    query: QueryAlbumImagesDto,
    viewer?: User,
  ): Promise<PaginatedResult<Record<string, unknown>>> {
    const album = await this.getAccessibleAlbumById(albumId, viewer);
    const usePublicCache = album.isPublic && !viewer;

    if (usePublicCache) {
      const cached = await this.albumsCacheService.getAlbumItems<
        PaginatedResult<Record<string, unknown>>
      >(albumId, this.toCacheParams(query));

      if (cached) {
        return cached;
      }
    }

    const result = await this.listAlbumImagesInternal(albumId, query, viewer);
    if (usePublicCache) {
      await this.albumsCacheService.setAlbumItems(
        albumId,
        this.toCacheParams(query),
        result,
      );
    }
    return result;
  }

  async getAlbumImageDetail(
    albumId: string,
    imageId: string,
    viewer?: User,
  ): Promise<Record<string, unknown>> {
    await this.getAccessibleAlbumById(albumId, viewer);

    const item = await this.albumItemRepository
      .createQueryBuilder('item')
      .innerJoin('item.image', 'image')
      .where('item.albumId = :albumId', { albumId })
      .andWhere('item.imageId = :imageId', { imageId })
      .andWhere('image.isDeleted = :isDeleted', { isDeleted: false })
      .getOne();

    if (!item) {
      throw new BusinessException(
        'ALBUM_IMAGE_NOT_FOUND',
        'Album image not found.',
        HttpStatus.NOT_FOUND,
      );
    }

    const media = await this.resolveMediaForAlbumImageDetail(item);

    return {
      id: item.id,
      albumId: item.albumId,
      imageId: item.imageId,
      frameId: item.frameId,
      userId: item.userId,
      imageRenderRevision: item.imageRenderRevision,
      thumbnailUrl: media.thumbnailUrl,
      mediumUrl: media.mediumUrl,
      largeUrl: media.largeUrl,
      createdAt: item.createdAt,
      isImageOwner: this.isImageOwner(item.userId, viewer),
    };
  }

  private async listAlbumImagesInternal(
    albumId: string,
    query: QueryAlbumImagesDto,
    viewer?: User,
  ): Promise<PaginatedResult<Record<string, unknown>>> {
    const pagination = this.paginationService.resolve(query);

    const [items, total] = await this.albumItemRepository
      .createQueryBuilder('item')
      .innerJoin('item.image', 'image')
      .where('item.albumId = :albumId', { albumId })
      .andWhere('image.isDeleted = :isDeleted', { isDeleted: false })
      .orderBy('item.createdAt', 'DESC')
      .addOrderBy('item.id', 'ASC')
      .skip(pagination.skip)
      .take(pagination.take)
      .getManyAndCount();

    const itemEntries = items.map((item) => ({
      id: item.id,
      imageId: item.imageId,
      frameId: item.frameId,
      userId: item.userId,
      imageRenderRevision: item.imageRenderRevision,
      createdAt: item.createdAt,
    }));

    const media = await this.resolveMediaForItems(itemEntries);

    return {
      data: itemEntries.map((item) => {
        const urls =
          media.get(`${item.imageId}:${item.imageRenderRevision}`) ??
          this.emptyMedia();

        return {
          id: item.id,
          imageId: item.imageId,
          frameId: item.frameId,
          userId: item.userId,
          imageRenderRevision: item.imageRenderRevision,
          thumbnailUrl: urls.thumbnailUrl,
          mediumUrl: urls.mediumUrl,
          createdAt: item.createdAt,
          isImageOwner: this.isImageOwner(item.userId, viewer),
        };
      }),
      meta: this.paginationService.buildMeta(
        total,
        pagination.page,
        pagination.limit,
      ),
    };
  }

  private async getAccessibleAlbumByShortCode(
    shortCode: string,
    viewer?: User,
  ): Promise<Album> {
    const album = await this.albumRepository
      .createQueryBuilder('album')
      .innerJoinAndSelect('album.owner', 'owner')
      .innerJoinAndSelect('album.frame', 'frame')
      .where('LOWER(album.shortCode) = LOWER(:shortCode)', { shortCode })
      .getOne();

    return this.assertAlbumVisible(album, viewer);
  }

  private async getAccessibleAlbumById(
    albumId: string,
    viewer?: User,
  ): Promise<Album> {
    const album = await this.albumRepository
      .createQueryBuilder('album')
      .innerJoinAndSelect('album.owner', 'owner')
      .innerJoinAndSelect('album.frame', 'frame')
      .where('album.id = :albumId', { albumId })
      .getOne();

    return this.assertAlbumVisible(album, viewer);
  }

  private assertAlbumVisible(album: Album | null, viewer?: User): Album {
    if (!album) {
      throw new BusinessException(
        'ALBUM_NOT_FOUND',
        'Album not found.',
        HttpStatus.NOT_FOUND,
      );
    }

    if (
      album.isPublic ||
      (viewer &&
        (viewer.role === UserRole.ADMIN || viewer.id === album.ownerId))
    ) {
      return album;
    }

    throw new BusinessException(
      'ALBUM_NOT_FOUND',
      'Album not found.',
      HttpStatus.NOT_FOUND,
    );
  }

  private isOwnerScopedSearch(ownerId?: string, viewer?: User): boolean {
    return Boolean(
      ownerId &&
      viewer &&
      (viewer.id === ownerId || viewer.role === UserRole.ADMIN),
    );
  }

  private toCacheParams(
    query: QueryAlbumsDto | QueryAlbumImagesDto,
    ownerScoped = false,
    viewer?: User,
  ): Record<string, unknown> {
    return {
      ...query,
      ownerScoped,
      viewerId: ownerScoped ? (viewer?.id ?? null) : null,
    };
  }

  private async getAlbumStats(
    albumId: string,
  ): Promise<Pick<AlbumStats, 'viewCount' | 'shareCount'>> {
    const cached =
      await this.albumsCacheService.getAlbumStats<
        Pick<AlbumStats, 'viewCount' | 'shareCount'>
      >(albumId);

    if (cached) {
      return cached;
    }

    const stats = await this.albumStatsRepository.findOne({
      where: { albumId },
      select: ['albumId', 'viewCount', 'shareCount'],
    });

    const value = {
      viewCount: stats?.viewCount ?? 0,
      shareCount: stats?.shareCount ?? 0,
    };

    await this.albumsCacheService.setAlbumStats(albumId, value);
    return value;
  }

  private async getRenderCounts(
    albumIds: string[],
  ): Promise<Map<string, number>> {
    if (albumIds.length === 0) {
      return new Map();
    }

    const rows = await this.albumItemRepository
      .createQueryBuilder('item')
      .innerJoin('item.image', 'image')
      .select('item.albumId', 'albumId')
      .addSelect('COUNT(*)', 'renderCount')
      .where('item.albumId IN (:...albumIds)', { albumIds })
      .andWhere('image.isDeleted = :isDeleted', { isDeleted: false })
      .groupBy('item.albumId')
      .getRawMany<{ albumId: string; renderCount: string }>();

    return new Map(
      rows.map((row) => [row.albumId, parseInt(row.renderCount, 10)]),
    );
  }

  private async getLatestVisibleAlbumItems(
    albumIds: string[],
  ): Promise<
    Array<{ albumId: string; imageId: string; imageRenderRevision: number }>
  > {
    if (albumIds.length === 0) {
      return [];
    }

    return this.albumItemRepository
      .createQueryBuilder('item')
      .innerJoin('item.image', 'image')
      .select('item.albumId', 'albumId')
      .addSelect('item.imageId', 'imageId')
      .addSelect('item.imageRenderRevision', 'imageRenderRevision')
      .where('item.albumId IN (:...albumIds)', { albumIds })
      .andWhere('image.isDeleted = :isDeleted', { isDeleted: false })
      .distinctOn(['item.albumId'])
      .orderBy('item.albumId', 'ASC')
      .addOrderBy('item.createdAt', 'DESC')
      .addOrderBy('item.id', 'ASC')
      .getRawMany();
  }

  private async resolveMediaForItems(
    items: Array<
      Pick<AlbumItemPageEntry, 'imageId' | 'imageRenderRevision'> & {
        albumId?: string;
      }
    >,
  ): Promise<Map<string, AlbumMediaUrls>> {
    if (items.length === 0) {
      return new Map();
    }

    const imageIds = Array.from(new Set(items.map((item) => item.imageId)));
    const renderRevisions = Array.from(
      new Set(items.map((item) => item.imageRenderRevision)),
    );
    const variantTypes = [VariantType.THUMBNAIL, VariantType.MEDIUM];

    const renderVariants = await this.imageRenderVariantRepository.find({
      where: {
        imageId: In(imageIds),
        renderRevision: In(renderRevisions),
        variantType: In(variantTypes),
      },
    });

    const baseVariants = await this.imageVariantRepository.find({
      where: {
        imageId: In(imageIds),
        variantType: In(variantTypes),
      },
    });

    const renderMap = new Map<string, ImageRenderVariant>();
    const baseMap = new Map<string, ImageVariant>();

    for (const variant of renderVariants) {
      renderMap.set(
        `${variant.imageId}:${variant.renderRevision}:${variant.variantType}`,
        variant,
      );
    }

    for (const variant of baseVariants) {
      baseMap.set(`${variant.imageId}:${variant.variantType}`, variant);
    }

    const mediaEntries = await Promise.all(
      items.map(async (item) => {
        const thumbnailVariant =
          renderMap.get(
            `${item.imageId}:${item.imageRenderRevision}:${VariantType.THUMBNAIL}`,
          ) ?? baseMap.get(`${item.imageId}:${VariantType.THUMBNAIL}`);
        const mediumVariant =
          renderMap.get(
            `${item.imageId}:${item.imageRenderRevision}:${VariantType.MEDIUM}`,
          ) ?? baseMap.get(`${item.imageId}:${VariantType.MEDIUM}`);

        const thumbnailUrl = thumbnailVariant
          ? await this.storageService.generatePresignedGetUrl(
              thumbnailVariant.storageKey,
            )
          : null;
        const mediumUrl = mediumVariant
          ? await this.storageService.generatePresignedGetUrl(
              mediumVariant.storageKey,
            )
          : thumbnailUrl;

        return [
          `${item.imageId}:${item.imageRenderRevision}`,
          {
            thumbnailUrl,
            mediumUrl,
          },
        ] as const;
      }),
    );

    return new Map(mediaEntries);
  }

  private async resolveMediaForAlbumImageDetail(
    item: Pick<AlbumItemPageEntry, 'imageId' | 'imageRenderRevision'>,
  ): Promise<AlbumMediaDetailUrls> {
    const variantTypes = [
      VariantType.THUMBNAIL,
      VariantType.MEDIUM,
      VariantType.LARGE,
    ];

    const renderVariants = await this.imageRenderVariantRepository.find({
      where: {
        imageId: item.imageId,
        renderRevision: item.imageRenderRevision,
        variantType: In(variantTypes),
      },
    });

    const baseVariants = await this.imageVariantRepository.find({
      where: {
        imageId: item.imageId,
        variantType: In(variantTypes),
      },
    });

    const renderMap = new Map<VariantType, ImageRenderVariant>();
    const baseMap = new Map<VariantType, ImageVariant>();

    for (const variant of renderVariants) {
      renderMap.set(variant.variantType, variant);
    }

    for (const variant of baseVariants) {
      baseMap.set(variant.variantType, variant);
    }

    const thumbnailVariant =
      renderMap.get(VariantType.THUMBNAIL) ??
      baseMap.get(VariantType.THUMBNAIL) ??
      null;
    const mediumVariant =
      renderMap.get(VariantType.MEDIUM) ??
      baseMap.get(VariantType.MEDIUM) ??
      thumbnailVariant;
    const largeVariant =
      renderMap.get(VariantType.LARGE) ??
      baseMap.get(VariantType.LARGE) ??
      mediumVariant;

    const thumbnailUrl = thumbnailVariant
      ? await this.storageService.generatePresignedGetUrl(
          thumbnailVariant.storageKey,
        )
      : null;
    const mediumUrl = mediumVariant
      ? await this.storageService.generatePresignedGetUrl(
          mediumVariant.storageKey,
        )
      : thumbnailUrl;
    const largeUrl = largeVariant
      ? await this.storageService.generatePresignedGetUrl(
          largeVariant.storageKey,
        )
      : mediumUrl;

    return {
      thumbnailUrl,
      mediumUrl,
      largeUrl,
    };
  }

  private formatFrameSummary(frame: Frame): Record<string, unknown> {
    return {
      id: frame.id,
      name: frame.name,
      slug: frame.slug,
      isPremium: frame.isPremium,
      thumbnailUrl: frame.thumbnailUrl,
      editorPreviewUrl: frame.editorPreviewUrl,
    };
  }

  private emptyMedia(): AlbumMediaUrls {
    return {
      thumbnailUrl: null,
      mediumUrl: null,
    };
  }

  private isImageOwner(imageUserId: string, viewer?: User): boolean {
    return Boolean(viewer && viewer.id === imageUserId);
  }
}
