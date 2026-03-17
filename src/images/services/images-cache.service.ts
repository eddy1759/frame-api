/* eslint-disable @typescript-eslint/no-redundant-type-constituents */
import { Injectable, Logger } from '@nestjs/common';
import { CacheService } from '../../common/services/cache.service';
import * as crypto from 'crypto';

@Injectable()
export class ImagesCacheService {
  private readonly logger = new Logger(ImagesCacheService.name);

  constructor(private readonly cacheService: CacheService) {}

  // Image detail cache
  async getImage(imageId: string): Promise<any | null> {
    return this.cacheService.get(`image:${imageId}`);
  }

  async setImage(imageId: string, data: unknown): Promise<void> {
    await this.cacheService.set(`image:${imageId}`, data, 300); // 5 min
  }

  async invalidateImage(imageId: string): Promise<void> {
    await this.cacheService.del(`image:${imageId}`);
    await this.cacheService.del(`image:${imageId}:variants`);
    await this.cacheService.del(`image:${imageId}:processing-status`);
  }

  // Processing status cache
  async getProcessingStatus(imageId: string): Promise<any | null> {
    return this.cacheService.get(`image:${imageId}:processing-status`);
  }

  async setProcessingStatus(imageId: string, data: unknown): Promise<void> {
    await this.cacheService.set(`image:${imageId}:processing-status`, data, 30); // 30 sec
  }

  // List cache
  async getImageList(
    userId: string,
    params: Record<string, unknown>,
  ): Promise<any | null> {
    const hash = this.hashParams(params);
    return this.cacheService.get(`images:user:${userId}:list:${hash}`);
  }

  async setImageList(
    userId: string,
    params: Record<string, unknown>,
    data: unknown,
  ): Promise<void> {
    const hash = this.hashParams(params);
    await this.cacheService.set(
      `images:user:${userId}:list:${hash}`,
      data,
      120,
    ); // 2 min
  }

  async invalidateUserLists(userId: string): Promise<void> {
    await this.cacheService.invalidateByPattern(`images:user:${userId}:list:*`);
  }

  // Daily upload counter
  async getDailyUploadCount(userId: string): Promise<number> {
    const date = new Date().toISOString().split('T')[0];
    const key = `upload:daily:${userId}:${date}`;
    return this.cacheService.getNumber(key);
  }

  async incrementDailyUploadCount(userId: string): Promise<number> {
    const date = new Date().toISOString().split('T')[0];
    const key = `upload:daily:${userId}:${date}`;
    return this.cacheService.increment(key, 86400); // 24hr TTL
  }

  private hashParams(params: Record<string, unknown>): string {
    const sorted = Object.keys(params)
      .sort()
      .reduce(
        (acc, key) => {
          if (params[key] !== undefined && params[key] !== null) {
            acc[key] = params[key];
          }
          return acc;
        },
        {} as Record<string, unknown>,
      );

    return crypto
      .createHash('sha256')
      .update(JSON.stringify(sorted))
      .digest('hex')
      .substring(0, 16);
  }
}
