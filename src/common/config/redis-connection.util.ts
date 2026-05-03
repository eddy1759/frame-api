export interface RedisConnectionConfig {
  host: string;
  port: number;
  username?: string;
  password?: string;
  db: number;
  tls?: Record<string, never>;
}

interface ResolveRedisConnectionOptions {
  url?: string;
  host?: string;
  port?: string | number;
  username?: string;
  password?: string;
  db?: string | number;
  fallbackHost: string;
  fallbackPort: number;
  fallbackDb: number;
}

export function resolveRedisConnectionConfig(
  options: ResolveRedisConnectionOptions,
): RedisConnectionConfig {
  const normalizedUrl = normalizeOptionalString(options.url);

  if (!normalizedUrl) {
    return {
      host: normalizeOptionalString(options.host) ?? options.fallbackHost,
      port: parseInteger(options.port, options.fallbackPort, 'Redis port'),
      username: normalizeOptionalString(options.username),
      password: normalizeOptionalString(options.password),
      db: parseInteger(options.db, options.fallbackDb, 'Redis DB'),
    };
  }

  let parsed: URL;
  try {
    parsed = new URL(normalizedUrl);
  } catch {
    throw new Error(`Invalid Redis URL: ${normalizedUrl}`);
  }

  if (parsed.protocol !== 'redis:' && parsed.protocol !== 'rediss:') {
    throw new Error(
      `Invalid Redis URL protocol: ${parsed.protocol}. Expected redis:// or rediss://`,
    );
  }

  const dbFromPath = parseDbFromPath(parsed.pathname);

  return {
    host: parsed.hostname || options.fallbackHost,
    port: parsed.port
      ? parseInteger(parsed.port, options.fallbackPort, 'Redis URL port')
      : options.fallbackPort,
    username:
      normalizeOptionalString(parsed.username) ??
      normalizeOptionalString(options.username),
    password:
      normalizeOptionalString(parsed.password) ??
      normalizeOptionalString(options.password),
    db:
      options.db !== undefined
        ? parseInteger(options.db, options.fallbackDb, 'Redis DB')
        : (dbFromPath ?? options.fallbackDb),
    tls: parsed.protocol === 'rediss:' ? {} : undefined,
  };
}

function parseDbFromPath(pathname: string): number | undefined {
  if (!pathname || pathname === '/') {
    return undefined;
  }

  const normalized = pathname.replace(/^\//, '');
  if (!normalized) {
    return undefined;
  }

  return parseInteger(normalized, 0, 'Redis URL DB');
}

function parseInteger(
  value: string | number | undefined,
  fallback: number,
  label: string,
): number {
  if (value === undefined || value === null || value === '') {
    return fallback;
  }

  const parsed = typeof value === 'number' ? value : parseInt(value, 10);
  if (Number.isNaN(parsed)) {
    throw new Error(`${label} must be a valid integer`);
  }

  return parsed;
}

function normalizeOptionalString(value?: string): string | undefined {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
}
