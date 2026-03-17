import { Injectable, Logger, ForbiddenException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { CacheService } from '../../common/services/cache.service';
import { UserStorageQuota } from '../entities/user-storage-quota.entity';
import { StorageTier } from '../types/image.types';

@Injectable()
export class StorageQuotaService {
  private readonly logger = new Logger(StorageQuotaService.name);

  constructor(
    @InjectRepository(UserStorageQuota)
    private readonly quotaRepository: Repository<UserStorageQuota>,
    private readonly cacheService: CacheService,
  ) {}

  async getOrCreateQuota(userId: string): Promise<UserStorageQuota> {
    let quota = await this.quotaRepository.findOne({ where: { userId } });

    if (!quota) {
      quota = this.quotaRepository.create({
        userId,
        tierName: StorageTier.FREE,
        limitBytes: 5368709120, // 5GB
        usedBytes: 0,
        imageCount: 0,
      });
      quota = await this.quotaRepository.save(quota);
    }

    return quota;
  }

  async checkQuotaAvailability(
    userId: string,
    requiredBytes: number,
  ): Promise<void> {
    const used = await this.getUsedBytes(userId);
    const pending = await this.getPendingBytes(userId);
    const quota = await this.getOrCreateQuota(userId);

    const totalRequired = Number(used) + Number(pending) + requiredBytes;

    if (totalRequired > Number(quota.limitBytes)) {
      throw new ForbiddenException(
        'STORAGE_QUOTA_EXCEEDED',
        `Storage quota exceeded. Used: ${used}, Pending: ${pending}, Required: ${requiredBytes}, Limit: ${quota.limitBytes}`,
      );
    }
  }

  async reservePending(userId: string, bytes: number): Promise<void> {
    const key = `quota:${userId}:pending`;
    await this.cacheService.incrBy(key, bytes);
  }

  async releasePending(userId: string, bytes: number): Promise<void> {
    const key = `quota:${userId}:pending`;
    const current = await this.cacheService.getNumber(key);
    const newValue = Math.max(0, current - bytes);
    await this.cacheService.set(key, newValue);
  }

  async confirmUsage(
    userId: string,
    actualBytes: number,
    pendingBytes: number,
  ): Promise<void> {
    if (actualBytes <= 0) {
      throw new Error('actualBytes must be greater than zero');
    }

    if (pendingBytes < 0) {
      throw new Error('pendingBytes cannot be negative');
    }

    // Update database first (source of truth)
    await this.quotaRepository
      .createQueryBuilder()
      .update(UserStorageQuota)
      .set({
        usedBytes: () => `"usedBytes" + :actualBytes`,
        imageCount: () => `"imageCount" + 1`,
      })
      .where('user_id = :userId', { userId })
      .setParameters({ actualBytes })
      .execute();

    // Release reserved quota
    await this.releasePending(userId, pendingBytes);

    // Update Redis usage counter
    const usedKey = `quota:${userId}:used`;

    try {
      await this.cacheService.incrBy(usedKey, actualBytes);
    } catch (error) {
      this.logger.warn(
        `Redis quota update failed for user ${userId}: ${error.message}`,
      );
    }
  }

  async addVariantUsage(userId: string, variantBytes: number): Promise<void> {
    const usedKey = `quota:${userId}:used`;
    await this.cacheService.incrBy(usedKey, variantBytes);

    await this.quotaRepository
      .createQueryBuilder()
      .update(UserStorageQuota)
      .set({
        usedBytes: () => `"usedBytes" + ${variantBytes}`,
      })
      .where('user_id = :userId', { userId })
      .execute();
  }

  async reclaimUsage(userId: string, bytes: number): Promise<void> {
    const usedKey = `quota:${userId}:used`;
    const current = await this.getUsedBytes(userId);
    const newUsed = Math.max(0, Number(current) - bytes);
    await this.cacheService.set(usedKey, newUsed, 600);

    await this.quotaRepository
      .createQueryBuilder()
      .update(UserStorageQuota)
      .set({
        usedBytes: () => `GREATEST("usedBytes" - ${bytes}, 0)`,
        imageCount: () => 'GREATEST("imageCount" - 1, 0)',
      })
      .where('user_id = :userId', { userId })
      .execute();
  }

  async getUsedBytes(userId: string): Promise<number> {
    const key = `quota:${userId}:used`;
    const cached = await this.cacheService.getNumber(key);

    if (cached > 0) {
      return cached;
    }

    const quota = await this.getOrCreateQuota(userId);
    await this.cacheService.set(key, Number(quota.usedBytes), 600);
    return Number(quota.usedBytes);
  }

  async getPendingBytes(userId: string): Promise<number> {
    const key = `quota:${userId}:pending`;
    return this.cacheService.getNumber(key);
  }

  async getQuotaSummary(userId: string): Promise<{
    tierName: string;
    limitBytes: number;
    usedBytes: number;
    pendingBytes: number;
    availableBytes: number;
    usedPercent: number;
    imageCount: number;
    upgradeRequired: boolean;
  }> {
    const quota = await this.getOrCreateQuota(userId);
    const usedBytes = await this.getUsedBytes(userId);
    const pendingBytes = await this.getPendingBytes(userId);
    const limitBytes = Number(quota.limitBytes);
    const availableBytes = Math.max(
      0,
      limitBytes - Number(usedBytes) - pendingBytes,
    );
    const usedPercent =
      limitBytes > 0
        ? Math.round((Number(usedBytes) / limitBytes) * 10000) / 100
        : 0;

    return {
      tierName: quota.tierName,
      limitBytes,
      usedBytes: Number(usedBytes),
      pendingBytes,
      availableBytes,
      usedPercent,
      imageCount: quota.imageCount,
      upgradeRequired: availableBytes <= 0,
    };
  }

  async reconcileQuota(
    userId: string,
    actualUsedBytes: number,
    actualImageCount: number,
  ): Promise<void> {
    await this.quotaRepository.update(
      { userId },
      { usedBytes: actualUsedBytes, imageCount: actualImageCount },
    );

    const usedKey = `quota:${userId}:used`;
    await this.cacheService.set(usedKey, actualUsedBytes, 600);

    this.logger.log(
      `Quota reconciled for user ${userId}: ${actualUsedBytes} bytes, ${actualImageCount} images`,
    );
  }
}
