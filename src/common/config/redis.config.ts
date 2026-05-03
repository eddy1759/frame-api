import { registerAs } from '@nestjs/config';
import {
  RedisConnectionConfig,
  resolveRedisConnectionConfig,
} from './redis-connection.util';

export interface RedisConfig extends RedisConnectionConfig {
  keyPrefix: string;
}

export default registerAs('redis', (): RedisConfig => {
  const connection = resolveRedisConnectionConfig({
    url: process.env.REDIS_URL,
    host: process.env.REDIS_HOST,
    port: process.env.REDIS_PORT,
    password: process.env.REDIS_PASSWORD,
    db: process.env.REDIS_DB,
    fallbackHost: 'localhost',
    fallbackPort: 6379,
    fallbackDb: 0,
  });

  return {
    ...connection,
    keyPrefix: 'frame:',
  };
});
