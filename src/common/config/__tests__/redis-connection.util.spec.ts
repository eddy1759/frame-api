import { resolveRedisConnectionConfig } from '../redis-connection.util';

describe('resolveRedisConnectionConfig', () => {
  it('parses a rediss URL with credentials, db, and TLS', () => {
    const config = resolveRedisConnectionConfig({
      url: 'rediss://default:secret@global-free.upstash.io:6379/3',
      fallbackHost: 'localhost',
      fallbackPort: 6379,
      fallbackDb: 0,
    });

    expect(config).toEqual({
      host: 'global-free.upstash.io',
      port: 6379,
      username: 'default',
      password: 'secret',
      db: 3,
      tls: {},
    });
  });

  it('falls back to host, port, password, and db without a URL', () => {
    const config = resolveRedisConnectionConfig({
      host: 'localhost',
      port: '6382',
      password: 'frame_redis_password_dev',
      db: '1',
      fallbackHost: 'localhost',
      fallbackPort: 6379,
      fallbackDb: 0,
    });

    expect(config).toEqual({
      host: 'localhost',
      port: 6382,
      username: undefined,
      password: 'frame_redis_password_dev',
      db: 1,
    });
  });

  it('lets an explicit db override a db embedded in the URL', () => {
    const config = resolveRedisConnectionConfig({
      url: 'rediss://default:secret@global-free.upstash.io:6379/7',
      db: '2',
      fallbackHost: 'localhost',
      fallbackPort: 6379,
      fallbackDb: 0,
    });

    expect(config.db).toBe(2);
  });

  it('rejects unsupported URL protocols', () => {
    expect(() =>
      resolveRedisConnectionConfig({
        url: 'https://example.com/redis',
        fallbackHost: 'localhost',
        fallbackPort: 6379,
        fallbackDb: 0,
      }),
    ).toThrow('Invalid Redis URL protocol');
  });
});
