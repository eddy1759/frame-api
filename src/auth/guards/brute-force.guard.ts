import { Injectable, HttpException, HttpStatus, Logger } from '@nestjs/common';
import { RedisService } from '../../common/redis/redis.service';
import { AUTH } from '../constants/auth.constants';

@Injectable()
export class BruteForceGuard {
  private readonly logger = new Logger(BruteForceGuard.name);

  constructor(private readonly redisService: RedisService) {}

  /**
   * Check if a subject key is blocked due to too many failed attempts.
   */
  async checkBruteForce(subject: string): Promise<void> {
    const blockKey = `${AUTH.BRUTE_FORCE_PREFIX}block:${subject}`;
    const isBlocked = await this.redisService.exists(blockKey);

    if (isBlocked) {
      this.logger.warn(`Blocked subject attempted login: subject=${subject}`);

      throw new HttpException(
        {
          code: 'AUTH_RATE_LIMIT_EXCEEDED',
          message: 'Too many failed attempts. Please try again later.',
        },
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }
  }

  /**
   * Record a failed authentication attempt.
   */
  async recordFailedAttempt(subject: string): Promise<void> {
    const attemptsKey = `${AUTH.BRUTE_FORCE_PREFIX}attempts:${subject}`;
    const current = await this.redisService.get(attemptsKey);
    const attempts = current ? parseInt(current, 10) + 1 : 1;

    // Store with 15-minute window
    await this.redisService.set(attemptsKey, attempts.toString(), 900);

    if (attempts >= AUTH.BRUTE_FORCE_MAX_ATTEMPTS) {
      // Block the IP
      const blockKey = `${AUTH.BRUTE_FORCE_PREFIX}block:${subject}`;
      await this.redisService.set(
        blockKey,
        '1',
        AUTH.BRUTE_FORCE_BLOCK_DURATION,
      );

      this.logger.warn(
        `Subject blocked due to brute force: subject=${subject}, attempts=${attempts}`,
      );
    }
  }

  /**
   * Reset failed attempts on successful login.
   */
  async resetAttempts(subject: string): Promise<void> {
    const attemptsKey = `${AUTH.BRUTE_FORCE_PREFIX}attempts:${subject}`;
    await this.redisService.del(attemptsKey);
  }
}
