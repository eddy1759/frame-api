export enum ProcessingStatus {
  PENDING = 'pending',
  UPLOADED = 'uploaded',
  PROCESSING = 'processing',
  COMPLETED = 'completed',
  FAILED = 'failed',
}

export enum ImageOrientation {
  LANDSCAPE = 'landscape',
  PORTRAIT = 'portrait',
  SQUARE = 'square',
}

export enum VariantType {
  ORIGINAL = 'original',
  THUMBNAIL = 'thumbnail',
  MEDIUM = 'medium',
  LARGE = 'large',
  PANORAMIC_PREVIEW = 'panoramic_preview',
}

export enum FrameRenderStatus {
  NONE = 'none',
  PROCESSING = 'processing',
  READY = 'ready',
  PENDING_REPROCESS = 'pending_reprocess',
}

export enum UploadSessionStatus {
  PENDING = 'pending',
  COMPLETING = 'completing',
  UPLOADING = 'uploading',
  COMPLETED = 'completed',
  FAILED = 'failed',
  EXPIRED = 'expired',
  CANCELLED = 'cancelled',
}

export enum StorageTier {
  FREE = 'free',
  BASIC = 'basic',
  PRO = 'pro',
  UNLIMITED = 'unlimited',
}
