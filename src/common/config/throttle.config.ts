import { registerAs } from '@nestjs/config';

export interface ThrottleConfig {
  ttl: number;
  limit: number;
}

export default registerAs(
  'throttle',
  (): ThrottleConfig => ({
    ttl: parseInt(process.env.THROTTLE_TTL || '60', 10) * 1000, // Convert to ms
    limit: parseInt(process.env.THROTTLE_LIMIT || '10', 10),
  }),
);
