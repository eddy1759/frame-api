/* eslint-disable @typescript-eslint/no-unsafe-return */
/* eslint-disable @typescript-eslint/no-unsafe-assignment */
import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { JwtModule } from '@nestjs/jwt';
import { ScheduleModule } from '@nestjs/schedule';
import { AppService } from './app.service';

import {
  databaseConfig,
  redisConfig,
  jwtConfig,
  throttleConfig,
  queueConfig,
  storageConfig,
  imageConfig,
  validate,
} from './common/config';
import { JwtConfig } from './common/config/jwt.config';

import { RedisModule } from './common/redis/redis.module';
import { HealthModule } from './health/health.module';
import { AuthModule } from './auth/auth.module';
import { SharedModule } from './common/shared.module';
import { FramesModule } from './frames/frames.module';
import { QueueModule } from './common/queue/queue.module';
import { ImagesModule } from './images/images.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      load: [
        databaseConfig,
        redisConfig,
        jwtConfig,
        throttleConfig,
        queueConfig,
        storageConfig,
        imageConfig,
      ],
      validate,
      envFilePath: ['.env'],
    }),
    TypeOrmModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => {
        const dbConfig = configService.get('database');
        if (!dbConfig) {
          throw new Error('Database configuration not found');
        }
        return dbConfig;
      },
    }),
    ScheduleModule.forRoot(),
    JwtModule.registerAsync({
      global: true,
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => {
        const jwt = configService.get<JwtConfig>('jwt');
        if (!jwt) throw new Error('JWT configuration not found');
        return {
          privateKey: jwt.privateKey,
          publicKey: jwt.publicKey,
          signOptions: {
            algorithm: jwt.algorithm,
            issuer: jwt.issuer,
          },
          verifyOptions: {
            algorithms: [jwt.algorithm],
            issuer: jwt.issuer,
          },
        };
      },
    }),

    RedisModule,
    SharedModule,
    HealthModule,
    AuthModule,
    FramesModule,
    QueueModule,
    ImagesModule,
  ],
  controllers: [],
  providers: [AppService],
})
export class AppModule {}
