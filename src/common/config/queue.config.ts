import { registerAs } from '@nestjs/config';

export interface QueueConfig {
  redis: {
    host: string;
    port: number;
    password: string | undefined;
    keyPrefix: string;
    db: number;
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

export default registerAs(
  'queue',
  (): QueueConfig => ({
    redis: {
      host: process.env.REDIS_HOST || 'localhost',
      port: parseInt(process.env.REDIS_PORT || '6379', 10),
      password: process.env.REDIS_PASSWORD || undefined,
      keyPrefix: process.env.REDIS_QUEUE_NAME || 'frame-queue',
      db: parseInt(process.env.REDIS_DB || '1', 10),
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
  }),
);
