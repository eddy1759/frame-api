import redisConfig from '../redis.config';

describe('redisConfig', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = {
      ...originalEnv,
    };

    delete process.env.REDIS_URL;
    delete process.env.REDIS_HOST;
    delete process.env.REDIS_PORT;
    delete process.env.REDIS_PASSWORD;
    delete process.env.REDIS_DB;
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it('parses REDIS_URL for the app redis connection', () => {
    process.env.REDIS_URL =
      'rediss://default:secret@global-free.upstash.io:6379/0';

    const config = redisConfig();

    expect(config).toMatchObject({
      host: 'global-free.upstash.io',
      port: 6379,
      username: 'default',
      password: 'secret',
      db: 0,
      keyPrefix: 'frame:',
      tls: {},
    });
  });

  it('preserves the legacy local defaults when REDIS_URL is absent', () => {
    const config = redisConfig();

    expect(config).toMatchObject({
      host: 'localhost',
      port: 6379,
      password: undefined,
      db: 0,
      keyPrefix: 'frame:',
    });
    expect(config.tls).toBeUndefined();
  });
});
