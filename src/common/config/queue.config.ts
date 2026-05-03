import { registerAs } from '@nestjs/config';
import {
  RedisConnectionConfig,
  resolveRedisConnectionConfig,
} from './redis-connection.util';

export interface QueueConfig {
  redis: RedisConnectionConfig & {
    keyPrefix: string;
  };
  defaultJobOptions: {
    attempts: number;
    backoff: {
      type: string;
      delay: number;
    };
    removeOnComplete: {
      age: number;
      count: number;
    };
    removeOnFail: {
      age: number;
    };
  };
}

export default registerAs('queue', (): QueueConfig => {
  const queueUrl = process.env.REDIS_QUEUE_URL || process.env.REDIS_URL;
  const queueDbFallback = queueUrl ? 0 : 1;
  const redis = resolveRedisConnectionConfig({
    url: queueUrl,
    host: process.env.REDIS_QUEUE_HOST || process.env.REDIS_HOST,
    port: process.env.REDIS_QUEUE_PORT || process.env.REDIS_PORT,
    password: process.env.REDIS_QUEUE_PASSWORD || process.env.REDIS_PASSWORD,
    db: process.env.REDIS_QUEUE_DB,
    fallbackHost: 'localhost',
    fallbackPort: 6379,
    fallbackDb: queueDbFallback,
  });

  return {
    redis: {
      ...redis,
      keyPrefix: process.env.REDIS_QUEUE_NAME || 'frame-queue',
    },
    defaultJobOptions: {
      attempts: parseInt(process.env.QUEUE_ATTEMPTS || '3', 10),
      backoff: {
        type: 'exponential' as const,
        delay: parseInt(process.env.QUEUE_BACKOFF_DELAY || '3000', 10),
      },
      removeOnComplete: {
        age: parseInt(process.env.QUEUE_REMOVE_ON_COMPLETE_AGE || '86400', 10),
        count: parseInt(
          process.env.QUEUE_REMOVE_ON_COMPLETE_COUNT || '1000',
          10,
        ),
      },
      removeOnFail: {
        age: parseInt(process.env.QUEUE_REMOVE_ON_FAIL_AGE || '86400', 10),
      },
    },
  };
});
