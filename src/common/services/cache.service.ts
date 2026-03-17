import { Injectable, Logger } from '@nestjs/common';
import { RedisService } from '../redis/redis.service';

@Injectable()
export class CacheService {
  private readonly logger = new Logger(CacheService.name);

  constructor(private readonly redisService: RedisService) {}

  async get<T>(key: string): Promise<T | null> {
    try {
      const value = await this.redisService.get(key);
      if (!value) {
        return null;
      }
      return JSON.parse(value) as T;
    } catch (error) {
      this.logger.warn(
        `Cache get failed for key=${key}: ${error instanceof Error ? error.message : 'unknown error'}`,
      );
      return null;
    }
  }

  async set<T>(key: string, value: T, ttlSeconds?: number): Promise<void> {
    try {
      await this.redisService.set(key, JSON.stringify(value), ttlSeconds);
    } catch (error) {
      this.logger.warn(
        `Cache set failed for key=${key}: ${error instanceof Error ? error.message : 'unknown error'}`,
      );
    }
  }

  async del(key: string): Promise<void> {
    try {
      await this.redisService.del(key);
    } catch (error) {
      this.logger.warn(
        `Cache del failed for key=${key}: ${error instanceof Error ? error.message : 'unknown error'}`,
      );
    }
  }

  async invalidateByPattern(pattern: string): Promise<void> {
    try {
      await this.redisService.deleteByPattern(pattern);
    } catch (error) {
      this.logger.warn(
        `Cache invalidateByPattern failed for pattern=${pattern}: ${error instanceof Error ? error.message : 'unknown error'}`,
      );
    }
  }

  async zIncrBy(
    key: string,
    increment: number,
    member: string,
  ): Promise<number | null> {
    try {
      return await this.redisService.zIncrBy(key, increment, member);
    } catch (error) {
      this.logger.warn(
        `Cache zIncrBy failed for key=${key}: ${error instanceof Error ? error.message : 'unknown error'}`,
      );
      return null;
    }
  }

  async zRevRangeWithScores(
    key: string,
    start: number,
    stop: number,
  ): Promise<Array<{ member: string; score: number }>> {
    try {
      return await this.redisService.zRevRangeWithScores(key, start, stop);
    } catch (error) {
      this.logger.warn(
        `Cache zRevRangeWithScores failed for key=${key}: ${error instanceof Error ? error.message : 'unknown error'}`,
      );
      return [];
    }
  }

  async zRangeWithScores(
    key: string,
    start = 0,
    stop = -1,
  ): Promise<Array<{ member: string; score: number }>> {
    try {
      return await this.redisService.zRangeWithScores(key, start, stop);
    } catch (error) {
      this.logger.warn(
        `Cache zRangeWithScores failed for key=${key}: ${error instanceof Error ? error.message : 'unknown error'}`,
      );
      return [];
    }
  }

  async incrBy(key: string, amount: number): Promise<number | null> {
    try {
      return await this.redisService.incrBy(key, amount);
    } catch (error) {
      this.logger.warn(
        `Cache incrBy failed for key=${key}: ${error instanceof Error ? error.message : 'unknown error'}`,
      );
      return 0;
    }
  }

  async decrBy(key: string, amount: number): Promise<number | null> {
    try {
      return await this.redisService.decrBy(key, amount);
    } catch (error) {
      this.logger.warn(
        `Cache decrBy failed for key=${key}: ${error instanceof Error ? error.message : 'unknown error'}`,
      );
      return 0;
    }
  }

  async getTtl(key: string): Promise<number> {
    try {
      return await this.redisService.getTtl(key);
    } catch (error) {
      this.logger.warn(
        `Cache getTtl failed for key=${key}: ${error instanceof Error ? error.message : 'unknown error'}`,
      );
      return -1;
    }
  }

  async getNumber(key: string): Promise<number> {
    try {
      const value = await this.redisService.get(key);
      if (!value) {
        return 0;
      }
      return Number(value);
    } catch (error) {
      this.logger.warn(
        `Cache getNumber failed for key=${key}: ${error instanceof Error ? error.message : 'unknown error'}`,
      );
      return 0;
    }
  }

  async increment(key: string, ttlSeconds?: number): Promise<number> {
    try {
      const value = await this.redisService.increment(key, ttlSeconds);
      return value;
    } catch (error) {
      this.logger.warn(
        `Cache increment failed for key ${key}: ${error.message}`,
      );
      return 0;
    }
  }
}
