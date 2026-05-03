import {
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  Unique,
  Column,
} from 'typeorm';
import { User } from '../../auth/entities/user.entity';
import { Frame } from './frame.entity';

@Entity('user_saved_frames')
@Unique('UQ_user_saved_frame', ['userId', 'frameId'])
export class UserSavedFrame {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index('idx_saved_user')
  @Column({ name: 'user_id', type: 'uuid' })
  userId: string;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id' })
  user: User;

  @Index('idx_saved_frame')
  @Column({ name: 'frame_id', type: 'uuid' })
  frameId: string;

  @ManyToOne(() => Frame, (frame) => frame.savedByUsers, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'frame_id' })
  frame: Frame;

  @CreateDateColumn({ name: 'saved_at', type: 'timestamptz' })
  savedAt: Date;
}
