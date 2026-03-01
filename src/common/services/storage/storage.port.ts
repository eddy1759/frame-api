export interface StorageUploadResult {
  key: string;
  url: string;
  size: number;
}

export interface StoragePort {
  uploadBuffer(
    key: string,
    body: Buffer,
    contentType: string,
  ): Promise<StorageUploadResult>;
  deleteObject(key: string): Promise<void>;
  getPublicUrl(key: string): string;
  generatePresignedUrl(key: string, expiresInSeconds?: number): Promise<string>;
}
