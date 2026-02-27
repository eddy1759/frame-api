import { Inject, Injectable, Logger } from '@nestjs/common';
import Redis from 'ioredis';
import { REDIS_CLIENT } from './redis.constants';

@Injectable()
export class RedisService {
  private readonly logger = new Logger(RedisService.name);

  constructor(@Inject(REDIS_CLIENT) private readonly redis: Redis) {}

  async get(key: string): Promise<string | null> {
    return this.redis.get(key);
  }

  async set(key: string, value: string, ttlSeconds?: number): Promise<void> {
    if (ttlSeconds) {
      await this.redis.setex(key, ttlSeconds, value);
    } else {
      await this.redis.set(key, value);
    }
  }

  async del(key: string): Promise<void> {
    await this.redis.del(key);
  }

  async exists(key: string): Promise<boolean> {
    const result = await this.redis.exists(key);
    return result === 1;
  }

  async setAdd(key: string, ...members: string[]): Promise<void> {
    await this.redis.sadd(key, ...members);
  }

  async setMembers(key: string): Promise<string[]> {
    return this.redis.smembers(key);
  }

  async setRemove(key: string, ...members: string[]): Promise<void> {
    await this.redis.srem(key, ...members);
  }

  async expire(key: string, ttlSeconds: number): Promise<void> {
    await this.redis.expire(key, ttlSeconds);
  }

  async zIncrBy(
    key: string,
    increment: number,
    member: string,
  ): Promise<number> {
    const result = await this.redis.zincrby(key, increment, member);
    return Number(result);
  }

  async zRevRangeWithScores(
    key: string,
    start: number,
    stop: number,
  ): Promise<Array<{ member: string; score: number }>> {
    const result = await this.redis.zrevrange(key, start, stop, 'WITHSCORES');
    const pairs: Array<{ member: string; score: number }> = [];

    for (let i = 0; i < result.length; i += 2) {
      const member = result[i];
      const score = Number(result[i + 1]);
      if (member !== undefined && !Number.isNaN(score)) {
        pairs.push({ member, score });
      }
    }

    return pairs;
  }

  async zRangeWithScores(
    key: string,
    start = 0,
    stop = -1,
  ): Promise<Array<{ member: string; score: number }>> {
    const result = await this.redis.zrange(key, start, stop, 'WITHSCORES');
    const pairs: Array<{ member: string; score: number }> = [];

    for (let i = 0; i < result.length; i += 2) {
      const member = result[i];
      const score = Number(result[i + 1]);
      if (member !== undefined && !Number.isNaN(score)) {
        pairs.push({ member, score });
      }
    }

    return pairs;
  }

  async deleteByPattern(pattern: string): Promise<void> {
    const keys = await this.redis.keys(pattern);
    if (keys.length === 0) {
      return;
    }

    const pipeline = this.redis.pipeline();
    for (const key of keys) {
      const strippedKey = key.replace(/^frame:/, '');
      pipeline.del(strippedKey);
    }

    await pipeline.exec();
  }

  /**
   * Check Redis connectivity.
   */
  async ping(): Promise<boolean> {
    try {
      const result = await this.redis.ping();
      return result === 'PONG';
    } catch (error) {
      this.logger.warn(
        `Redis ping failed: ${error instanceof Error ? error.message : 'unknown error'}`,
      );
      return false;
    }
  }
}
