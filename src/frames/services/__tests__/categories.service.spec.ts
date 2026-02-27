import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import { Repository } from 'typeorm';
import { Category } from '../../entities/category.entity';
import { CategoriesService } from '../categories.service';
import { SlugService } from '../../../common/services';
import { FramesCacheService } from '../frames-cache.service';

describe('CategoriesService', () => {
  let service: CategoriesService;
  let categoryRepository: jest.Mocked<Repository<Category>>;
  let slugService: jest.Mocked<SlugService>;
  let framesCacheService: jest.Mocked<FramesCacheService>;

  const makeCategory = (overrides: Partial<Category> = {}): Category =>
    ({
      id: 'category-1',
      name: 'Nature',
      slug: 'nature',
      description: null,
      iconUrl: null,
      sortOrder: 0,
      isActive: true,
      parentId: null,
      parent: null,
      children: [],
      frameCount: 0,
      frames: [],
      createdAt: new Date('2026-01-01T00:00:00.000Z'),
      updatedAt: new Date('2026-01-01T00:00:00.000Z'),
      ...overrides,
    }) as Category;

  beforeEach(() => {
    categoryRepository = {
      exist: jest.fn(),
      create: jest.fn((value: unknown) => value as Category),
      save: jest.fn(),
      findOne: jest.fn(),
      update: jest.fn(),
      query: jest.fn(),
      createQueryBuilder: jest.fn(),
    } as unknown as jest.Mocked<Repository<Category>>;

    slugService = {
      toSlug: jest.fn(),
      generateUniqueSlug: jest.fn(),
    } as unknown as jest.Mocked<SlugService>;

    framesCacheService = {
      invalidateCategories: jest.fn(),
      invalidateFramesList: jest.fn(),
    } as unknown as jest.Mocked<FramesCacheService>;

    service = new CategoriesService(
      categoryRepository,
      slugService,
      framesCacheService,
    );
  });

  it('creates category with generated slug and normalized name', async () => {
    slugService.generateUniqueSlug.mockResolvedValueOnce('wedding');
    categoryRepository.save.mockResolvedValueOnce(
      makeCategory({ id: 'category-2', name: 'Wedding', slug: 'wedding' }),
    );

    const result = await service.create({
      name: '  Wedding  ',
      description: 'Events',
      sortOrder: 2,
    });

    expect(slugService.generateUniqueSlug).toHaveBeenCalled();
    expect(categoryRepository.create).toHaveBeenCalledWith(
      expect.objectContaining({
        name: 'Wedding',
        slug: 'wedding',
      }),
    );
    expect(result.slug).toBe('wedding');
    expect(framesCacheService.invalidateCategories).toHaveBeenCalledWith(
      'wedding',
    );
  });

  it('throws when parent category does not exist during create', async () => {
    categoryRepository.exist.mockResolvedValueOnce(false);

    await expect(
      service.create({
        name: 'Child',
        parentId: 'missing-parent',
      }),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('throws conflict when persistence fails on create', async () => {
    slugService.generateUniqueSlug.mockResolvedValueOnce('political');
    categoryRepository.save.mockRejectedValueOnce(new Error('duplicate'));

    await expect(
      service.create({
        name: 'Political',
      }),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('updates category name and regenerates slug', async () => {
    categoryRepository.findOne.mockResolvedValueOnce(
      makeCategory({ id: 'category-1', name: 'Old Name', slug: 'old-name' }),
    );
    slugService.generateUniqueSlug.mockResolvedValueOnce('new-name');
    categoryRepository.save.mockResolvedValueOnce(
      makeCategory({ id: 'category-1', name: 'New Name', slug: 'new-name' }),
    );

    const result = await service.update('category-1', { name: 'New Name' });

    expect(result.slug).toBe('new-name');
    expect(categoryRepository.save).toHaveBeenCalled();
    expect(framesCacheService.invalidateCategories).toHaveBeenCalledWith(
      'old-name',
    );
    expect(framesCacheService.invalidateCategories).toHaveBeenCalledWith(
      'new-name',
    );
    expect(framesCacheService.invalidateFramesList).toHaveBeenCalled();
  });

  it('rejects self parent assignment', async () => {
    categoryRepository.findOne.mockResolvedValueOnce(makeCategory());

    await expect(
      service.update('category-1', { parentId: 'category-1' }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('soft deletes category and detaches frame links', async () => {
    categoryRepository.findOne.mockResolvedValueOnce(makeCategory());

    await service.remove('category-1');

    expect(categoryRepository.update).toHaveBeenCalledWith('category-1', {
      isActive: false,
      frameCount: 0,
    });
    expect(categoryRepository.query).toHaveBeenCalledWith(
      'DELETE FROM "frame_categories" WHERE "category_id" = $1',
      ['category-1'],
    );
    expect(framesCacheService.invalidateCategories).toHaveBeenCalledWith(
      'nature',
    );
    expect(framesCacheService.invalidateFramesList).toHaveBeenCalled();
  });

  it('lists active categories with includeEmpty filter', async () => {
    const qb = {
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      orderBy: jest.fn().mockReturnThis(),
      addOrderBy: jest.fn().mockReturnThis(),
      getMany: jest.fn().mockResolvedValue([makeCategory()]),
    };
    categoryRepository.createQueryBuilder.mockReturnValue(qb as never);

    await service.listActive(false);

    expect(qb.where).toHaveBeenCalledWith('category.isActive = :isActive', {
      isActive: true,
    });
    expect(qb.andWhere).toHaveBeenCalledWith('category.frameCount > 0');
  });

  it('recalculates frame counts once per unique category id', async () => {
    categoryRepository.query.mockResolvedValue([{ count: 4 }]);

    await service.recalculateFrameCounts([
      'category-1',
      'category-1',
      'category-2',
    ]);

    expect(categoryRepository.query).toHaveBeenCalledTimes(2);
    expect(categoryRepository.update).toHaveBeenCalledTimes(2);
  });
});
