import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  Inject,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository, SelectQueryBuilder } from 'typeorm';
import { Frame } from '../entities/frame.entity';
import { Category } from '../entities/category.entity';
import { Tag } from '../entities/tag.entity';
import { FrameAsset } from '../entities/frame-asset.entity';
import { FrameAssetType } from '../entities/frame-asset-type.enum';
import { UserSavedFrame } from '../entities/user-saved-frame.entity';
import { CreateFrameDto } from '../dto/create-frame.dto';
import { UpdateFrameDto } from '../dto/update-frame.dto';
import { QueryFramesDto } from '../dto/query-frames.dto';
import {
  CacheService,
  PaginationService,
  SlugService,
  STORAGE_PORT,
  StoragePort,
} from '../../common/services';
import { User } from '../../auth/entities/user.entity';
import { UserRole } from '../../auth/enums/user-role.enum';
import { FramesCacheService } from './frames-cache.service';
import { CategoriesService } from './categories.service';
import { TagsService } from './tags.service';
import {
  FrameMetadata,
  normalizeFrameMetadata,
} from '../utils/frame-metadata.util';

export interface FrameListItem {
  id: string;
  name: string;
  slug: string;
  thumbnailUrl: string | null;
  isPremium: boolean;
  price: string | null;
  currency: string;
  categories: Array<{ id: string; name: string; slug: string }>;
  tags: Array<{ id: string; name: string; slug: string }>;
  applyCount: number;
  isSaved: boolean;
}

export interface FrameDetailItem extends FrameListItem {
  description: string | null;
  width: number;
  height: number;
  aspectRatio: string;
  orientation: string;
  metadata: FrameMetadata;
  svgUrl: string | null;
  editorPreviewUrl: string | null;
  viewCount: number;
  assets: Array<{
    type: string;
    url: string;
    mimeType: string;
    width: number | null;
    height: number | null;
    fileSize: number;
  }>;
}

@Injectable()
export class FramesService {
  constructor(
    @InjectRepository(Frame)
    private readonly frameRepository: Repository<Frame>,
    @InjectRepository(Category)
    private readonly categoryRepository: Repository<Category>,
    @InjectRepository(Tag)
    private readonly tagRepository: Repository<Tag>,
    @InjectRepository(FrameAsset)
    private readonly frameAssetRepository: Repository<FrameAsset>,
    @InjectRepository(UserSavedFrame)
    private readonly userSavedFrameRepository: Repository<UserSavedFrame>,
    private readonly paginationService: PaginationService,
    private readonly slugService: SlugService,
    private readonly cacheService: CacheService,
    private readonly framesCacheService: FramesCacheService,
    private readonly categoriesService: CategoriesService,
    private readonly tagsService: TagsService,
    @Inject(STORAGE_PORT)
    private readonly storageService: StoragePort,
  ) {}

  async createFrame(
    dto: CreateFrameDto,
    createdById: string,
  ): Promise<FrameDetailItem> {
    const categories = await this.resolveCategories(dto.categoryIds);
    const tags = await this.tagsService.findOrCreateByNames(dto.tagNames ?? []);

    const slug = await this.slugService.generateUniqueSlug(
      dto.name,
      (candidate) => this.frameRepository.exist({ where: { slug: candidate } }),
    );

    const frame = this.frameRepository.create({
      name: dto.name.trim(),
      slug,
      description: dto.description ?? null,
      isPremium: dto.isPremium ?? false,
      price:
        dto.price !== undefined && dto.price !== null
          ? dto.price.toFixed(2)
          : null,
      currency: dto.currency ?? 'USD',
      width: dto.width,
      height: dto.height,
      aspectRatio: dto.aspectRatio,
      orientation: dto.orientation,
      metadata: normalizeFrameMetadata(dto.metadata),
      isAiGenerated: dto.isAiGenerated ?? false,
      sortOrder: dto.sortOrder ?? 0,
      createdById,
      categories,
      tags,
    });

    const saved = await this.frameRepository.save(frame);

    await this.categoriesService.recalculateFrameCounts(
      categories.map((x) => x.id),
    );
    await this.tagsService.recalculateUsageCounts(tags.map((x) => x.id));
    await this.framesCacheService.invalidateFramesList();
    await this.framesCacheService.invalidatePopular();
    await this.framesCacheService.invalidateCategories();
    await this.framesCacheService.invalidateTags();

    return this.getFrameById(saved.id);
  }

  async updateFrame(id: string, dto: UpdateFrameDto): Promise<FrameDetailItem> {
    const frame = await this.frameRepository.findOne({
      where: { id },
      relations: ['categories', 'tags'],
    });

    if (!frame) {
      throw new NotFoundException({
        code: 'FRAME_NOT_FOUND',
        message: 'Frame with the specified ID does not exist.',
      });
    }

    const oldCategoryIds = frame.categories.map((item) => item.id);
    const oldTagIds = frame.tags.map((item) => item.id);

    if (dto.name !== undefined && dto.name.trim() !== frame.name) {
      frame.name = dto.name.trim();
      frame.slug = await this.slugService.generateUniqueSlug(
        dto.name,
        async (candidate) => {
          const existing = await this.frameRepository.findOne({
            where: { slug: candidate },
            select: ['id'],
          });
          return !!existing && existing.id !== id;
        },
      );
    }

    if (dto.description !== undefined) frame.description = dto.description;
    if (dto.isPremium !== undefined) frame.isPremium = dto.isPremium;
    if (dto.price !== undefined)
      frame.price = dto.price !== null ? dto.price.toFixed(2) : null;
    if (dto.currency !== undefined) frame.currency = dto.currency;
    if (dto.width !== undefined) frame.width = dto.width;
    if (dto.height !== undefined) frame.height = dto.height;
    if (dto.aspectRatio !== undefined) frame.aspectRatio = dto.aspectRatio;
    if (dto.orientation !== undefined) frame.orientation = dto.orientation;
    if (dto.metadata !== undefined) {
      frame.metadata = normalizeFrameMetadata(dto.metadata);
    }
    if (dto.isAiGenerated !== undefined)
      frame.isAiGenerated = dto.isAiGenerated;
    if (dto.sortOrder !== undefined) frame.sortOrder = dto.sortOrder;

    if (dto.categoryIds !== undefined) {
      frame.categories = await this.resolveCategories(dto.categoryIds);
    }

    if (dto.tagNames !== undefined) {
      frame.tags = await this.tagsService.findOrCreateByNames(dto.tagNames);
    }

    const updated = await this.frameRepository.save(frame);

    const categoryIdsToRecount = [
      ...oldCategoryIds,
      ...updated.categories.map((item) => item.id),
    ];
    const tagIdsToRecount = [
      ...oldTagIds,
      ...updated.tags.map((item) => item.id),
    ];

    await this.categoriesService.recalculateFrameCounts(categoryIdsToRecount);
    await this.tagsService.recalculateUsageCounts(tagIdsToRecount);
    await this.framesCacheService.invalidateFrame(updated.id, updated.slug);
    await this.framesCacheService.invalidateCategories();
    await this.framesCacheService.invalidateTags();

    return this.getFrameById(updated.id);
  }

  async softDeleteFrame(id: string): Promise<void> {
    const frame = await this.frameRepository.findOne({
      where: { id },
      relations: ['categories', 'tags'],
    });

    if (!frame) {
      throw new NotFoundException({
        code: 'FRAME_NOT_FOUND',
        message: 'Frame with the specified ID does not exist.',
      });
    }

    frame.isActive = false;
    await this.frameRepository.save(frame);

    await this.categoriesService.recalculateFrameCounts(
      frame.categories.map((item) => item.id),
    );
    await this.tagsService.recalculateUsageCounts(
      frame.tags.map((item) => item.id),
    );
    await this.framesCacheService.invalidateFrame(frame.id, frame.slug);
    await this.framesCacheService.invalidateCategories();
    await this.framesCacheService.invalidateTags();
  }

  async listFrames(
    query: QueryFramesDto,
    userId?: string,
  ): Promise<{
    items: FrameListItem[];
    pagination: {
      page: number;
      limit: number;
      total: number;
      totalPages: number;
      hasNext: boolean;
      hasPrevious: boolean;
    };
  }> {
    const pagination = this.paginationService.resolve(query);
    const cacheKeyPayload = {
      ...query,
      page: pagination.page,
      limit: pagination.limit,
    };

    const cached = await this.framesCacheService.getList<{
      items: FrameListItem[];
      total: number;
      page: number;
      limit: number;
    }>(cacheKeyPayload);

    let items: FrameListItem[];
    let total: number;

    if (cached) {
      items = cached.items;
      total = cached.total;
    } else {
      const qb = this.frameRepository
        .createQueryBuilder('frame')
        .leftJoinAndSelect('frame.categories', 'category')
        .leftJoinAndSelect('frame.tags', 'tag')
        .where('frame.isActive = :isActive', { isActive: true })
        .distinct(true);

      this.applyListFilters(qb, query);
      this.applyListSort(qb, query);

      const [frames, count] = await qb
        .skip(pagination.skip)
        .take(pagination.take)
        .getManyAndCount();

      items = frames.map((frame) => this.mapFrameListItem(frame, false));
      total = count;

      await this.framesCacheService.setList(cacheKeyPayload, {
        items,
        total,
        page: pagination.page,
        limit: pagination.limit,
      });
    }

    let withSaved: FrameListItem[];
    if (!userId) {
      withSaved = items;
    } else {
      const savedSet = await this.getSavedFrameIdSet(
        userId,
        items.map((item) => item.id),
      );
      withSaved = items.map((item) => ({
        ...item,
        isSaved: savedSet.has(item.id),
      }));
    }

    const meta = this.paginationService.buildMeta(
      total,
      pagination.page,
      pagination.limit,
    );

    return {
      items: withSaved,
      pagination: meta.pagination,
    };
  }

  async getFrameById(id: string, userId?: string): Promise<FrameDetailItem> {
    void this.cacheService.zIncrBy('popular:frames:views', 1, id);

    const cached = await this.framesCacheService.getFrame<FrameDetailItem>(id);

    if (cached) {
      const isSaved = userId
        ? await this.userSavedFrameRepository.exist({
            where: { userId, frameId: cached.id },
          })
        : false;
      return {
        ...cached,
        isSaved,
      };
    }

    const frame = await this.frameRepository.findOne({
      where: { id, isActive: true },
      relations: ['categories', 'tags', 'assets'],
    });

    if (!frame) {
      throw new NotFoundException({
        code: 'FRAME_NOT_FOUND',
        message: 'Frame with the specified ID does not exist.',
      });
    }

    const base = this.mapFrameDetailItem(frame, false);

    await this.framesCacheService.setFrame(id, base);
    await this.framesCacheService.setFrameBySlug(frame.slug, base);

    const isSaved = userId
      ? await this.userSavedFrameRepository.exist({
          where: { userId, frameId: id },
        })
      : false;

    return {
      ...base,
      isSaved,
    };
  }

  async getFrameBySlug(
    slug: string,
    userId?: string,
  ): Promise<FrameDetailItem> {
    const cached =
      await this.framesCacheService.getFrameBySlug<FrameDetailItem>(slug);
    if (cached) {
      const isSaved = userId
        ? await this.userSavedFrameRepository.exist({
            where: { userId, frameId: cached.id },
          })
        : false;
      return {
        ...cached,
        isSaved,
      };
    }

    const frame = await this.frameRepository.findOne({
      where: { slug, isActive: true },
      relations: ['categories', 'tags', 'assets'],
    });

    if (!frame) {
      throw new NotFoundException({
        code: 'FRAME_NOT_FOUND',
        message: 'Frame with the specified slug does not exist.',
      });
    }

    const base = this.mapFrameDetailItem(frame, false);

    await this.framesCacheService.setFrame(frame.id, base);
    await this.framesCacheService.setFrameBySlug(slug, base);

    const isSaved = userId
      ? await this.userSavedFrameRepository.exist({
          where: { userId, frameId: frame.id },
        })
      : false;

    return {
      ...base,
      isSaved,
    };
  }

  async getFrameSvgUrl(id: string): Promise<{ url: string }> {
    const [frame, asset] = await Promise.all([
      this.frameRepository.findOne({
        where: { id, isActive: true },
        select: ['id', 'svgUrl'],
      }),
      this.frameAssetRepository.findOne({
        where: { frameId: id, type: FrameAssetType.SVG },
      }),
    ]);

    if (!frame || (!asset && !frame.svgUrl)) {
      throw new NotFoundException({
        code: 'FRAME_NOT_FOUND',
        message: 'Frame asset is not available.',
      });
    }

    return {
      url: asset
        ? await this.storageService.generatePresignedGetUrl(asset.storageKey)
        : frame.svgUrl!,
    };
  }

  async getFrameEditorPreviewUrl(id: string): Promise<{ url: string }> {
    const [frame, asset] = await Promise.all([
      this.frameRepository.findOne({
        where: { id, isActive: true },
        select: ['id', 'editorPreviewUrl'],
      }),
      this.frameAssetRepository.findOne({
        where: { frameId: id, type: FrameAssetType.PREVIEW_PNG },
      }),
    ]);

    if (!frame || (!asset && !frame.editorPreviewUrl)) {
      throw new NotFoundException({
        code: 'FRAME_NOT_FOUND',
        message: 'Frame preview asset is not available.',
      });
    }

    return {
      url: asset
        ? await this.storageService.generatePresignedGetUrl(asset.storageKey)
        : frame.editorPreviewUrl!,
    };
  }

  async getPopular(
    limit = 20,
    userId?: string,
  ): Promise<{ items: FrameListItem[] }> {
    const effectiveLimit = Math.min(Math.max(1, limit), 50);

    const cached = await this.framesCacheService.getPopular<{
      items: FrameListItem[];
    }>();

    if (cached && cached.items.length >= effectiveLimit) {
      const items = cached.items.slice(0, effectiveLimit);
      const savedSet = await this.getSavedFrameIdSet(
        userId,
        items.map((item) => item.id),
      );

      return {
        items: items.map((item) => ({
          ...item,
          isSaved: savedSet.has(item.id),
        })),
      };
    }

    const scored = await this.cacheService.zRevRangeWithScores(
      'popular:frames:applies',
      0,
      effectiveLimit - 1,
    );

    let frames: Frame[];

    if (scored.length > 0) {
      const ids = scored.map((item) => item.member);
      const byId = await this.frameRepository.find({
        where: { id: In(ids), isActive: true },
        relations: ['categories', 'tags'],
      });
      const map = new Map(byId.map((frame) => [frame.id, frame]));
      frames = ids
        .map((id) => map.get(id))
        .filter((value): value is Frame => !!value);
    } else {
      frames = await this.frameRepository.find({
        where: { isActive: true },
        relations: ['categories', 'tags'],
        order: { applyCount: 'DESC', createdAt: 'DESC' },
        take: effectiveLimit,
      });
    }

    const baseItems = frames.map((frame) =>
      this.mapFrameListItem(frame, false),
    );

    await this.framesCacheService.setPopular({ items: baseItems });

    const savedSet = await this.getSavedFrameIdSet(
      userId,
      baseItems.map((item) => item.id),
    );

    return {
      items: baseItems.map((item) => ({
        ...item,
        isSaved: savedSet.has(item.id),
      })),
    };
  }

  async recordApply(frameId: string): Promise<void> {
    const exists = await this.frameRepository.exist({
      where: { id: frameId, isActive: true },
    });

    if (!exists) {
      throw new NotFoundException({
        code: 'FRAME_NOT_FOUND',
        message: 'Frame with the specified ID does not exist.',
      });
    }

    await this.cacheService.zIncrBy('popular:frames:applies', 1, frameId);
  }

  async saveFrame(frameId: string, userId: string): Promise<void> {
    const exists = await this.frameRepository.exist({
      where: { id: frameId, isActive: true },
    });

    if (!exists) {
      throw new NotFoundException({
        code: 'FRAME_NOT_FOUND',
        message: 'Frame with the specified ID does not exist.',
      });
    }

    await this.userSavedFrameRepository.query(
      `INSERT INTO "user_saved_frames" ("user_id", "frame_id")
       VALUES ($1, $2)
       ON CONFLICT ("user_id", "frame_id") DO NOTHING`,
      [userId, frameId],
    );
  }

  async unsaveFrame(frameId: string, userId: string): Promise<void> {
    await this.userSavedFrameRepository.delete({ userId, frameId });
  }

  async getSavedFrames(
    userId: string,
    page = 1,
    limit = 20,
  ): Promise<{
    items: Array<FrameListItem & { savedAt: Date }>;
    pagination: {
      page: number;
      limit: number;
      total: number;
      totalPages: number;
      hasNext: boolean;
      hasPrevious: boolean;
    };
  }> {
    const pagination = this.paginationService.resolve({ page, limit });

    const qb = this.userSavedFrameRepository
      .createQueryBuilder('saved')
      .innerJoinAndSelect('saved.frame', 'frame', 'frame.isActive = true')
      .leftJoinAndSelect('frame.categories', 'category')
      .leftJoinAndSelect('frame.tags', 'tag')
      .where('saved.userId = :userId', { userId })
      .orderBy('saved.savedAt', 'DESC')
      .skip(pagination.skip)
      .take(pagination.take);

    const [savedRows, total] = await qb.getManyAndCount();

    const items = savedRows.map((row) => ({
      ...this.mapFrameListItem(row.frame, true),
      savedAt: row.savedAt,
      isSaved: true,
    }));

    const meta = this.paginationService.buildMeta(
      total,
      pagination.page,
      pagination.limit,
    );

    return {
      items,
      pagination: meta.pagination,
    };
  }

  async listCategories(includeEmpty = false): Promise<Category[]> {
    const cached = await this.framesCacheService.getCategories<Category[]>();

    let categories = cached;
    if (!categories) {
      categories = await this.categoriesService.listActive(true);
      await this.framesCacheService.setCategories(categories);
    }

    if (includeEmpty) {
      return categories;
    }

    return categories.filter((category) => category.frameCount > 0);
  }

  async getCategoryBySlug(slug: string): Promise<Category> {
    const cached =
      await this.framesCacheService.getCategoryBySlug<Category>(slug);
    if (cached) {
      return cached;
    }

    const category = await this.categoriesService.findBySlug(slug);
    await this.framesCacheService.setCategoryBySlug(slug, category);
    return category;
  }

  async listTags(limit = 50, search?: string): Promise<Tag[]> {
    if (!search && limit === 50) {
      const cached = await this.framesCacheService.getTags<Tag[]>();
      if (cached) {
        return cached;
      }

      const tags = await this.tagsService.list(limit);
      await this.framesCacheService.setTags(tags);
      return tags;
    }

    return this.tagsService.list(limit, search);
  }

  async warmCaches(): Promise<void> {
    const categories = await this.categoriesService.listActive(true);
    await this.framesCacheService.setCategories(categories);

    const popular = await this.getPopular(50);
    await this.framesCacheService.setPopular(popular);

    for (const category of categories) {
      await this.listFrames({
        page: 1,
        limit: 20,
        category: category.slug,
        sortBy: 'applyCount',
        sortOrder: 'DESC',
      });
    }
  }

  async assertFrameEligibleForImage(
    frameId: string,
    user?: Pick<User, 'role' | 'subscriptionActive'>,
  ): Promise<{ id: string; isPremium: boolean }> {
    const frame = await this.frameRepository.findOne({
      where: { id: frameId, isActive: true },
      select: ['id', 'isPremium'],
    });

    if (!frame) {
      throw new NotFoundException({
        code: 'FRAME_NOT_FOUND',
        message: 'Frame with the specified ID does not exist.',
      });
    }

    const isAdmin = user?.role === UserRole.ADMIN;

    if (frame.isPremium && !isAdmin && !user?.subscriptionActive) {
      throw new ForbiddenException({
        code: 'PREMIUM_SUBSCRIPTION_REQUIRED',
        message: 'This frame requires an active premium subscription.',
      });
    }

    return {
      id: frame.id,
      isPremium: frame.isPremium,
    };
  }

  private applyListFilters(
    qb: SelectQueryBuilder<Frame>,
    query: QueryFramesDto,
  ): void {
    if (query.category) {
      qb.andWhere(
        `EXISTS (
          SELECT 1
          FROM "frame_categories" fc
          JOIN "categories" c ON c."id" = fc."category_id"
          WHERE fc."frame_id" = frame."id"
            AND c."slug" = :categorySlug
            AND c."is_active" = true
        )`,
        { categorySlug: query.category },
      );
    }

    if (query.tag) {
      qb.andWhere(
        `EXISTS (
          SELECT 1
          FROM "frame_tags" ft
          JOIN "tags" t ON t."id" = ft."tag_id"
          WHERE ft."frame_id" = frame."id"
            AND t."slug" = :tagSlug
        )`,
        { tagSlug: query.tag },
      );
    }

    if (query.isPremium !== undefined) {
      qb.andWhere('frame.isPremium = :isPremium', {
        isPremium: query.isPremium,
      });
    }

    if (query.orientation) {
      qb.andWhere('frame.orientation = :orientation', {
        orientation: query.orientation,
      });
    }

    if (query.aspectRatio) {
      qb.andWhere('frame.aspectRatio = :aspectRatio', {
        aspectRatio: query.aspectRatio,
      });
    }

    if (query.search) {
      qb.andWhere(
        `to_tsvector('english', COALESCE(frame.name, '') || ' ' || COALESCE(frame.description, '')) @@ plainto_tsquery('english', :search)`,
        { search: query.search },
      );
    }
  }

  private applyListSort(
    qb: SelectQueryBuilder<Frame>,
    query: QueryFramesDto,
  ): void {
    const sortBy = query.sortBy ?? 'createdAt';
    const sortOrder = query.sortOrder ?? 'DESC';

    const sortMap: Record<string, string> = {
      createdAt: 'frame.createdAt',
      applyCount: 'frame.applyCount',
      name: 'frame.name',
      sortOrder: 'frame.sortOrder',
    };

    const sortColumn = sortMap[sortBy] ?? 'frame.createdAt';

    qb.orderBy(sortColumn, sortOrder)
      .addOrderBy('frame.createdAt', 'DESC')
      .addOrderBy('frame.id', 'ASC');
  }

  private async resolveCategories(categoryIds?: string[]): Promise<Category[]> {
    if (!categoryIds || categoryIds.length === 0) {
      return [];
    }

    const categories = await this.categoriesService.findByIds(categoryIds);

    if (categories.length !== categoryIds.length) {
      throw new BadRequestException({
        code: 'CATEGORY_NOT_FOUND',
        message: 'One or more category IDs are invalid or inactive.',
      });
    }

    return categories;
  }

  private mapFrameListItem(frame: Frame, isSaved: boolean): FrameListItem {
    return {
      id: frame.id,
      name: frame.name,
      slug: frame.slug,
      thumbnailUrl: frame.thumbnailUrl,
      isPremium: frame.isPremium,
      price: frame.price,
      currency: frame.currency,
      categories: (frame.categories ?? []).map((category) => ({
        id: category.id,
        name: category.name,
        slug: category.slug,
      })),
      tags: (frame.tags ?? []).map((tag) => ({
        id: tag.id,
        name: tag.name,
        slug: tag.slug,
      })),
      applyCount: frame.applyCount,
      isSaved,
    };
  }

  private mapFrameDetailItem(frame: Frame, isSaved: boolean): FrameDetailItem {
    return {
      ...this.mapFrameListItem(frame, isSaved),
      description: frame.description,
      width: frame.width,
      height: frame.height,
      aspectRatio: frame.aspectRatio,
      orientation: frame.orientation,
      metadata: frame.metadata,
      svgUrl: frame.isPremium ? null : frame.svgUrl,
      editorPreviewUrl: frame.isPremium ? null : frame.editorPreviewUrl,
      viewCount: frame.viewCount,
      assets: (frame.assets ?? [])
        .filter((asset) => this.shouldExposePublicAsset(frame, asset))
        .map((asset) => ({
          type: asset.type,
          url: this.resolveAssetUrl(frame, asset),
          mimeType: asset.mimeType,
          width: asset.width,
          height: asset.height,
          fileSize: asset.fileSize,
        })),
    };
  }

  private resolveAssetUrl(frame: Frame, asset: FrameAsset): string {
    if (asset.type === FrameAssetType.PREVIEW_PNG && frame.editorPreviewUrl) {
      return frame.editorPreviewUrl;
    }

    if (asset.type === FrameAssetType.THUMBNAIL_MD && frame.thumbnailUrl) {
      return frame.thumbnailUrl;
    }

    if (asset.type === FrameAssetType.SVG && frame.svgUrl) {
      return frame.svgUrl;
    }

    const base = frame.svgUrl ? frame.svgUrl.replace('/original.svg', '') : '';
    if (base) {
      return `${base}/${asset.storageKey.split('/').pop() ?? ''}`;
    }

    return asset.storageKey;
  }

  private shouldExposePublicAsset(frame: Frame, asset: FrameAsset): boolean {
    if (!frame.isPremium) {
      return true;
    }

    return ![FrameAssetType.SVG, FrameAssetType.PREVIEW_PNG].includes(
      asset.type,
    );
  }

  private async getSavedFrameIdSet(
    userId: string | undefined,
    frameIds: string[],
  ): Promise<Set<string>> {
    if (!userId || frameIds.length === 0) {
      return new Set<string>();
    }

    const saved = await this.userSavedFrameRepository.find({
      where: {
        userId,
        frameId: In(frameIds),
      },
      select: ['frameId'],
    });

    return new Set(saved.map((item) => item.frameId));
  }
}
