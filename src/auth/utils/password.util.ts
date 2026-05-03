import { randomBytes, scrypt as scryptCallback, timingSafeEqual } from 'crypto';

const HASH_VERSION = 'scrypt_v1';
const DEFAULT_COST = 16384;
const DEFAULT_BLOCK_SIZE = 8;
const DEFAULT_PARALLELIZATION = 1;
const DEFAULT_KEY_LENGTH = 64;
const DEFAULT_SALT_LENGTH = 16;
const MAX_PASSWORD_LENGTH = 1024;

// Keep invalid-user verification on the same scrypt code path to reduce
// credential-enumeration timing differences.
export const DUMMY_PASSWORD_HASH =
  'scrypt_v1$16384$8$1$64$8CUxgLJSLM3K0dbwRPp/7Q==$D90wJ0rZf7k8d0Nsx3Rp3XIan+FJxuxMxDPZWS9Vyuk3F7S3Uz7Dnk3a1JpN96CBvs1+qsSVqS+8CA0nVddOZg==';

interface ParsedPasswordHash {
  cost: number;
  blockSize: number;
  hash: Buffer;
  keyLength: number;
  parallelization: number;
  salt: Buffer;
}

export async function hashPassword(password: string): Promise<string> {
  assertPasswordCanBeStored(password);

  const salt = randomBytes(DEFAULT_SALT_LENGTH);
  const derivedKey = await deriveKey(
    applyPasswordPepper(password),
    salt,
    DEFAULT_KEY_LENGTH,
    {
      N: DEFAULT_COST,
      maxmem: 32 * 1024 * 1024,
      p: DEFAULT_PARALLELIZATION,
      r: DEFAULT_BLOCK_SIZE,
    },
  );

  return [
    HASH_VERSION,
    DEFAULT_COST.toString(),
    DEFAULT_BLOCK_SIZE.toString(),
    DEFAULT_PARALLELIZATION.toString(),
    DEFAULT_KEY_LENGTH.toString(),
    salt.toString('base64'),
    derivedKey.toString('base64'),
  ].join('$');
}

export async function verifyPassword(
  password: string,
  encodedHash: string,
): Promise<boolean> {
  if (!password || password.length > MAX_PASSWORD_LENGTH) {
    return false;
  }

  let parsed: ParsedPasswordHash;
  try {
    parsed = parsePasswordHash(encodedHash);
  } catch {
    return false;
  }

  const derivedKey = await deriveKey(
    applyPasswordPepper(password),
    parsed.salt,
    parsed.keyLength,
    {
      N: parsed.cost,
      maxmem: 32 * 1024 * 1024,
      p: parsed.parallelization,
      r: parsed.blockSize,
    },
  );

  return timingSafeEqual(derivedKey, parsed.hash);
}

export function assertPasswordCanBeStored(password: string): void {
  if (typeof password !== 'string') {
    throw new Error('Password must be a string.');
  }

  if (password.trim().length === 0) {
    throw new Error('Password must not be empty.');
  }

  if (password.length < 12) {
    throw new Error('Password must be at least 12 characters long.');
  }

  if (password.length > MAX_PASSWORD_LENGTH) {
    throw new Error(
      `Password must not exceed ${MAX_PASSWORD_LENGTH} characters.`,
    );
  }
}

function applyPasswordPepper(password: string): string {
  return `${process.env.AUTH_PASSWORD_PEPPER ?? ''}${password}`;
}

async function deriveKey(
  password: string,
  salt: Buffer,
  keyLength: number,
  options: {
    N: number;
    maxmem: number;
    p: number;
    r: number;
  },
): Promise<Buffer> {
  return new Promise<Buffer>((resolve, reject) => {
    scryptCallback(password, salt, keyLength, options, (error, derivedKey) => {
      if (error) {
        reject(error);
        return;
      }

      resolve(derivedKey as Buffer);
    });
  });
}

function parsePasswordHash(encodedHash: string): ParsedPasswordHash {
  const [
    version,
    costRaw,
    blockSizeRaw,
    parallelizationRaw,
    keyLengthRaw,
    saltBase64,
    hashBase64,
  ] = encodedHash.split('$');

  if (
    version !== HASH_VERSION ||
    !costRaw ||
    !blockSizeRaw ||
    !parallelizationRaw ||
    !keyLengthRaw ||
    !saltBase64 ||
    !hashBase64
  ) {
    throw new Error('Unsupported password hash format.');
  }

  const cost = parseInt(costRaw, 10);
  const blockSize = parseInt(blockSizeRaw, 10);
  const parallelization = parseInt(parallelizationRaw, 10);
  const keyLength = parseInt(keyLengthRaw, 10);

  if (
    !Number.isFinite(cost) ||
    !Number.isFinite(blockSize) ||
    !Number.isFinite(parallelization) ||
    !Number.isFinite(keyLength)
  ) {
    throw new Error('Invalid password hash parameters.');
  }

  return {
    cost,
    blockSize,
    parallelization,
    keyLength,
    salt: Buffer.from(saltBase64, 'base64'),
    hash: Buffer.from(hashBase64, 'base64'),
  };
}
