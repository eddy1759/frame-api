export const IMAGE_PROCESSING_QUEUE = 'image-processing';
export const IMAGE_CLEANUP_QUEUE = 'image-cleanup';
export const ALBUM_EVENTS_QUEUE = 'album-events';
export const AI_FRAME_GENERATION_QUEUE = 'ai-frame-generation';

export enum ImageProcessingJobType {
  PROCESS_IMAGE = 'process-image',
  REPROCESS_IMAGE = 'reprocess-image',
  PREWARM_FRAME_RENDER = 'prewarm-frame-render',
}

export enum ImageCleanupJobType {
  EXPIRE_SESSIONS = 'expire-sessions',
  HARD_DELETE = 'hard-delete',
  RECONCILE_QUOTA = 'reconcile-quota',
}

export enum AlbumEventJobType {
  IMAGE_ADDED = 'album.image.added',
  ANALYTICS_UPDATE = 'album.analytics.update',
  INDEX_UPDATE = 'album.index.update',
}

export enum AiFrameJobType {
  GENERATE_ITERATION = 'generate-iteration',
}

export interface ImageProcessingJobData {
  imageId: string;
  userId: string;
  tmpStorageKey?: string;
  storageKey?: string;
  mimeType?: string;
  is360?: boolean;
  requestedAt: string;
  renderRevision?: number;
}

export interface ImageCleanupJobData {
  type: 'expired_session' | 'hard_delete' | 'reconcile_quota';
  uploadSessionId?: string;
  imageId?: string;
  userId?: string;
  storageKeys?: string[];
}

export interface AlbumImageAddedJobData {
  albumId: string;
  imageId: string;
  frameId: string;
  userId: string;
  imageRenderRevision: number;
}

export interface AlbumAnalyticsJobData {
  albumId: string;
  metric: 'view' | 'share';
}

export interface AlbumIndexUpdateJobData {
  albumId?: string;
  reason?: 'album-created' | 'album-item-added' | 'album-updated';
}

export interface AiFrameGenerationJobData {
  jobId: string;
  iterationId: string;
  iterationNumber: number;
  userId: string;
  prompt: string;
  aspectRatio: string;
  generationMode: 'overlay' | 'scene';
}
