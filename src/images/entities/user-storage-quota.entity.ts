import { Entity, Column, PrimaryColumn, UpdateDateColumn } from 'typeorm';
import { StorageTier } from '../types/image.types';

@Entity('user_storage_quotas')
export class UserStorageQuota {
  @PrimaryColumn({ name: 'user_id', type: 'uuid' })
  userId: string;

  @Column({
    name: 'tier_name',
    type: 'enum',
    enum: StorageTier,
    default: StorageTier.FREE,
  })
  tierName: StorageTier;

  @Column({ name: 'limit_bytes', type: 'bigint', default: 5368709120 })
  limitBytes: number;

  @Column({ name: 'used_bytes', type: 'bigint', default: 0 })
  usedBytes: number;

  @Column({ name: 'pending_bytes', type: 'bigint', default: 0 })
  pendingBytes: number;

  @Column({ name: 'image_count', type: 'int', default: 0 })
  imageCount: number;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;
}
