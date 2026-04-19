import { Injectable } from '@nestjs/common';
import { createHash } from 'crypto';
import { CacheService } from '../../common/services';

@Injectable()
export class AlbumsCacheService {
  private readonly ttl = {
    detail: 300,
    stats: 300,
    items: 120,
    search: 60,
  };

  constructor(private readonly cacheService: CacheService) {}

  async getAlbumById<T>(albumId: string): Promise<T | null> {
    return this.cacheService.get<T>(this.getAlbumIdKey(albumId));
  }

  async setAlbumById<T>(albumId: string, value: T): Promise<void> {
    await this.cacheService.set(
      this.getAlbumIdKey(albumId),
      value,
      this.ttl.detail,
    );
  }

  async getAlbumByShortCode<T>(shortCode: string): Promise<T | null> {
    return this.cacheService.get<T>(this.getAlbumShortCodeKey(shortCode));
  }

  async setAlbumByShortCode<T>(shortCode: string, value: T): Promise<void> {
    await this.cacheService.set(
      this.getAlbumShortCodeKey(shortCode),
      value,
      this.ttl.detail,
    );
  }

  async invalidateAlbumDetail(
    albumId: string,
    shortCode?: string,
  ): Promise<void> {
    await this.cacheService.del(this.getAlbumIdKey(albumId));
    if (shortCode) {
      await this.cacheService.del(this.getAlbumShortCodeKey(shortCode));
    }
  }

  async getAlbumStats<T>(albumId: string): Promise<T | null> {
    return this.cacheService.get<T>(this.getAlbumStatsKey(albumId));
  }

  async setAlbumStats<T>(albumId: string, value: T): Promise<void> {
    await this.cacheService.set(
      this.getAlbumStatsKey(albumId),
      value,
      this.ttl.stats,
    );
  }

  async invalidateAlbumStats(albumId: string): Promise<void> {
    await this.cacheService.del(this.getAlbumStatsKey(albumId));
  }

  async getAlbumItems<T>(
    albumId: string,
    params: Record<string, unknown>,
  ): Promise<T | null> {
    const version = await this.getAlbumItemsVersion(albumId);
    const hash = this.hashParams(params);
    return this.cacheService.get<T>(
      `album:${albumId}:items:v${version}:${hash}`,
    );
  }

  async setAlbumItems<T>(
    albumId: string,
    params: Record<string, unknown>,
    value: T,
  ): Promise<void> {
    const version = await this.getAlbumItemsVersion(albumId);
    const hash = this.hashParams(params);
    await this.cacheService.set(
      `album:${albumId}:items:v${version}:${hash}`,
      value,
      this.ttl.items,
    );
  }

  async invalidateAlbumItems(albumId: string): Promise<void> {
    await this.cacheService.increment(this.getAlbumItemsVersionKey(albumId));
  }

  async getSearch<T>(params: Record<string, unknown>): Promise<T | null> {
    const version = await this.getSearchVersion();
    const hash = this.hashParams(params);
    return this.cacheService.get<T>(`albums:search:v${version}:${hash}`);
  }

  async setSearch<T>(params: Record<string, unknown>, value: T): Promise<void> {
    const version = await this.getSearchVersion();
    const hash = this.hashParams(params);
    await this.cacheService.set(
      `albums:search:v${version}:${hash}`,
      value,
      this.ttl.search,
    );
  }

  async bumpSearchVersion(): Promise<void> {
    await this.cacheService.increment('albums:search:version');
  }

  private getAlbumIdKey(albumId: string): string {
    return `album:id:${albumId}`;
  }

  private getAlbumShortCodeKey(shortCode: string): string {
    return `album:shortcode:${shortCode}`;
  }

  private getAlbumStatsKey(albumId: string): string {
    return `album:${albumId}:stats`;
  }

  private getAlbumItemsVersionKey(albumId: string): string {
    return `album:${albumId}:items:version`;
  }

  private async getAlbumItemsVersion(albumId: string): Promise<number> {
    return this.cacheService.getNumber(this.getAlbumItemsVersionKey(albumId));
  }

  private async getSearchVersion(): Promise<number> {
    return this.cacheService.getNumber('albums:search:version');
  }

  private hashParams(params: Record<string, unknown>): string {
    const keys = Object.keys(params)
      .filter((key) => params[key] !== undefined && params[key] !== null)
      .sort();

    const normalized: Record<string, unknown> = {};

    for (const key of keys) {
      const value = params[key];
      normalized[key] = Array.isArray(value) ? [...value].sort() : value;
    }

    return createHash('sha256')
      .update(JSON.stringify(normalized))
      .digest('hex')
      .slice(0, 16);
  }
}
