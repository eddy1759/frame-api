import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { Frame } from '../../frames/entities/frame.entity';
import { AiFrameIterationStatus } from '../enums';
import { AiFrameJob } from './ai-frame-job.entity';

@Entity('ai_frame_iterations')
@Index('idx_ai_frame_iterations_job_created', ['jobId', 'createdAt'])
@Index('idx_ai_frame_iterations_status_created', ['status', 'createdAt'])
@Index('idx_ai_frame_iterations_frame', ['frameId'])
@Index('idx_ai_frame_iterations_job_number', ['jobId', 'iterationNumber'], {
  unique: true,
})
export class AiFrameIteration {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'job_id', type: 'uuid' })
  jobId: string;

  @ManyToOne(() => AiFrameJob, (job) => job.iterations, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'job_id' })
  job: AiFrameJob;

  @Column({ name: 'iteration_number', type: 'int' })
  iterationNumber: number;

  @Column({ type: 'varchar', length: 30 })
  status: AiFrameIterationStatus;

  @Column({ type: 'text', nullable: true })
  feedback: string | null;

  @Column({ name: 'engineered_prompt', type: 'text', nullable: true })
  engineeredPrompt: string | null;

  @Column({ type: 'varchar', length: 50, nullable: true })
  provider: string | null;

  @Column({
    name: 'model_version',
    type: 'varchar',
    length: 100,
    nullable: true,
  })
  modelVersion: string | null;

  @Column({ name: 'generation_ms', type: 'int', nullable: true })
  generationMs: number | null;

  @Column({
    name: 'raw_image_storage_key',
    type: 'varchar',
    length: 512,
    nullable: true,
  })
  rawImageStorageKey: string | null;

  @Column({
    name: 'raw_image_mime_type',
    type: 'varchar',
    length: 50,
    nullable: true,
  })
  rawImageMimeType: string | null;

  @Column({ name: 'raw_image_size', type: 'bigint', nullable: true })
  rawImageSize: number | null;

  @Column({ name: 'frame_id', type: 'uuid', nullable: true })
  frameId: string | null;

  @ManyToOne(() => Frame, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'frame_id' })
  frame: Frame | null;

  @Column({
    name: 'queue_job_id',
    type: 'varchar',
    length: 255,
    nullable: true,
  })
  queueJobId: string | null;

  @Column({ name: 'error_code', type: 'varchar', length: 100, nullable: true })
  errorCode: string | null;

  @Column({ name: 'error_message', type: 'text', nullable: true })
  errorMessage: string | null;

  @Column({ name: 'started_at', type: 'timestamptz', nullable: true })
  startedAt: Date | null;

  @Column({ name: 'completed_at', type: 'timestamptz', nullable: true })
  completedAt: Date | null;

  @Column({ name: 'failed_at', type: 'timestamptz', nullable: true })
  failedAt: Date | null;

  @Column({ name: 'cleaned_at', type: 'timestamptz', nullable: true })
  cleanedAt: Date | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;
}
