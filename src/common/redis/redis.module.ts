import { Global, Module, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';
import { RedisConfig } from '../config/redis.config';
import { RedisService } from './redis.service';
import { REDIS_CLIENT } from './redis.constants';

@Global()
@Module({
  providers: [
    {
      provide: REDIS_CLIENT,
      useFactory: (configService: ConfigService): Redis => {
        const logger = new Logger('RedisModule');
        const config = configService.get<RedisConfig>('redis');

        if (!config) {
          throw new Error('Redis configuration not found');
        }

        const redis = new Redis({
          host: config.host,
          port: config.port,
          username: config.username,
          password: config.password,
          db: config.db,
          tls: config.tls,
          keyPrefix: config.keyPrefix,
          retryStrategy(times: number): number | null {
            if (times > 10) {
              logger.error('Redis: Max retry attempts reached. Giving up.');
              return null;
            }
            const delay = Math.min(times * 200, 5000);
            logger.warn(`Redis: Connection retry #${times} in ${delay}ms`);
            return delay;
          },
          maxRetriesPerRequest: 3,
          lazyConnect: false,
          showFriendlyErrorStack: process.env.NODE_ENV === 'development',
        });

        redis.on('connect', () => {
          logger.log('Redis connected');
        });

        redis.on('ready', () => {
          logger.log('Redis ready to accept commands');
        });

        redis.on('error', (err: Error) => {
          logger.error(`Redis error: ${err.message}`);
        });

        redis.on('close', () => {
          logger.warn('Redis connection closed');
        });

        return redis;
      },
      inject: [ConfigService],
    },
    RedisService,
  ],
  exports: [REDIS_CLIENT, RedisService],
})
export class RedisModule {}
