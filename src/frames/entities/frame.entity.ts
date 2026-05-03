import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  ManyToMany,
  OneToMany,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
  JoinTable,
} from 'typeorm';
import { User } from '../../auth/entities/user.entity';
import { Category } from './category.entity';
import { Tag } from './tag.entity';
import { FrameAsset } from './frame-asset.entity';
import { UserSavedFrame } from './user-saved-frame.entity';
import { FrameOrientation } from './frame-orientation.enum';
import type { FrameMetadata } from '../utils/frame-metadata.util';

@Entity('frames')
export class Frame {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', length: 255 })
  name: string;

  @Index('idx_frame_slug', { unique: true })
  @Column({ type: 'varchar', length: 255, unique: true })
  slug: string;

  @Column({ type: 'text', nullable: true })
  description: string | null;

  @Column({ name: 'is_premium', type: 'boolean', default: false })
  isPremium: boolean;

  @Column({ type: 'decimal', precision: 10, scale: 2, nullable: true })
  price: string | null;

  @Column({ type: 'varchar', length: 3, default: 'USD' })
  currency: string;

  @Column({ type: 'integer' })
  width: number;

  @Column({ type: 'integer' })
  height: number;

  @Column({ name: 'aspect_ratio', type: 'varchar', length: 10 })
  aspectRatio: string;

  @Column({ type: 'varchar', length: 20 })
  orientation: FrameOrientation;

  @Column({ type: 'jsonb', default: () => "'{}'::jsonb" })
  metadata: FrameMetadata;

  @Column({ name: 'view_count', type: 'integer', default: 0 })
  viewCount: number;

  @Column({ name: 'apply_count', type: 'integer', default: 0 })
  applyCount: number;

  @Column({ name: 'is_active', type: 'boolean', default: true })
  isActive: boolean;

  @Column({ name: 'is_ai_generated', type: 'boolean', default: false })
  isAiGenerated: boolean;

  @Column({ name: 'sort_order', type: 'integer', default: 0 })
  sortOrder: number;

  @Column({ name: 'svg_url', type: 'varchar', length: 512, nullable: true })
  svgUrl: string | null;

  @Column({
    name: 'thumbnail_url',
    type: 'varchar',
    length: 512,
    nullable: true,
  })
  thumbnailUrl: string | null;

  @Column({
    name: 'editor_preview_url',
    type: 'varchar',
    length: 512,
    nullable: true,
  })
  editorPreviewUrl: string | null;

  @Column({ name: 'created_by', type: 'uuid', nullable: true })
  createdById: string | null;

  @ManyToOne(() => User, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'created_by' })
  createdBy: User | null;

  @Column({ name: 'generated_by_id', type: 'uuid', nullable: true })
  generatedById: string | null;

  @ManyToOne(() => User, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'generated_by_id' })
  generatedBy: User | null;

  @ManyToMany(() => Category, (category) => category.frames)
  @JoinTable({
    name: 'frame_categories',
    joinColumn: { name: 'frame_id', referencedColumnName: 'id' },
    inverseJoinColumn: { name: 'category_id', referencedColumnName: 'id' },
  })
  categories: Category[];

  @ManyToMany(() => Tag, (tag) => tag.frames)
  @JoinTable({
    name: 'frame_tags',
    joinColumn: { name: 'frame_id', referencedColumnName: 'id' },
    inverseJoinColumn: { name: 'tag_id', referencedColumnName: 'id' },
  })
  tags: Tag[];

  @OneToMany(() => FrameAsset, (asset) => asset.frame)
  assets: FrameAsset[];

  @OneToMany(() => UserSavedFrame, (saved) => saved.frame)
  savedByUsers: UserSavedFrame[];

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;
}
