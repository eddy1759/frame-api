import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  OneToMany,
  OneToOne,
  PrimaryGeneratedColumn,
  Unique,
  UpdateDateColumn,
} from 'typeorm';
import { User } from '../../auth/entities/user.entity';
import { Frame } from '../../frames/entities/frame.entity';
import { AlbumItem } from './album-item.entity';
import { AlbumStats } from './album-stats.entity';

@Entity('albums')
@Index('idx_album_shortcode', ['shortCode'], { unique: true })
@Index('idx_album_frame', ['frameId'])
@Index('idx_album_owner', ['ownerId'])
@Index('idx_album_public_created', ['isPublic', 'createdAt'])
@Unique('idx_album_owner_frame', ['ownerId', 'frameId'])
export class Album {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', length: 255 })
  name: string;

  @Column({ type: 'text', nullable: true })
  description: string | null;

  @Column({ name: 'short_code', type: 'varchar', length: 8, unique: true })
  shortCode: string;

  @Column({ name: 'frame_id', type: 'uuid' })
  frameId: string;

  @Column({ name: 'owner_id', type: 'uuid' })
  ownerId: string;

  @Column({ name: 'is_public', type: 'boolean', default: true })
  isPublic: boolean;

  @ManyToOne(() => Frame, { onDelete: 'NO ACTION' })
  @JoinColumn({ name: 'frame_id' })
  frame: Frame;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'owner_id' })
  owner: User;

  @OneToMany(() => AlbumItem, (item) => item.album)
  items: AlbumItem[];

  @OneToOne(() => AlbumStats, (stats) => stats.album)
  stats: AlbumStats | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;
}
