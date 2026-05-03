import { Entity, JoinColumn, ManyToOne, PrimaryColumn } from 'typeorm';
import { Frame } from './frame.entity';
import { Category } from './category.entity';

@Entity('frame_categories')
export class FrameCategory {
  @PrimaryColumn({ name: 'frame_id', type: 'uuid' })
  frameId: string;

  @PrimaryColumn({ name: 'category_id', type: 'uuid' })
  categoryId: string;

  @ManyToOne(() => Frame, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'frame_id' })
  frame: Frame;

  @ManyToOne(() => Category, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'category_id' })
  category: Category;
}
