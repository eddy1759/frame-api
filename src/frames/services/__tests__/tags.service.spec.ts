import { ConflictException, NotFoundException } from '@nestjs/common';
import { Repository } from 'typeorm';
import { Tag } from '../../entities/tag.entity';
import { TagsService } from '../tags.service';
import { SlugService } from '../../../common/services';
import { FramesCacheService } from '../frames-cache.service';

describe('TagsService', () => {
  let service: TagsService;
  let tagRepository: jest.Mocked<Repository<Tag>>;
  let slugService: jest.Mocked<SlugService>;
  let framesCacheService: jest.Mocked<FramesCacheService>;

  const makeTag = (overrides: Partial<Tag> = {}): Tag =>
    ({
      id: 'tag-1',
      name: 'nature',
      slug: 'nature',
      usageCount: 0,
      frames: [],
      createdAt: new Date('2026-01-01T00:00:00.000Z'),
      updatedAt: new Date('2026-01-01T00:00:00.000Z'),
      ...overrides,
    }) as Tag;

  beforeEach(() => {
    tagRepository = {
      findOne: jest.fn(),
      exist: jest.fn(),
      create: jest.fn((value: unknown) => value as Tag),
      save: jest.fn(),
      delete: jest.fn(),
      query: jest.fn(),
      update: jest.fn(),
      createQueryBuilder: jest.fn(),
    } as unknown as jest.Mocked<Repository<Tag>>;

    slugService = {
      toSlug: jest.fn((value: string) => value),
      generateUniqueSlug: jest.fn(),
    } as unknown as jest.Mocked<SlugService>;

    framesCacheService = {
      invalidateTags: jest.fn(),
      invalidateFramesList: jest.fn(),
    } as unknown as jest.Mocked<FramesCacheService>;

    service = new TagsService(tagRepository, slugService, framesCacheService);
  });

  it('creates tag using normalized lowercase name', async () => {
    tagRepository.findOne.mockResolvedValueOnce(null);
    slugService.generateUniqueSlug.mockResolvedValueOnce('sports');
    tagRepository.save.mockResolvedValueOnce(
      makeTag({ id: 'tag-2', name: 'sports', slug: 'sports' }),
    );

    const result = await service.create({ name: ' Sports ' });

    expect(tagRepository.create).toHaveBeenCalledWith(
      expect.objectContaining({
        name: 'sports',
        slug: 'sports',
      }),
    );
    expect(result.slug).toBe('sports');
    expect(framesCacheService.invalidateTags).toHaveBeenCalled();
  });

  it('rejects duplicate tags on create', async () => {
    tagRepository.findOne.mockResolvedValueOnce(makeTag());

    await expect(service.create({ name: 'NATURE' })).rejects.toBeInstanceOf(
      ConflictException,
    );
  });

  it('updates existing tag and regenerates slug', async () => {
    tagRepository.findOne
      .mockResolvedValueOnce(
        makeTag({ id: 'tag-1', name: 'nature', slug: 'nature' }),
      )
      .mockResolvedValueOnce(null);
    slugService.generateUniqueSlug.mockResolvedValueOnce('mountains');
    tagRepository.save.mockResolvedValueOnce(
      makeTag({ id: 'tag-1', name: 'mountains', slug: 'mountains' }),
    );

    const result = await service.update('tag-1', { name: 'Mountains' });

    expect(result.name).toBe('mountains');
    expect(result.slug).toBe('mountains');
    expect(framesCacheService.invalidateTags).toHaveBeenCalled();
    expect(framesCacheService.invalidateFramesList).toHaveBeenCalled();
  });

  it('rejects duplicate names on update', async () => {
    tagRepository.findOne
      .mockResolvedValueOnce(makeTag({ id: 'tag-1', name: 'nature' }))
      .mockResolvedValueOnce(makeTag({ id: 'tag-2', name: 'forest' }));

    await expect(
      service.update('tag-1', { name: 'forest' }),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('throws not found when deleting unknown tag', async () => {
    tagRepository.findOne.mockResolvedValueOnce(null);
    await expect(service.remove('missing')).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it('deletes tag and detaches frame associations', async () => {
    tagRepository.findOne.mockResolvedValueOnce(makeTag({ id: 'tag-1' }));

    await service.remove('tag-1');

    expect(tagRepository.query).toHaveBeenCalledWith(
      'DELETE FROM "frame_tags" WHERE "tag_id" = $1',
      ['tag-1'],
    );
    expect(tagRepository.delete).toHaveBeenCalledWith('tag-1');
    expect(framesCacheService.invalidateTags).toHaveBeenCalled();
    expect(framesCacheService.invalidateFramesList).toHaveBeenCalled();
  });

  it('finds or creates tags with deduped normalized names', async () => {
    tagRepository.findOne
      .mockResolvedValueOnce(makeTag({ id: 'tag-nature', name: 'nature' }))
      .mockResolvedValueOnce(null);
    slugService.generateUniqueSlug.mockResolvedValueOnce('sunrise');
    tagRepository.save.mockResolvedValueOnce(
      makeTag({ id: 'tag-sunrise', name: 'sunrise', slug: 'sunrise' }),
    );

    const result = await service.findOrCreateByNames([
      ' Nature ',
      'nature',
      'Sunrise',
    ]);

    expect(result).toHaveLength(2);
    expect(result.map((item) => item.name).sort()).toEqual([
      'nature',
      'sunrise',
    ]);
    expect(tagRepository.save).toHaveBeenCalledTimes(1);
  });

  it('recalculates usage counts once per unique tag id', async () => {
    tagRepository.query.mockResolvedValue([{ count: 3 }]);

    await service.recalculateUsageCounts(['tag-1', 'tag-1', 'tag-2']);

    expect(tagRepository.query).toHaveBeenCalledTimes(2);
    expect(tagRepository.update).toHaveBeenCalledTimes(2);
  });
});
