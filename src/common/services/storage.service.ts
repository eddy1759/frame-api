/* eslint-disable @typescript-eslint/no-unsafe-argument */
import {
  Injectable,
  InternalServerErrorException,
  Logger,
  OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  S3Client,
  PutObjectCommand,
  DeleteObjectCommand,
  DeleteObjectsCommand,
  GetObjectCommand,
  HeadObjectCommand,
  HeadBucketCommand,
  CreateBucketCommand,
  CopyObjectCommand,
  ListObjectsV2Command,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { Readable } from 'stream';
import { StorageConfig } from '../config/storage.config';
import { StoragePort, StorageUploadResult } from './storage/storage.port';

interface ObjectHeadInfo {
  contentLength?: number;
  contentType?: string;
  etag?: string;
  lastModified?: Date;
}

@Injectable()
export class StorageService implements StoragePort, OnModuleInit {
  private readonly logger = new Logger(StorageService.name);
  private readonly client: S3Client;
  private readonly config: StorageConfig;

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

  private get bucket(): string {
    return this.config.bucket;
  }

  private normalizeKey(key: string): string {
    return key
      .trim()
      .replace(/^\/+/, '')
      .replace(/\/{2,}/g, '/');
  }

  private buildUrl(key: string): string {
    const base = this.config.cdnBaseUrl.replace(/\/$/, '');
    return `${base}/${key}`;
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
          Bucket: this.bucket,
          Key: normalizedKey,
          Body: body,
          ContentType: contentType,
        }),
      );

      return {
        key: normalizedKey,
        url: this.buildUrl(normalizedKey),
        size: body.byteLength,
      };
    } catch (error) {
      this.logger.error(`Upload failed for ${normalizedKey}`, error as Error);

      throw new InternalServerErrorException({
        code: 'STORAGE_UPLOAD_FAILED',
        message: 'Failed to upload asset to storage',
      });
    }
  }

  async putObject(
    key: string,
    body: Buffer | Readable,
    contentType: string,
    metadata?: Record<string, string>,
  ): Promise<void> {
    const normalizedKey = this.normalizeKey(key);

    await this.client.send(
      new PutObjectCommand({
        Bucket: this.bucket,
        Key: normalizedKey,
        Body: body,
        ContentType: contentType,
        Metadata: metadata,
      }),
    );
  }

  async deleteObject(key: string): Promise<void> {
    const normalizedKey = this.normalizeKey(key);

    try {
      await this.client.send(
        new DeleteObjectCommand({
          Bucket: this.bucket,
          Key: normalizedKey,
        }),
      );
    } catch (error) {
      this.logger.warn(`Delete failed for ${normalizedKey}`, error as Error);
    }
  }

  async deleteObjects(keys: string[]): Promise<void> {
    if (keys.length === 0) return;

    const normalized = keys.map((k) => ({
      Key: this.normalizeKey(k),
    }));

    const batchSize = 1000;

    for (let i = 0; i < normalized.length; i += batchSize) {
      const batch = normalized.slice(i, i + batchSize);

      await this.client.send(
        new DeleteObjectsCommand({
          Bucket: this.bucket,
          Delete: {
            Objects: batch,
          },
        }),
      );
    }
  }

  async getObjectStream(key: string): Promise<Readable> {
    const normalizedKey = this.normalizeKey(key);

    const response = await this.client.send(
      new GetObjectCommand({
        Bucket: this.bucket,
        Key: normalizedKey,
      }),
    );

    const body = response.Body;

    if (!body || !(body instanceof Readable)) {
      throw new Error('S3 returned non-stream body');
    }

    return body;
  }

  async getObjectBuffer(key: string): Promise<Buffer> {
    const stream = await this.getObjectStream(key);
    const chunks: Buffer[] = [];

    return new Promise((resolve, reject) => {
      stream.on('data', (chunk) => chunks.push(Buffer.from(chunk)));
      stream.on('end', () => resolve(Buffer.concat(chunks)));
      stream.on('error', reject);
    });
  }

  async headObject(key: string): Promise<ObjectHeadInfo | null> {
    const normalizedKey = this.normalizeKey(key);

    try {
      const response = await this.client.send(
        new HeadObjectCommand({
          Bucket: this.bucket,
          Key: normalizedKey,
        }),
      );

      return {
        contentLength: response.ContentLength,
        contentType: response.ContentType,
        etag: response.ETag,
        lastModified: response.LastModified,
      };
    } catch (error: unknown) {
      const httpStatusCode =
        typeof error === 'object' &&
        error !== null &&
        '$metadata' in error &&
        typeof (error as { $metadata?: { httpStatusCode?: number } })
          .$metadata === 'object'
          ? (error as { $metadata?: { httpStatusCode?: number } }).$metadata
              ?.httpStatusCode
          : undefined;

      if (httpStatusCode === 404) {
        return null;
      }

      throw error;
    }
  }

  async objectExists(key: string): Promise<boolean> {
    const result = await this.headObject(key);
    return result !== null;
  }

  async copyObject(sourceKey: string, destinationKey: string): Promise<void> {
    const src = this.normalizeKey(sourceKey);
    const dst = this.normalizeKey(destinationKey);

    await this.client.send(
      new CopyObjectCommand({
        Bucket: this.bucket,
        CopySource: `${this.bucket}/${src}`,
        Key: dst,
      }),
    );
  }

  async moveObject(sourceKey: string, destinationKey: string): Promise<void> {
    await this.copyObject(sourceKey, destinationKey);
    await this.deleteObject(sourceKey);
  }

  async listObjects(prefix: string, maxKeys = 1000): Promise<string[]> {
    const response = await this.client.send(
      new ListObjectsV2Command({
        Bucket: this.bucket,
        Prefix: this.normalizeKey(prefix),
        MaxKeys: maxKeys,
      }),
    );

    return (response.Contents || [])
      .map((obj) => obj.Key)
      .filter((key): key is string => Boolean(key));
  }

  async generatePresignedPutUrl(
    key: string,
    contentType: string,
    contentLength: number,
    expiresIn?: number,
  ): Promise<{ url: string; key: string; expiresAt: Date }> {
    const normalizedKey = this.normalizeKey(key);
    const expiry = expiresIn ?? this.config.presignedUrlExpiry;
    const expiresAt = new Date(Date.now() + expiry * 1000);

    const command = new PutObjectCommand({
      Bucket: this.bucket,
      Key: normalizedKey,
      ContentType: contentType,
      ContentLength: contentLength,
    });

    const url = await getSignedUrl(this.client, command, {
      expiresIn: expiry,
    });

    return {
      url,
      key: normalizedKey,
      expiresAt,
    };
  }

  async generatePresignedGetUrl(key: string, expiresIn = 900): Promise<string> {
    const normalizedKey = this.normalizeKey(key);

    const command = new GetObjectCommand({
      Bucket: this.bucket,
      Key: normalizedKey,
    });

    return getSignedUrl(this.client, command, { expiresIn });
  }

  private async ensureBucketExists(): Promise<void> {
    try {
      await this.client.send(
        new HeadBucketCommand({
          Bucket: this.bucket,
        }),
      );
    } catch {
      try {
        await this.client.send(
          new CreateBucketCommand({
            Bucket: this.bucket,
          }),
        );

        this.logger.log(`Bucket created: ${this.bucket}`);
      } catch (error) {
        this.logger.warn(
          `Bucket creation skipped/failed for ${this.bucket}`,
          error as Error,
        );
      }
    }
  }

  getPublicUrl(key: string): string {
    const normalizedKey = this.normalizeKey(key);
    return this.buildUrl(normalizedKey);
  }
}
