import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { Frame } from './frame.entity';
import { FrameAssetType } from './frame-asset-type.enum';

@Entity('frame_assets')
export class FrameAsset {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index('idx_asset_frame')
  @Column({ name: 'frame_id', type: 'uuid' })
  frameId: string;

  @ManyToOne(() => Frame, (frame) => frame.assets, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'frame_id' })
  frame: Frame;

  @Column({ type: 'varchar', length: 30 })
  type: FrameAssetType;

  @Column({ name: 'storage_key', type: 'varchar', length: 512 })
  storageKey: string;

  @Column({ name: 'mime_type', type: 'varchar', length: 50 })
  mimeType: string;

  @Column({ name: 'file_size', type: 'integer' })
  fileSize: number;

  @Column({ type: 'integer', nullable: true })
  width: number | null;

  @Column({ type: 'integer', nullable: true })
  height: number | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;
}
