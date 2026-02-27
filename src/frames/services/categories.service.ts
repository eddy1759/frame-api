import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Category } from '../entities/category.entity';
import { CreateCategoryDto } from '../dto/create-category.dto';
import { UpdateCategoryDto } from '../dto/update-category.dto';
import { SlugService } from '../../common/services';
import { FramesCacheService } from './frames-cache.service';

@Injectable()
export class CategoriesService {
  constructor(
    @InjectRepository(Category)
    private readonly categoryRepository: Repository<Category>,
    private readonly slugService: SlugService,
    private readonly framesCacheService: FramesCacheService,
  ) {}

  async create(dto: CreateCategoryDto): Promise<Category> {
    if (dto.parentId) {
      await this.assertCategoryExists(dto.parentId);
    }

    const slug = await this.slugService.generateUniqueSlug(dto.name, (value) =>
      this.categoryRepository.exist({ where: { slug: value } }),
    );

    const entity = this.categoryRepository.create({
      name: dto.name.trim(),
      slug,
      description: dto.description ?? null,
      iconUrl: dto.iconUrl ?? null,
      sortOrder: dto.sortOrder ?? 0,
      isActive: dto.isActive ?? true,
      parentId: dto.parentId ?? null,
    });

    try {
      const created = await this.categoryRepository.save(entity);
      await this.framesCacheService.invalidateCategories(created.slug);
      return created;
    } catch {
      throw new ConflictException({
        code: 'DUPLICATE_CATEGORY_SLUG',
        message: 'Category slug already exists.',
      });
    }
  }

  async update(id: string, dto: UpdateCategoryDto): Promise<Category> {
    const category = await this.categoryRepository.findOne({ where: { id } });

    if (!category) {
      throw new NotFoundException({
        code: 'CATEGORY_NOT_FOUND',
        message: 'Category with the specified ID does not exist.',
      });
    }

    if (dto.parentId && dto.parentId === id) {
      throw new BadRequestException({
        code: 'BAD_REQUEST',
        message: 'Category cannot be its own parent.',
      });
    }

    if (dto.parentId) {
      await this.assertCategoryExists(dto.parentId);
    }

    const previousSlug = category.slug;

    if (dto.name && dto.name.trim() !== category.name) {
      category.name = dto.name.trim();
      category.slug = await this.slugService.generateUniqueSlug(
        dto.name,
        async (value) => {
          const existing = await this.categoryRepository.findOne({
            where: { slug: value },
            select: ['id'],
          });
          return !!existing && existing.id !== id;
        },
      );
    }

    if (dto.description !== undefined) category.description = dto.description;
    if (dto.iconUrl !== undefined) category.iconUrl = dto.iconUrl;
    if (dto.sortOrder !== undefined) category.sortOrder = dto.sortOrder;
    if (dto.isActive !== undefined) category.isActive = dto.isActive;
    if (dto.parentId !== undefined) category.parentId = dto.parentId;

    const updated = await this.categoryRepository.save(category);
    await this.framesCacheService.invalidateCategories(previousSlug);
    if (updated.slug !== previousSlug) {
      await this.framesCacheService.invalidateCategories(updated.slug);
    }
    await this.framesCacheService.invalidateFramesList();
    return updated;
  }

  async remove(id: string): Promise<void> {
    const category = await this.categoryRepository.findOne({ where: { id } });

    if (!category) {
      throw new NotFoundException({
        code: 'CATEGORY_NOT_FOUND',
        message: 'Category with the specified ID does not exist.',
      });
    }

    await this.categoryRepository.update(id, {
      isActive: false,
      frameCount: 0,
    });

    await this.categoryRepository.query(
      `DELETE FROM "frame_categories" WHERE "category_id" = $1`,
      [id],
    );

    await this.framesCacheService.invalidateCategories(category.slug);
    await this.framesCacheService.invalidateFramesList();
  }

  async listActive(includeEmpty = false): Promise<Category[]> {
    const query = this.categoryRepository
      .createQueryBuilder('category')
      .where('category.isActive = :isActive', { isActive: true });

    if (!includeEmpty) {
      query.andWhere('category.frameCount > 0');
    }

    query
      .orderBy('category.sortOrder', 'ASC')
      .addOrderBy('category.name', 'ASC');

    return query.getMany();
  }

  async findByIds(ids: string[]): Promise<Category[]> {
    if (ids.length === 0) {
      return [];
    }

    return this.categoryRepository
      .createQueryBuilder('category')
      .where('category.id IN (:...ids)', { ids })
      .andWhere('category.isActive = true')
      .getMany();
  }

  async findBySlug(slug: string): Promise<Category> {
    const category = await this.categoryRepository.findOne({ where: { slug } });

    if (!category || !category.isActive) {
      throw new NotFoundException({
        code: 'CATEGORY_NOT_FOUND',
        message: 'Category with the specified slug does not exist.',
      });
    }

    return category;
  }

  async recalculateFrameCounts(categoryIds: string[]): Promise<void> {
    if (categoryIds.length === 0) {
      return;
    }

    for (const categoryId of [...new Set(categoryIds)]) {
      const rawRows: unknown = await this.categoryRepository.query(
        `SELECT COUNT(*)::int AS count
         FROM "frame_categories" fc
         JOIN "frames" f ON f."id" = fc."frame_id"
         WHERE fc."category_id" = $1
           AND f."is_active" = true`,
        [categoryId],
      );
      const rows = Array.isArray(rawRows) ? rawRows : [];
      const firstRow = rows[0];
      const countValue =
        typeof firstRow === 'object' && firstRow !== null && 'count' in firstRow
          ? (firstRow as { count?: number | string }).count
          : 0;
      const count = Number(countValue ?? 0);
      await this.categoryRepository.update(categoryId, { frameCount: count });
    }
  }

  private async assertCategoryExists(categoryId: string): Promise<void> {
    const exists = await this.categoryRepository.exist({
      where: { id: categoryId },
    });
    if (!exists) {
      throw new NotFoundException({
        code: 'CATEGORY_NOT_FOUND',
        message: 'Category with the specified ID does not exist.',
      });
    }
  }
}
