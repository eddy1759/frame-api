import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  OneToMany,
  Index,
} from 'typeorm';
import { ImageVariant } from './image-variant.entity';
import { ImageRenderVariant } from './image-render-variant.entity';
import {
  FrameRenderStatus,
  ImageOrientation,
  ProcessingStatus,
} from '../types/image.types';
import type { FrameImagePlacement } from '../../frames/utils/frame-metadata.util';
import type { RenderTransformV1 } from '../utils/render-transform.util';

@Entity('images')
@Index('idx_image_user_created', ['userId', 'createdAt'])
@Index('idx_image_user_not_deleted', ['userId', 'isDeleted'])
@Index('idx_image_frame', ['frameId'])
@Index('idx_image_pending_frame', ['pendingFrameId'])
@Index('idx_image_processing_status', ['processingStatus'])
@Index('idx_image_storage_key', ['storageKey'], { unique: true })
export class Image {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'user_id', type: 'uuid' })
  userId: string;

  @Column({ name: 'frame_id', type: 'uuid', nullable: true })
  frameId: string | null;

  @Column({
    name: 'frame_snapshot_key',
    type: 'varchar',
    length: 512,
    nullable: true,
  })
  frameSnapshotKey: string | null;

  @Column({ name: 'frame_snapshot_size', type: 'bigint', nullable: true })
  frameSnapshotSize: number | null;

  @Column({ name: 'frame_placement', type: 'jsonb', nullable: true })
  framePlacement: FrameImagePlacement | null;

  @Column({ name: 'render_transform', type: 'jsonb', nullable: true })
  renderTransform: RenderTransformV1 | null;

  @Column({ name: 'pending_frame_id', type: 'uuid', nullable: true })
  pendingFrameId: string | null;

  @Column({
    name: 'pending_frame_snapshot_key',
    type: 'varchar',
    length: 512,
    nullable: true,
  })
  pendingFrameSnapshotKey: string | null;

  @Column({
    name: 'pending_frame_snapshot_size',
    type: 'bigint',
    nullable: true,
  })
  pendingFrameSnapshotSize: number | null;

  @Column({ name: 'pending_frame_placement', type: 'jsonb', nullable: true })
  pendingFramePlacement: FrameImagePlacement | null;

  @Column({ name: 'pending_render_transform', type: 'jsonb', nullable: true })
  pendingRenderTransform: RenderTransformV1 | null;

  @Column({
    name: 'frame_render_status',
    type: 'enum',
    enum: FrameRenderStatus,
    default: FrameRenderStatus.NONE,
  })
  frameRenderStatus: FrameRenderStatus;

  @Column({ name: 'active_render_revision', type: 'int', default: 0 })
  activeRenderRevision: number;

  @Column({ name: 'title', type: 'varchar', length: 255, nullable: true })
  title: string | null;

  @Column({ name: 'description', type: 'text', nullable: true })
  description: string | null;

  @Column({ name: 'original_filename', type: 'varchar', length: 255 })
  originalFilename: string;

  @Column({ name: 'mime_type', type: 'varchar', length: 50 })
  mimeType: string;

  @Column({ name: 'original_format', type: 'varchar', length: 10 })
  originalFormat: string;

  @Column({ name: 'storage_key', type: 'varchar', length: 512, unique: true })
  storageKey: string;

  @Column({ name: 'file_size', type: 'bigint' })
  fileSize: number;

  @Column({ name: 'width', type: 'int', nullable: true })
  width: number | null;

  @Column({ name: 'height', type: 'int', nullable: true })
  height: number | null;

  @Column({ name: 'aspect_ratio', type: 'varchar', length: 10, nullable: true })
  aspectRatio: string | null;

  @Column({
    name: 'orientation',
    type: 'enum',
    enum: ImageOrientation,
    nullable: true,
  })
  orientation: ImageOrientation | null;

  @Column({ name: 'is_360', type: 'boolean', default: false })
  is360: boolean;

  @Column({ name: 'exif_data', type: 'jsonb', default: '{}' })
  exifData: Record<string, unknown>;

  @Column({ name: 'exif_stripped', type: 'boolean', default: false })
  exifStripped: boolean;

  @Column({
    name: 'gps_latitude',
    type: 'decimal',
    precision: 10,
    scale: 8,
    nullable: true,
  })
  gpsLatitude: number | null;

  @Column({
    name: 'gps_longitude',
    type: 'decimal',
    precision: 11,
    scale: 8,
    nullable: true,
  })
  gpsLongitude: number | null;

  @Column({ name: 'checksum', type: 'varchar', length: 64, nullable: true })
  checksum: string | null;

  @Column({
    name: 'processing_status',
    type: 'enum',
    enum: ProcessingStatus,
    default: ProcessingStatus.PENDING,
  })
  processingStatus: ProcessingStatus;

  @Column({ name: 'processing_error', type: 'text', nullable: true })
  processingError: string | null;

  @Column({
    name: 'thumbnail_url',
    type: 'varchar',
    length: 512,
    nullable: true,
  })
  thumbnailUrl: string | null;

  @Column({ name: 'is_public', type: 'boolean', default: false })
  isPublic: boolean;

  @Column({ name: 'is_deleted', type: 'boolean', default: false })
  isDeleted: boolean;

  @Column({ name: 'deleted_at', type: 'timestamptz', nullable: true })
  deletedAt: Date | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;

  @OneToMany(() => ImageVariant, (variant) => variant.image, { cascade: true })
  variants: ImageVariant[];

  @OneToMany(() => ImageRenderVariant, (variant) => variant.image, {
    cascade: true,
  })
  renderVariants: ImageRenderVariant[];
}
