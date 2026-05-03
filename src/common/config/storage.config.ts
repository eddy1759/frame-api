import { registerAs } from '@nestjs/config';

export interface StorageConfig {
  endpoint: string;
  region: string;
  accessKeyId: string;
  secretAccessKey: string;
  bucket: string;
  presignedUrlExpiry: number;
  forcePathStyle: boolean;
  useSsl: boolean;
  cdnBaseUrl: string;
  connectionTimeoutMs: number;
  socketTimeoutMs: number;
  uploadMaxAttempts: number;
  uploadBaseDelayMs: number;
}

export default registerAs(
  'storage',
  (): StorageConfig => ({
    endpoint: process.env.OBJECT_STORAGE_ENDPOINT || 'http://localhost:9000',
    region: process.env.OBJECT_STORAGE_REGION || 'us-east-1',
    accessKeyId: process.env.OBJECT_STORAGE_ACCESS_KEY || 'minioadmin',
    secretAccessKey: process.env.OBJECT_STORAGE_SECRET_KEY || 'minioadmin',
    bucket: process.env.OBJECT_STORAGE_BUCKET || 'frame-assets',
    presignedUrlExpiry: parseInt(
      process.env.PRESIGNED_URL_EXPIRY || '3600',
      10,
    ),
    forcePathStyle:
      process.env.OBJECT_STORAGE_FORCE_PATH_STYLE === 'true' ||
      process.env.NODE_ENV !== 'production',
    useSsl: (process.env.OBJECT_STORAGE_USE_SSL || 'false') === 'true',
    cdnBaseUrl:
      process.env.CDN_BASE_URL || 'http://localhost:9000/frame-assets',
    connectionTimeoutMs: parseInt(
      process.env.OBJECT_STORAGE_CONNECTION_TIMEOUT_MS || '5000',
      10,
    ),
    socketTimeoutMs: parseInt(
      process.env.OBJECT_STORAGE_SOCKET_TIMEOUT_MS || '20000',
      10,
    ),
    uploadMaxAttempts: parseInt(
      process.env.OBJECT_STORAGE_UPLOAD_MAX_ATTEMPTS || '4',
      10,
    ),
    uploadBaseDelayMs: parseInt(
      process.env.OBJECT_STORAGE_UPLOAD_BASE_DELAY_MS || '1000',
      10,
    ),
  }),
);

export const imageConfig = registerAs('image', () => ({
  maxSize: parseInt(process.env.IMAGE_MAX_SIZE || '52428800', 10), // 50MB
  allowedMimeTypes: ['image/jpeg', 'image/png', 'image/heic', 'image/heif'],
  dailyUploadLimit: parseInt(process.env.IMAGE_DAILY_UPLOAD_LIMIT || '100', 10),
  defaultStorageLimit: parseInt(
    process.env.IMAGE_DEFAULT_STORAGE_LIMIT || '5368709120',
    10,
  ), // 5GB
  softDeleteGraceDays: parseInt(
    process.env.IMAGE_SOFT_DELETE_GRACE_DAYS || '30',
    10,
  ),
  variants: {
    thumbnail: {
      maxWidth: 300,
      maxHeight: 300,
      quality: 80,
      fit: 'cover' as const,
    },
    medium: {
      maxWidth: 1024,
      maxHeight: 1024,
      quality: 85,
      fit: 'inside' as const,
    },
    large: {
      maxWidth: 1920,
      maxHeight: 1920,
      quality: 90,
      fit: 'inside' as const,
    },
    panoramic_preview: {
      maxWidth: 2048,
      maxHeight: 1024,
      quality: 85,
      fit: 'inside' as const,
    },
  },
}));
