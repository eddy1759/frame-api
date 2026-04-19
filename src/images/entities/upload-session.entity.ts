import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  Index,
} from 'typeorm';
import { UploadSessionStatus } from '../types/image.types';

@Entity('upload_sessions')
@Index('idx_upload_session_user', ['userId'])
@Index('idx_upload_session_status', ['status'])
@Index('idx_upload_session_album', ['albumId'])
@Index('idx_upload_session_storage_key', ['storageKey'], { unique: true })
export class UploadSession {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'user_id', type: 'uuid' })
  userId: string;

  @Column({ name: 'frame_id', type: 'uuid', nullable: true })
  frameId: string | null;

  @Column({ name: 'album_id', type: 'uuid', nullable: true })
  albumId: string | null;

  @Column({ name: 'original_filename', type: 'varchar', length: 255 })
  originalFilename: string;

  @Column({ name: 'mime_type', type: 'varchar', length: 50 })
  mimeType: string;

  @Column({ name: 'expected_file_size', type: 'bigint' })
  expectedFileSize: number;

  @Column({ name: 'storage_key', type: 'varchar', length: 512, unique: true })
  storageKey: string;

  @Column({ name: 'presigned_url', type: 'text' })
  presignedUrl: string;

  @Column({
    name: 'status',
    type: 'enum',
    enum: UploadSessionStatus,
    default: UploadSessionStatus.PENDING,
  })
  status: UploadSessionStatus;

  @Column({ name: 'is_360', type: 'boolean', default: false })
  is360: boolean;

  @Column({ name: 'expires_at', type: 'timestamptz' })
  expiresAt: Date;

  @Column({ name: 'completed_at', type: 'timestamptz', nullable: true })
  completedAt: Date | null;

  @Column({ name: 'ip_address', type: 'varchar', length: 45, nullable: true })
  ipAddress: string | null;

  @Column({ name: 'user_agent', type: 'varchar', length: 500, nullable: true })
  userAgent: string | null;

  @Column({ name: 'error_message', type: 'text', nullable: true })
  errorMessage: string | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;
}
