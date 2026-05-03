import { registerAs } from '@nestjs/config';
import { readFileSync, existsSync } from 'fs';
import { resolve } from 'path';

export interface JwtConfig {
  privateKey: string;
  publicKey: string;
  algorithm: 'RS256';
  issuer: string;
  accessTokenTtl?: number;
  refreshTokenTtl?: number;
}

export function resolveJwtKeyMaterial(
  envKeyName: 'JWT_PRIVATE_KEY' | 'JWT_PUBLIC_KEY',
  pathEnvKeyName: 'JWT_PRIVATE_KEY_PATH' | 'JWT_PUBLIC_KEY_PATH',
  fallbackPath: string,
): string {
  const inlineValue = normalizeInlinePem(process.env[envKeyName]);
  if (inlineValue) {
    return inlineValue;
  }

  const keyPath = resolve(process.env[pathEnvKeyName] || fallbackPath);
  if (!existsSync(keyPath)) {
    throw new Error(
      `\n ${envKeyName} was not provided and key file was not found at: ${keyPath}\n` +
        `Set ${envKeyName} directly in the environment, or generate local keys with: npm run keys:generate\n`,
    );
  }

  return readFileSync(keyPath, 'utf8');
}

export default registerAs('jwt', (): JwtConfig => {
  return {
    privateKey: resolveJwtKeyMaterial(
      'JWT_PRIVATE_KEY',
      'JWT_PRIVATE_KEY_PATH',
      './keys/private.pem',
    ),
    publicKey: resolveJwtKeyMaterial(
      'JWT_PUBLIC_KEY',
      'JWT_PUBLIC_KEY_PATH',
      './keys/public.pem',
    ),
    accessTokenTtl: parseInt(process.env.JWT_ACCESS_TOKEN_TTL || '3600', 10),
    refreshTokenTtl: parseInt(
      process.env.JWT_REFRESH_TOKEN_TTL || '2592000',
      10,
    ),
    algorithm: 'RS256',
    issuer: 'frame-app',
  };
});

function normalizeInlinePem(value?: string): string | undefined {
  const trimmed = value?.trim();
  if (!trimmed) {
    return undefined;
  }

  return trimmed.replace(/\\n/g, '\n');
}
