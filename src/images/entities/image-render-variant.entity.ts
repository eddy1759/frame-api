import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  ManyToOne,
  JoinColumn,
  Index,
  Unique,
} from 'typeorm';
import { Image } from './image.entity';
import { VariantType } from '../types/image.types';

@Entity('image_render_variants')
@Index('idx_render_variant_image', ['imageId'])
@Index('idx_render_variant_image_revision', ['imageId', 'renderRevision'])
@Unique('idx_render_variant_image_revision_type', [
  'imageId',
  'renderRevision',
  'variantType',
])
@Index('idx_render_variant_storage_key', ['storageKey'], { unique: true })
export class ImageRenderVariant {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'image_id', type: 'uuid' })
  imageId: string;

  @Column({ name: 'render_revision', type: 'int' })
  renderRevision: number;

  @Column({
    name: 'variant_type',
    type: 'enum',
    enum: VariantType,
  })
  variantType: VariantType;

  @Column({ name: 'storage_key', type: 'varchar', length: 512, unique: true })
  storageKey: string;

  @Column({ name: 'mime_type', type: 'varchar', length: 50 })
  mimeType: string;

  @Column({ name: 'file_size', type: 'bigint' })
  fileSize: number;

  @Column({ name: 'width', type: 'int' })
  width: number;

  @Column({ name: 'height', type: 'int' })
  height: number;

  @Column({ name: 'quality', type: 'int', nullable: true })
  quality: number | null;

  @Column({ name: 'cdn_url', type: 'varchar', length: 512 })
  cdnUrl: string;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @ManyToOne(() => Image, (image) => image.renderVariants, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'image_id' })
  image: Image;
}
