export interface AuthConstants {
  readonly ACCESS_TOKEN_TTL: number;
  readonly REFRESH_TOKEN_TTL: number;
  readonly SESSION_TTL: number;
  readonly BLACKLIST_PREFIX: string;
  readonly SESSION_PREFIX: string;
  readonly USER_SESSIONS_PREFIX: string;
  readonly BRUTE_FORCE_PREFIX: string;
  readonly BRUTE_FORCE_MAX_ATTEMPTS: number;
  readonly BRUTE_FORCE_BLOCK_DURATION: number;
  readonly MAX_SESSIONS_PER_USER: number;
}

export const AUTH: AuthConstants = {
  ACCESS_TOKEN_TTL: 3600, // 1 hour in seconds
  REFRESH_TOKEN_TTL: 2592000, // 30 days in seconds
  SESSION_TTL: 86400, // 24 hours in seconds
  BLACKLIST_PREFIX: 'blacklist:',
  SESSION_PREFIX: 'session:',
  USER_SESSIONS_PREFIX: 'user:sessions:',
  BRUTE_FORCE_PREFIX: 'brute:',
  BRUTE_FORCE_MAX_ATTEMPTS: 5,
  BRUTE_FORCE_BLOCK_DURATION: 900, // 15 minutes in seconds
  MAX_SESSIONS_PER_USER: 10,
};
