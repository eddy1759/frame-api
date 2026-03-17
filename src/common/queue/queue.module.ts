import { Module, Global } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { constants } from './queue.constants';

@Global()
@Module({
  imports: [
    BullModule.forRootAsync({
      imports: [ConfigModule],
      useFactory: (configService: ConfigService) => ({
        connection: {
          host: configService.get<string>('queue.redis.host', 'localhost'),
          port: configService.get<number>('queue.redis.port', 6379),
          password: configService.get<string>('queue.redis.password'),
          db: configService.get<number>('queue.redis.db', 0),
        },
        defaultJobOptions: configService.get('queue.defaultJobOptions'),
      }),
      inject: [ConfigService],
    }),
    BullModule.registerQueue(
      {
        name: constants.IMAGE_PROCESSING_QUEUE,
        defaultJobOptions: {
          attempts: 3,
          backoff: {
            type: 'exponential',
            delay: 3000, // 3 seconds
          },
          removeOnComplete: { age: 86400, count: 1000 }, // Keep completed jobs for 1 day or max 1000
          removeOnFail: { age: 604800 }, // Keep failed jobs for 7 days
        },
      },
      {
        name: constants.IMAGE_CLEANUP_QUEUE,
        defaultJobOptions: {
          attempts: 3,
          backoff: {
            type: 'exponential',
            delay: 3000, // 3 seconds
          },
          removeOnComplete: { age: 86400, count: 1000 }, // Keep completed jobs for 1 day or max 1000
          removeOnFail: { age: 604800 }, // Keep failed jobs for 7 days
        },
      },
    ),
  ],
  exports: [BullModule],
})
export class QueueModule {}
