import {
  Column,
  CreateDateColumn,
  DeleteDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  OneToMany,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { User } from '../../auth/entities/user.entity';
import { Frame } from '../../frames/entities/frame.entity';
import { AiFrameIteration } from './ai-frame-iteration.entity';
import { AiFrameGenerationMode, AiFrameJobStatus } from '../enums';

@Entity('ai_frame_jobs')
@Index('idx_ai_frame_jobs_user_created', ['userId', 'createdAt'])
@Index('idx_ai_frame_jobs_status_created', ['status', 'createdAt'])
export class AiFrameJob {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'user_id', type: 'uuid' })
  userId: string;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id' })
  user: User;

  @Column({ type: 'varchar', length: 30 })
  status: AiFrameJobStatus;

  @Column({ type: 'text' })
  prompt: string;

  @Column({ name: 'aspect_ratio', type: 'varchar', length: 10 })
  aspectRatio: string;

  @Column({
    name: 'generation_mode',
    type: 'varchar',
    length: 20,
    default: AiFrameGenerationMode.OVERLAY,
  })
  generationMode: AiFrameGenerationMode;

  @Column({ name: 'latest_iteration_number', type: 'int', default: 0 })
  latestIterationNumber: number;

  @Column({ name: 'accepted_iteration_id', type: 'uuid', nullable: true })
  acceptedIterationId: string | null;

  @ManyToOne(() => AiFrameIteration, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'accepted_iteration_id' })
  acceptedIteration: AiFrameIteration | null;

  @Column({ name: 'promoted_frame_id', type: 'uuid', nullable: true })
  promotedFrameId: string | null;

  @ManyToOne(() => Frame, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'promoted_frame_id' })
  promotedFrame: Frame | null;

  @Column({ name: 'cancel_requested_at', type: 'timestamptz', nullable: true })
  cancelRequestedAt: Date | null;

  @Column({
    name: 'last_error_code',
    type: 'varchar',
    length: 100,
    nullable: true,
  })
  lastErrorCode: string | null;

  @Column({ name: 'last_error_message', type: 'text', nullable: true })
  lastErrorMessage: string | null;

  @Column({ name: 'completed_at', type: 'timestamptz', nullable: true })
  completedAt: Date | null;

  @Column({ name: 'accepted_at', type: 'timestamptz', nullable: true })
  acceptedAt: Date | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;

  @DeleteDateColumn({ name: 'deleted_at', type: 'timestamptz', nullable: true })
  deletedAt: Date | null;

  @OneToMany(() => AiFrameIteration, (iteration) => iteration.job)
  iterations: AiFrameIteration[];
}
