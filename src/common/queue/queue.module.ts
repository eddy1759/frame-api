import { Module, Global } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { ConfigModule, ConfigService } from '@nestjs/config';
import {
  ALBUM_EVENTS_QUEUE,
  IMAGE_CLEANUP_QUEUE,
  IMAGE_PROCESSING_QUEUE,
} from './queue.constants';

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
        name: IMAGE_PROCESSING_QUEUE,
      },
      {
        name: IMAGE_CLEANUP_QUEUE,
      },
      {
        name: ALBUM_EVENTS_QUEUE,
      },
    ),
  ],
  exports: [BullModule],
})
export class QueueModule {}
