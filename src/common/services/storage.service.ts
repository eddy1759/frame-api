import {
  CreateBucketCommand,
  DeleteObjectCommand,
  HeadBucketCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import {
  Injectable,
  InternalServerErrorException,
  Logger,
  OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { StorageConfig } from '../config/storage.config';
import { StoragePort, StorageUploadResult } from './storage/storage.port';

@Injectable()
export class StorageService implements OnModuleInit, StoragePort {
  private readonly logger = new Logger(StorageService.name);
  private readonly config: StorageConfig;
  private readonly client: S3Client;

  constructor(private readonly configService: ConfigService) {
    const storage = this.configService.get<StorageConfig>('storage');
    if (!storage) {
      throw new Error('Storage configuration not found');
    }

    this.config = storage;
    this.client = new S3Client({
      region: storage.region,
      endpoint: storage.endpoint,
      forcePathStyle: storage.forcePathStyle,
      credentials: {
        accessKeyId: storage.accessKeyId,
        secretAccessKey: storage.secretAccessKey,
      },
    });
  }

  async onModuleInit(): Promise<void> {
    await this.ensureBucketExists();
  }

  async uploadBuffer(
    key: string,
    body: Buffer,
    contentType: string,
  ): Promise<StorageUploadResult> {
    const normalizedKey = this.normalizeKey(key);

    try {
      await this.client.send(
        new PutObjectCommand({
          Bucket: this.config.bucket,
          Key: normalizedKey,
          Body: body,
          ContentType: contentType,
        }),
      );

      return {
        key: normalizedKey,
        url: this.getPublicUrl(normalizedKey),
        size: body.byteLength,
      };
    } catch (error) {
      this.logger.error(
        `Failed to upload object key=${normalizedKey}: ${error instanceof Error ? error.message : 'unknown error'}`,
      );
      throw new InternalServerErrorException({
        code: 'STORAGE_UPLOAD_FAILED',
        message: 'Failed to upload asset to object storage.',
      });
    }
  }

  async deleteObject(key: string): Promise<void> {
    const normalizedKey = this.normalizeKey(key);

    try {
      await this.client.send(
        new DeleteObjectCommand({
          Bucket: this.config.bucket,
          Key: normalizedKey,
        }),
      );
    } catch (error) {
      this.logger.warn(
        `Failed to delete object key=${normalizedKey}: ${error instanceof Error ? error.message : 'unknown error'}`,
      );
    }
  }

  getPublicUrl(key: string): string {
    const normalizedKey = this.normalizeKey(key);
    const base = this.config.cdnBaseUrl.replace(/\/$/, '');
    return `${base}/${normalizedKey}`;
  }

  async generatePresignedUrl(
    key: string,
    expiresInSeconds = 900,
  ): Promise<string> {
    const normalizedKey = this.normalizeKey(key);
    return getSignedUrl(
      this.client,
      new PutObjectCommand({
        Bucket: this.config.bucket,
        Key: normalizedKey,
      }),
      { expiresIn: expiresInSeconds },
    );
  }

  private async ensureBucketExists(): Promise<void> {
    try {
      await this.client.send(
        new HeadBucketCommand({
          Bucket: this.config.bucket,
        }),
      );
    } catch {
      try {
        await this.client.send(
          new CreateBucketCommand({
            Bucket: this.config.bucket,
          }),
        );
        this.logger.log(`Created storage bucket: ${this.config.bucket}`);
      } catch (error) {
        this.logger.warn(
          `Bucket ensure skipped/failed for ${this.config.bucket}: ${error instanceof Error ? error.message : 'unknown error'}`,
        );
      }
    }
  }

  private normalizeKey(key: string): string {
    return key.replace(/^\/+/, '');
  }
}
