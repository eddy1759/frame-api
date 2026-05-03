import { plainToInstance } from 'class-transformer';
import {
  IsBoolean,
  IsEnum,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  Min,
  validateSync,
} from 'class-validator';

enum Environment {
  Development = 'development',
  Staging = 'staging',
  Production = 'production',
  Test = 'test',
}

class EnvironmentVariables {
  @IsEnum(Environment)
  NODE_ENV: Environment = Environment.Development;

  @IsNumber()
  @Min(1)
  @Max(65535)
  PORT: number = 3000;

  @IsOptional()
  @IsString()
  HOST?: string = '0.0.0.0';

  @IsString()
  @IsNotEmpty()
  API_PREFIX: string = 'v1';

  // Database
  @IsString()
  @IsNotEmpty()
  DB_HOST: string = 'localhost';

  @IsNumber()
  DB_PORT: number = 5432;

  @IsString()
  @IsNotEmpty()
  DB_USERNAME: string = '';

  @IsString()
  @IsNotEmpty()
  DB_PASSWORD: string = '';

  @IsString()
  @IsNotEmpty()
  DB_NAME: string = '';

  @IsNumber()
  @IsOptional()
  DB_POOL_MAX: number = 50;

  @IsNumber()
  @IsOptional()
  DB_POOL_MIN: number = 5;

  @IsBoolean()
  @IsOptional()
  DB_AUTO_RUN_MIGRATIONS?: boolean;

  // Redis
  @IsOptional()
  @IsString()
  REDIS_URL?: string;

  @IsString()
  @IsNotEmpty()
  REDIS_HOST: string = 'localhost';

  @IsNumber()
  REDIS_PORT: number = 6379;

  @IsOptional()
  @IsString()
  REDIS_PASSWORD?: string;

  @IsOptional()
  @IsString()
  REDIS_QUEUE_URL?: string;

  @IsOptional()
  @IsString()
  REDIS_QUEUE_HOST?: string;

  @IsOptional()
  @IsNumber()
  REDIS_QUEUE_PORT?: number;

  @IsOptional()
  @IsString()
  REDIS_QUEUE_PASSWORD?: string;

  @IsOptional()
  @IsNumber()
  REDIS_QUEUE_DB?: number = 1;

  @IsOptional()
  @IsString()
  REDIS_QUEUE_NAME?: string = 'frame-queue';

  // JWT
  @IsString()
  @IsNotEmpty()
  JWT_PRIVATE_KEY_PATH: string = '';

  @IsString()
  @IsNotEmpty()
  JWT_PUBLIC_KEY_PATH: string = '';

  @IsNumber()
  JWT_ACCESS_TOKEN_TTL: number = 3600;

  @IsNumber()
  JWT_REFRESH_TOKEN_TTL: number = 2592000;

  // OAuth
  @IsString()
  @IsNotEmpty()
  GOOGLE_CLIENT_ID: string = '';

  @IsString()
  @IsNotEmpty()
  APPLE_CLIENT_ID: string = '';

  // Security
  @IsString()
  @IsNotEmpty()
  ENCRYPTION_KEY: string = '';

  @IsNumber()
  THROTTLE_TTL: number = 60;

  @IsNumber()
  THROTTLE_LIMIT: number = 10;

  @IsString()
  @IsOptional()
  CORS_ORIGINS?: string;

  @IsNumber()
  @IsOptional()
  HTTP_KEEP_ALIVE_TIMEOUT: number = 65000;

  @IsNumber()
  @IsOptional()
  HTTP_HEADERS_TIMEOUT: number = 66000;

  @IsNumber()
  @IsOptional()
  HTTP_REQUEST_TIMEOUT: number = 120000;

  @IsBoolean()
  @IsOptional()
  HTTP_ACCESS_LOG_ENABLED: boolean = false;

  // Object storage
  @IsString()
  @IsNotEmpty()
  OBJECT_STORAGE_ENDPOINT: string = 'http://localhost:9000';

  @IsString()
  @IsNotEmpty()
  OBJECT_STORAGE_REGION: string = 'us-east-1';

  @IsString()
  @IsNotEmpty()
  OBJECT_STORAGE_ACCESS_KEY: string = 'minioadmin';

  @IsString()
  @IsNotEmpty()
  OBJECT_STORAGE_SECRET_KEY: string = 'minioadmin';

  @IsString()
  @IsNotEmpty()
  OBJECT_STORAGE_BUCKET: string = 'frame-assets';

  @IsBoolean()
  OBJECT_STORAGE_FORCE_PATH_STYLE: boolean = true;

  @IsBoolean()
  OBJECT_STORAGE_USE_SSL: boolean = false;

  @IsString()
  @IsNotEmpty()
  CDN_BASE_URL: string = 'http://localhost:9000/frame-assets';

  @IsNumber()
  @IsOptional()
  OBJECT_STORAGE_CONNECTION_TIMEOUT_MS: number = 5000;

  @IsNumber()
  @IsOptional()
  OBJECT_STORAGE_SOCKET_TIMEOUT_MS: number = 20000;

  @IsNumber()
  @IsOptional()
  OBJECT_STORAGE_UPLOAD_MAX_ATTEMPTS: number = 4;

  @IsNumber()
  @IsOptional()
  OBJECT_STORAGE_UPLOAD_BASE_DELAY_MS: number = 1000;

  @IsNumber()
  PRESIGNED_URL_EXPIRY: number = 3600;

  @IsNumber()
  IMAGE_MAX_SIZE: number = 52428800;

  @IsNumber()
  IMAGE_DAILY_UPLOAD_LIMIT: number = 100;

  @IsNumber()
  IMAGE_DEFAULT_STORAGE_LIMIT: number = 5368709120;

  @IsNumber()
  IMAGE_SOFT_DELETE_GRACE_DAYS: number = 30;

  @IsOptional()
  @IsNumber()
  QUEUE_ATTEMPTS?: number = 3;

  @IsOptional()
  @IsNumber()
  QUEUE_BACKOFF_DELAY?: number = 3000;

  @IsOptional()
  @IsNumber()
  QUEUE_REMOVE_ON_COMPLETE_AGE?: number = 86400;

  @IsOptional()
  @IsNumber()
  QUEUE_REMOVE_ON_COMPLETE_COUNT?: number = 1000;

  @IsOptional()
  @IsNumber()
  QUEUE_REMOVE_ON_FAIL_AGE?: number = 86400;

  @IsOptional()
  @IsString()
  AI_PROVIDER?: string = 'dalle3';

  @IsOptional()
  @IsString()
  AI_PROVIDER_FALLBACKS?: string;

  @IsOptional()
  @IsString()
  AI_SCENE_MODE_ACCESS?: string = 'admin';

  @IsOptional()
  @IsString()
  OPENAI_API_KEY?: string;

  @IsOptional()
  @IsString()
  STABLE_DIFFUSION_API_KEY?: string;

  @IsOptional()
  @IsNumber()
  AI_FRAME_DAILY_LIMIT_FREE?: number = 10;

  @IsOptional()
  @IsNumber()
  AI_FRAME_DAILY_LIMIT_PREMIUM?: number = 50;

  @IsOptional()
  @IsNumber()
  AI_FRAME_BURST_LIMIT?: number = 5;

  @IsOptional()
  @IsNumber()
  AI_FRAME_BURST_WINDOW_SECONDS?: number = 60;

  @IsOptional()
  @IsNumber()
  AI_FRAME_MAX_ITERATIONS_PER_JOB?: number = 10;

  @IsOptional()
  @IsNumber()
  AI_FRAME_REGEN_COOLDOWN_SECONDS?: number = 15;

  @IsOptional()
  @IsNumber()
  AI_FRAME_MAX_CONCURRENT_JOBS_PER_USER?: number = 2;

  @IsOptional()
  @IsNumber()
  AI_FRAME_PENDING_QUEUE_LIMIT_PER_USER?: number = 3;

  @IsOptional()
  @IsNumber()
  AI_FRAME_APERTURE_INSET_PCT?: number = 0.125;

  @IsOptional()
  @IsNumber()
  AI_FRAME_STATUS_CACHE_TTL?: number = 30;

  @IsOptional()
  @IsNumber()
  AI_FRAME_JOB_LIST_CACHE_TTL?: number = 120;

  @IsOptional()
  @IsNumber()
  AI_FRAME_PROVIDER_TIMEOUT_MS?: number = 90000;
}

export function validate(
  config: Record<string, unknown>,
): EnvironmentVariables {
  const validatedConfig = plainToInstance(EnvironmentVariables, config, {
    enableImplicitConversion: true,
  });

  const errors = validateSync(validatedConfig, {
    skipMissingProperties: false,
    whitelist: true,
  });

  if (errors.length > 0) {
    const errorMessages = errors
      .map((err) => {
        const constraints = err.constraints
          ? Object.values(err.constraints).join(', ')
          : 'unknown error';
        return `  - ${err.property}: ${constraints}`;
      })
      .join('\n');

    throw new Error(
      `\n\nEnvironment validation failed:\n${errorMessages}\n\nPlease check your .env file.\n`,
    );
  }

  return validatedConfig;
}
