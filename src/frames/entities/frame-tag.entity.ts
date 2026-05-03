import { Entity, JoinColumn, ManyToOne, PrimaryColumn } from 'typeorm';
import { Frame } from './frame.entity';
import { Tag } from './tag.entity';

@Entity('frame_tags')
export class FrameTag {
  @PrimaryColumn({ name: 'frame_id', type: 'uuid' })
  frameId: string;

  @PrimaryColumn({ name: 'tag_id', type: 'uuid' })
  tagId: string;

  @ManyToOne(() => Frame, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'frame_id' })
  frame: Frame;

  @ManyToOne(() => Tag, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'tag_id' })
  tag: Tag;
}
