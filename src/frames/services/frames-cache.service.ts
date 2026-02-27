import { Injectable } from '@nestjs/common';
import { createHash } from 'crypto';
import { CacheService } from '../../common/services';

@Injectable()
export class FramesCacheService {
  private readonly ttl = {
    frame: 60 * 60,
    frameList: 5 * 60,
    popular: 15 * 60,
    categories: 60 * 60,
    category: 60 * 60,
    tags: 60 * 60,
  };

  constructor(private readonly cacheService: CacheService) {}

  getFrameKey(id: string): string {
    return `frame:${id}`;
  }

  getFrameSlugKey(slug: string): string {
    return `frame:slug:${slug}`;
  }

  getCategorySlugKey(slug: string): string {
    return `category:slug:${slug}`;
  }

  getFramesListKey(query: Record<string, unknown>): string {
    const canonical = this.canonicalizeQuery(query);
    const hash = createHash('sha256').update(canonical).digest('hex');
    return `frames:list:${hash}`;
  }

  async getFrame<T>(id: string): Promise<T | null> {
    return this.cacheService.get<T>(this.getFrameKey(id));
  }

  async setFrame<T>(id: string, value: T): Promise<void> {
    await this.cacheService.set(this.getFrameKey(id), value, this.ttl.frame);
  }

  async getFrameBySlug<T>(slug: string): Promise<T | null> {
    return this.cacheService.get<T>(this.getFrameSlugKey(slug));
  }

  async setFrameBySlug<T>(slug: string, value: T): Promise<void> {
    await this.cacheService.set(
      this.getFrameSlugKey(slug),
      value,
      this.ttl.frame,
    );
  }

  async getList<T>(query: Record<string, unknown>): Promise<T | null> {
    return this.cacheService.get<T>(this.getFramesListKey(query));
  }

  async setList<T>(query: Record<string, unknown>, value: T): Promise<void> {
    await this.cacheService.set(
      this.getFramesListKey(query),
      value,
      this.ttl.frameList,
    );
  }

  async getPopular<T>(): Promise<T | null> {
    return this.cacheService.get<T>('frames:popular');
  }

  async setPopular<T>(value: T): Promise<void> {
    await this.cacheService.set('frames:popular', value, this.ttl.popular);
  }

  async getCategories<T>(): Promise<T | null> {
    return this.cacheService.get<T>('categories:all');
  }

  async setCategories<T>(value: T): Promise<void> {
    await this.cacheService.set('categories:all', value, this.ttl.categories);
  }

  async getCategoryBySlug<T>(slug: string): Promise<T | null> {
    return this.cacheService.get<T>(this.getCategorySlugKey(slug));
  }

  async setCategoryBySlug<T>(slug: string, value: T): Promise<void> {
    await this.cacheService.set(
      this.getCategorySlugKey(slug),
      value,
      this.ttl.category,
    );
  }

  async getTags<T>(): Promise<T | null> {
    return this.cacheService.get<T>('tags:all');
  }

  async setTags<T>(value: T): Promise<void> {
    await this.cacheService.set('tags:all', value, this.ttl.tags);
  }

  async invalidateFrame(id: string, slug: string): Promise<void> {
    await this.cacheService.del(this.getFrameKey(id));
    await this.cacheService.del(this.getFrameSlugKey(slug));
    await this.cacheService.invalidateByPattern('frames:list:*');
    await this.cacheService.del('frames:popular');
  }

  async invalidateFramesList(): Promise<void> {
    await this.cacheService.invalidateByPattern('frames:list:*');
  }

  async invalidateCategories(slug?: string): Promise<void> {
    await this.cacheService.del('categories:all');
    if (slug) {
      await this.cacheService.del(this.getCategorySlugKey(slug));
    }
  }

  async invalidateTags(): Promise<void> {
    await this.cacheService.del('tags:all');
  }

  async invalidatePopular(): Promise<void> {
    await this.cacheService.del('frames:popular');
  }

  private canonicalizeQuery(query: Record<string, unknown>): string {
    const keys = Object.keys(query)
      .filter((key) => query[key] !== undefined && query[key] !== null)
      .sort();

    const normalized: Record<string, unknown> = {};
    for (const key of keys) {
      const value = query[key];
      normalized[key] = Array.isArray(value)
        ? [...value].map(String).sort()
        : value;
    }

    return JSON.stringify(normalized);
  }
}
