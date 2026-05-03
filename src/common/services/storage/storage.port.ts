import { Readable } from 'stream';

export interface StorageUploadResult {
  key: string;
  url: string;
  size: number;
}

export interface StorageObjectHead {
  contentLength?: number;
  contentType?: string;
  etag?: string;
  lastModified?: Date;
}

export interface StoragePort {
  uploadBuffer(
    key: string,
    body: Buffer,
    contentType: string,
  ): Promise<StorageUploadResult>;

  putObject(
    key: string,
    body: Buffer | Readable,
    contentType: string,
    metadata?: Record<string, string>,
  ): Promise<void>;

  deleteObject(key: string): Promise<void>;

  deleteObjects(keys: string[]): Promise<void>;

  getPublicUrl(key: string): string;

  generatePresignedPutUrl(
    key: string,
    contentType: string,
    contentLength: number,
    expiresIn?: number,
  ): Promise<{ url: string; key: string; expiresAt: Date }>;

  generatePresignedGetUrl(key: string, expiresIn?: number): Promise<string>;

  getObjectStream(key: string): Promise<Readable>;

  getObjectBuffer(key: string): Promise<Buffer>;

  headObject(key: string): Promise<StorageObjectHead | null>;

  objectExists(key: string): Promise<boolean>;

  copyObject(sourceKey: string, destinationKey: string): Promise<void>;

  moveObject(sourceKey: string, destinationKey: string): Promise<void>;

  listObjects(prefix: string, maxKeys?: number): Promise<string[]>;
}
