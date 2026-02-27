import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Tag } from '../entities/tag.entity';
import { CreateTagDto } from '../dto/create-tag.dto';
import { UpdateTagDto } from '../dto/update-tag.dto';
import { SlugService } from '../../common/services';
import { FramesCacheService } from './frames-cache.service';

@Injectable()
export class TagsService {
  constructor(
    @InjectRepository(Tag)
    private readonly tagRepository: Repository<Tag>,
    private readonly slugService: SlugService,
    private readonly framesCacheService: FramesCacheService,
  ) {}

  async create(dto: CreateTagDto): Promise<Tag> {
    const normalized = this.normalizeTagName(dto.name);

    const existing = await this.tagRepository.findOne({
      where: [{ name: normalized }, { slug: this.slugService.toSlug(normalized) }],
    });

    if (existing) {
      throw new ConflictException({
        code: 'DUPLICATE_TAG',
        message: 'Tag name already exists.',
      });
    }

    const slug = await this.slugService.generateUniqueSlug(normalized, (value) =>
      this.tagRepository.exist({ where: { slug: value } }),
    );

    const entity = this.tagRepository.create({
      name: normalized,
      slug,
    });

    const created = await this.tagRepository.save(entity);
    await this.framesCacheService.invalidateTags();
    return created;
  }

  async update(id: string, dto: UpdateTagDto): Promise<Tag> {
    const tag = await this.tagRepository.findOne({ where: { id } });

    if (!tag) {
      throw new NotFoundException({
        code: 'TAG_NOT_FOUND',
        message: 'Tag with the specified ID does not exist.',
      });
    }

    if (dto.name !== undefined) {
      const normalized = this.normalizeTagName(dto.name);
      const existing = await this.tagRepository.findOne({
        where: { name: normalized },
      });

      if (existing && existing.id !== id) {
        throw new ConflictException({
          code: 'DUPLICATE_TAG',
          message: 'Tag name already exists.',
        });
      }

      tag.name = normalized;
      tag.slug = await this.slugService.generateUniqueSlug(normalized, async (value) => {
        const duplicate = await this.tagRepository.findOne({
          where: { slug: value },
          select: ['id'],
        });
        return !!duplicate && duplicate.id !== id;
      });
    }

    const updated = await this.tagRepository.save(tag);
    await this.framesCacheService.invalidateTags();
    await this.framesCacheService.invalidateFramesList();
    return updated;
  }

  async remove(id: string): Promise<void> {
    const tag = await this.tagRepository.findOne({ where: { id } });

    if (!tag) {
      throw new NotFoundException({
        code: 'TAG_NOT_FOUND',
        message: 'Tag with the specified ID does not exist.',
      });
    }

    await this.tagRepository.query(`DELETE FROM "frame_tags" WHERE "tag_id" = $1`, [id]);
    await this.tagRepository.delete(id);
    await this.framesCacheService.invalidateTags();
    await this.framesCacheService.invalidateFramesList();
  }

  async list(limit = 50, search?: string): Promise<Tag[]> {
    const query = this.tagRepository
      .createQueryBuilder('tag')
      .orderBy('tag.usageCount', 'DESC')
      .addOrderBy('tag.name', 'ASC')
      .take(limit);

    if (search) {
      query.where('tag.name ILIKE :search', { search: `%${search}%` });
    }

    return query.getMany();
  }

  async findOrCreateByNames(names: string[]): Promise<Tag[]> {
    const normalizedNames = [...new Set(names.map((name) => this.normalizeTagName(name)).filter(Boolean))];
    const tags: Tag[] = [];

    for (const name of normalizedNames) {
      let tag = await this.tagRepository.findOne({ where: { name } });
      if (!tag) {
        const slug = await this.slugService.generateUniqueSlug(name, (value) =>
          this.tagRepository.exist({ where: { slug: value } }),
        );

        tag = await this.tagRepository.save(
          this.tagRepository.create({ name, slug }),
        );
        await this.framesCacheService.invalidateTags();
      }
      tags.push(tag);
    }

    return tags;
  }

  async recalculateUsageCounts(tagIds: string[]): Promise<void> {
    if (tagIds.length === 0) {
      return;
    }

    for (const tagId of [...new Set(tagIds)]) {
      const rows = (await this.tagRepository.query(
        `SELECT COUNT(*)::int AS count
         FROM "frame_tags" ft
         JOIN "frames" f ON f."id" = ft."frame_id"
         WHERE ft."tag_id" = $1
           AND f."is_active" = true`,
        [tagId],
      )) as unknown[];

      const firstRow =
        rows.length > 0
          ? (rows[0] as {
              count?: number | string;
            })
          : undefined;
      const count = Number(firstRow?.count ?? 0);
      await this.tagRepository.update(tagId, { usageCount: count });
    }
  }

  private normalizeTagName(value: string): string {
    return value.trim().toLowerCase();
  }
}
