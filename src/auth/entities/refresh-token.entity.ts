import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  ManyToOne,
  JoinColumn,
  Index,
} from 'typeorm';
import { User } from './user.entity';
import { DeviceInfo } from '../interfaces/device-info.interface';

@Entity('refresh_tokens')
export class RefreshToken {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index('idx_refresh_tokens_user_id')
  @Column({ name: 'user_id', type: 'uuid' })
  userId: string;

  @ManyToOne(() => User, (user) => user.refreshTokens, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'user_id' })
  user: User;

  @Index('idx_refresh_tokens_hash', { unique: true })
  @Column({
    name: 'token_hash',
    type: 'varchar',
    length: 64,
    unique: true,
  })
  tokenHash: string;

  @Index('idx_refresh_tokens_family')
  @Column({
    name: 'family_id',
    type: 'uuid',
  })
  familyId: string;

  @Column({
    name: 'device_info',
    type: 'jsonb',
    nullable: true,
  })
  deviceInfo: DeviceInfo | null;

  @Column({
    name: 'ip_address',
    type: 'varchar',
    length: 45, // supports IPv6
    nullable: true,
  })
  ipAddress: string | null;

  @Column({
    name: 'is_revoked',
    type: 'boolean',
    default: false,
  })
  isRevoked: boolean;

  @Index('idx_refresh_tokens_expires')
  @Column({
    name: 'expires_at',
    type: 'timestamptz',
  })
  expiresAt: Date;

  @CreateDateColumn({
    name: 'created_at',
    type: 'timestamptz',
  })
  createdAt: Date;
}
