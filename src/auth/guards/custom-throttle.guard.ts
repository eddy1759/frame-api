/* eslint-disable @typescript-eslint/no-unsafe-member-access */
import { Injectable, HttpException, HttpStatus, Logger } from '@nestjs/common';
import { RedisService } from '../../common/redis/redis.service';
import { Request } from 'express';

export interface ThrottleOptions {
  limit: number;
  ttlSeconds: number;
}

@Injectable()
export class AuthThrottleGuard {
  private readonly logger = new Logger(AuthThrottleGuard.name);

  constructor(private readonly redisService: RedisService) {}

  async checkRateLimit(req: Request, options: ThrottleOptions): Promise<void> {
    const ip = req.ip || req.socket.remoteAddress || 'unknown';
    const route = req.route?.path || req.path;
    const key = `ratelimit:${ip}:${route}`;

    const current = await this.redisService.get(key);
    const count = current ? parseInt(current, 10) : 0;

    if (count >= options.limit) {
      this.logger.warn(
        `Rate limit exceeded: ip=${ip}, route=${route}, count=${count}/${options.limit}`,
      );

      throw new HttpException(
        {
          code: 'AUTH_RATE_LIMIT_EXCEEDED',
          message: `Too many requests. Please try again in ${options.ttlSeconds} seconds.`,
        },
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    if (count === 0) {
      await this.redisService.set(key, '1', options.ttlSeconds);
    } else {
      // Increment without resetting TTL
      await this.redisService.set(
        key,
        (count + 1).toString(),
        options.ttlSeconds,
      );
    }
  }
}
