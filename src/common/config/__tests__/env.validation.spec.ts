import 'reflect-metadata';
import { validate } from '../env.validation';

describe('env validation', () => {
  function createBaseConfig(): Record<string, unknown> {
    return {
      NODE_ENV: 'production',
      PORT: 8000,
      API_PREFIX: 'api/v1',
      DB_USERNAME: 'frame_user',
      DB_PASSWORD: 'frame_password',
      DB_NAME: 'frame_db',
      GOOGLE_CLIENT_ID: 'google-client-id',
      APPLE_CLIENT_ID: 'apple-client-id',
      ENCRYPTION_KEY:
        '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef',
    };
  }

  it('allows inline JWT keys without path env vars', () => {
    const config = validate({
      ...createBaseConfig(),
      JWT_PRIVATE_KEY: 'private-key',
      JWT_PUBLIC_KEY: 'public-key',
    });

    expect(config.JWT_PRIVATE_KEY).toBe('private-key');
    expect(config.JWT_PUBLIC_KEY).toBe('public-key');
  });

  it('rejects partial inline JWT key configuration', () => {
    expect(() =>
      validate({
        ...createBaseConfig(),
        JWT_PRIVATE_KEY: 'private-key-only',
      }),
    ).toThrow(
      'JWT_PRIVATE_KEY and JWT_PUBLIC_KEY must both be provided when using inline JWT key material.',
    );
  });
});
