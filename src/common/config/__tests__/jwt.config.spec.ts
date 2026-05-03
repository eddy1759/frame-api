import { mkdtempSync, writeFileSync, rmSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import jwtConfig from '../jwt.config';

describe('jwtConfig', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = {
      ...originalEnv,
    };
    delete process.env.JWT_PRIVATE_KEY;
    delete process.env.JWT_PUBLIC_KEY;
    delete process.env.JWT_PRIVATE_KEY_PATH;
    delete process.env.JWT_PUBLIC_KEY_PATH;
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it('prefers inline key material and normalizes escaped newlines', () => {
    process.env.JWT_PRIVATE_KEY =
      '-----BEGIN PRIVATE KEY-----\\nprivate-line\\n-----END PRIVATE KEY-----';
    process.env.JWT_PUBLIC_KEY =
      '-----BEGIN PUBLIC KEY-----\\npublic-line\\n-----END PUBLIC KEY-----';

    const config = jwtConfig();

    expect(config.privateKey).toContain('\nprivate-line\n');
    expect(config.privateKey).not.toContain('\\n');
    expect(config.publicKey).toContain('\npublic-line\n');
    expect(config.publicKey).not.toContain('\\n');
  });

  it('falls back to file paths when inline keys are absent', () => {
    const tempDir = mkdtempSync(join(tmpdir(), 'jwt-config-'));
    const privatePath = join(tempDir, 'private.pem');
    const publicPath = join(tempDir, 'public.pem');

    try {
      writeFileSync(privatePath, 'private-from-file');
      writeFileSync(publicPath, 'public-from-file');
      process.env.JWT_PRIVATE_KEY_PATH = privatePath;
      process.env.JWT_PUBLIC_KEY_PATH = publicPath;

      const config = jwtConfig();

      expect(config.privateKey).toBe('private-from-file');
      expect(config.publicKey).toBe('public-from-file');
    } finally {
      rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it('throws a deploy-friendly error when neither inline keys nor files exist', () => {
    process.env.JWT_PRIVATE_KEY_PATH = join(tmpdir(), 'missing-private.pem');
    process.env.JWT_PUBLIC_KEY_PATH = join(tmpdir(), 'missing-public.pem');

    expect(() => jwtConfig()).toThrow(
      'Set JWT_PRIVATE_KEY directly in the environment, or generate local keys with: npm run keys:generate',
    );
  });
});
