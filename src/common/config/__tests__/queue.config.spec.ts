import queueConfig from '../queue.config';

describe('queueConfig', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = {
      ...originalEnv,
    };

    delete process.env.REDIS_URL;
    delete process.env.REDIS_QUEUE_URL;
    delete process.env.REDIS_HOST;
    delete process.env.REDIS_PORT;
    delete process.env.REDIS_PASSWORD;
    delete process.env.REDIS_QUEUE_HOST;
    delete process.env.REDIS_QUEUE_PORT;
    delete process.env.REDIS_QUEUE_PASSWORD;
    delete process.env.REDIS_QUEUE_DB;
    delete process.env.REDIS_QUEUE_NAME;
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it('keeps the legacy queue db default when no Redis URL is provided', () => {
    const config = queueConfig();

    expect(config.redis).toMatchObject({
      host: 'localhost',
      port: 6379,
      password: undefined,
      db: 1,
      keyPrefix: 'frame-queue',
    });
    expect(config.redis.tls).toBeUndefined();
  });

  it('inherits REDIS_URL for BullMQ and defaults to db 0', () => {
    process.env.REDIS_URL =
      'rediss://default:secret@global-free.upstash.io:6379';

    const config = queueConfig();

    expect(config.redis).toMatchObject({
      host: 'global-free.upstash.io',
      port: 6379,
      username: 'default',
      password: 'secret',
      db: 0,
      keyPrefix: 'frame-queue',
      tls: {},
    });
  });

  it('supports queue-specific URLs and explicit queue db overrides', () => {
    process.env.REDIS_URL = 'rediss://default:base@base.upstash.io:6379/0';
    process.env.REDIS_QUEUE_URL =
      'rediss://default:queue@queue.upstash.io:6379/5';
    process.env.REDIS_QUEUE_DB = '2';
    process.env.REDIS_QUEUE_NAME = 'custom-queue';

    const config = queueConfig();

    expect(config.redis).toMatchObject({
      host: 'queue.upstash.io',
      port: 6379,
      username: 'default',
      password: 'queue',
      db: 2,
      keyPrefix: 'custom-queue',
      tls: {},
    });
  });
});
