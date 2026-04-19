import { Column, Entity, JoinColumn, OneToOne, PrimaryColumn } from 'typeorm';
import { Album } from './album.entity';

@Entity('album_stats')
export class AlbumStats {
  @PrimaryColumn({ name: 'album_id', type: 'uuid' })
  albumId: string;

  @Column({ name: 'view_count', type: 'int', default: 0 })
  viewCount: number;

  @Column({ name: 'share_count', type: 'int', default: 0 })
  shareCount: number;

  @OneToOne(() => Album, (album) => album.stats, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'album_id' })
  album: Album;
}
