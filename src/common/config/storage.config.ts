import { registerAs } from '@nestjs/config';

export interface StorageConfig {
  endpoint: string;
  region: string;
  accessKeyId: string;
  secretAccessKey: string;
  bucket: string;
  forcePathStyle: boolean;
  useSsl: boolean;
  cdnBaseUrl: string;
}

export default registerAs(
  'storage',
  (): StorageConfig => ({
    endpoint: process.env.OBJECT_STORAGE_ENDPOINT || 'http://localhost:9000',
    region: process.env.OBJECT_STORAGE_REGION || 'us-east-1',
    accessKeyId: process.env.OBJECT_STORAGE_ACCESS_KEY || 'minioadmin',
    secretAccessKey: process.env.OBJECT_STORAGE_SECRET_KEY || 'minioadmin',
    bucket: process.env.OBJECT_STORAGE_BUCKET || 'frame-assets',
    forcePathStyle:
      (process.env.OBJECT_STORAGE_FORCE_PATH_STYLE || 'true') === 'true',
    useSsl: (process.env.OBJECT_STORAGE_USE_SSL || 'false') === 'true',
    cdnBaseUrl:
      process.env.CDN_BASE_URL || 'http://localhost:9000/frame-assets',
  }),
);
