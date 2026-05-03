import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  Unique,
} from 'typeorm';
import { Image } from '../../images/entities/image.entity';
import { Album } from './album.entity';

@Entity('album_items')
@Unique('idx_album_item_album_image', ['albumId', 'imageId'])
@Index('idx_album_item_album_created', ['albumId', 'createdAt'])
@Index('idx_album_item_image', ['imageId'])
@Index('idx_album_item_user', ['userId'])
@Index('idx_album_item_frame', ['frameId'])
export class AlbumItem {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'album_id', type: 'uuid' })
  albumId: string;

  @Column({ name: 'image_id', type: 'uuid' })
  imageId: string;

  @Column({ name: 'frame_id', type: 'uuid' })
  frameId: string;

  @Column({ name: 'user_id', type: 'uuid' })
  userId: string;

  @Column({ name: 'image_render_revision', type: 'int' })
  imageRenderRevision: number;

  @ManyToOne(() => Album, (album) => album.items, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'album_id' })
  album: Album;

  @ManyToOne(() => Image, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'image_id' })
  image: Image;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;
}
