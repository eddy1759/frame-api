import { ForbiddenException, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { EntityManager, Repository } from 'typeorm';
import { UserStorageQuota } from '../entities/user-storage-quota.entity';
import { StorageTier } from '../types/image.types';

@Injectable()
export class StorageQuotaService {
  private readonly logger = new Logger(StorageQuotaService.name);

  constructor(
    @InjectRepository(UserStorageQuota)
    private readonly quotaRepository: Repository<UserStorageQuota>,
    private readonly configService: ConfigService,
  ) {}

  async getOrCreateQuota(
    userId: string,
    manager?: EntityManager,
  ): Promise<UserStorageQuota> {
    const repo = this.getRepository(manager);
    let quota = await repo.findOne({ where: { userId } });

    if (!quota) {
      quota = repo.create({
        userId,
        tierName: StorageTier.FREE,
        limitBytes: this.defaultStorageLimit,
        usedBytes: 0,
        pendingBytes: 0,
        imageCount: 0,
      });

      try {
        quota = await repo.save(quota);
      } catch {
        const existing = await repo.findOne({ where: { userId } });
        if (!existing) {
          throw new Error(`Failed to initialize quota for user ${userId}`);
        }
        quota = existing;
      }
    }

    return quota;
  }

  async checkQuotaAvailability(
    userId: string,
    requiredBytes: number,
    manager?: EntityManager,
  ): Promise<void> {
    if (requiredBytes <= 0) {
      throw new Error('requiredBytes must be greater than zero');
    }

    const quota = manager
      ? await this.getQuotaForUpdate(userId, manager)
      : await this.getOrCreateQuota(userId);

    const usedBytes = Number(quota.usedBytes);
    const pendingBytes = Number(quota.pendingBytes);
    const limitBytes = Number(quota.limitBytes);

    if (usedBytes + pendingBytes + requiredBytes > limitBytes) {
      throw new ForbiddenException({
        code: 'STORAGE_QUOTA_EXCEEDED',
        message: 'Storage quota exceeded for this upload request.',
      });
    }
  }

  async reservePending(
    userId: string,
    bytes: number,
    manager?: EntityManager,
  ): Promise<void> {
    if (bytes <= 0) {
      return;
    }

    if (!manager) {
      await this.quotaRepository.manager.transaction(async (txManager) => {
        await this.reservePending(userId, bytes, txManager);
      });
      return;
    }

    const repo = this.getRepository(manager);
    const quota = await this.getQuotaForUpdate(userId, manager);
    const nextPending = Number(quota.pendingBytes) + bytes;

    if (Number(quota.usedBytes) + nextPending > Number(quota.limitBytes)) {
      throw new ForbiddenException({
        code: 'STORAGE_QUOTA_EXCEEDED',
        message: 'Storage quota exceeded for this upload request.',
      });
    }

    quota.pendingBytes = nextPending;
    await repo.save(quota);
  }

  async releasePending(
    userId: string,
    bytes: number,
    manager?: EntityManager,
  ): Promise<void> {
    if (bytes <= 0) {
      return;
    }

    if (!manager) {
      await this.quotaRepository.manager.transaction(async (txManager) => {
        await this.releasePending(userId, bytes, txManager);
      });
      return;
    }

    const repo = this.getRepository(manager);
    const quota = await this.getQuotaForUpdate(userId, manager);

    quota.pendingBytes = Math.max(0, Number(quota.pendingBytes) - bytes);
    await repo.save(quota);
  }

  async confirmUsage(
    userId: string,
    actualBytes: number,
    reservedBytes: number,
    manager?: EntityManager,
  ): Promise<void> {
    if (actualBytes <= 0) {
      throw new Error('actualBytes must be greater than zero');
    }

    if (reservedBytes < 0) {
      throw new Error('reservedBytes cannot be negative');
    }

    if (!manager) {
      await this.quotaRepository.manager.transaction(async (txManager) => {
        await this.confirmUsage(userId, actualBytes, reservedBytes, txManager);
      });
      return;
    }

    const repo = this.getRepository(manager);
    const quota = await this.getQuotaForUpdate(userId, manager);
    const nextPending = Math.max(0, Number(quota.pendingBytes) - reservedBytes);
    const nextUsed = Number(quota.usedBytes) + actualBytes;

    if (nextUsed + nextPending > Number(quota.limitBytes)) {
      throw new ForbiddenException({
        code: 'STORAGE_QUOTA_EXCEEDED',
        message: 'Storage quota exceeded after validating the uploaded file.',
      });
    }

    quota.pendingBytes = nextPending;
    quota.usedBytes = nextUsed;
    quota.imageCount = Number(quota.imageCount) + 1;

    await repo.save(quota);
  }

  async addVariantUsage(
    userId: string,
    variantBytes: number,
    manager?: EntityManager,
  ): Promise<void> {
    if (variantBytes <= 0) {
      return;
    }

    if (!manager) {
      await this.quotaRepository.manager.transaction(async (txManager) => {
        await this.addVariantUsage(userId, variantBytes, txManager);
      });
      return;
    }

    const repo = this.getRepository(manager);
    const quota = await this.getQuotaForUpdate(userId, manager);

    quota.usedBytes = Number(quota.usedBytes) + variantBytes;
    await repo.save(quota);
  }

  async reclaimUsage(
    userId: string,
    bytes: number,
    manager?: EntityManager,
  ): Promise<void> {
    if (bytes <= 0) {
      return;
    }

    if (!manager) {
      await this.quotaRepository.manager.transaction(async (txManager) => {
        await this.reclaimUsage(userId, bytes, txManager);
      });
      return;
    }

    const repo = this.getRepository(manager);
    const quota = await this.getQuotaForUpdate(userId, manager);

    quota.usedBytes = Math.max(0, Number(quota.usedBytes) - bytes);
    quota.imageCount = Math.max(0, Number(quota.imageCount) - 1);
    await repo.save(quota);
  }

  async reclaimVariantUsage(
    userId: string,
    bytes: number,
    manager?: EntityManager,
  ): Promise<void> {
    if (bytes <= 0) {
      return;
    }

    if (!manager) {
      await this.quotaRepository.manager.transaction(async (txManager) => {
        await this.reclaimVariantUsage(userId, bytes, txManager);
      });
      return;
    }

    const repo = this.getRepository(manager);
    const quota = await this.getQuotaForUpdate(userId, manager);

    quota.usedBytes = Math.max(0, Number(quota.usedBytes) - bytes);
    await repo.save(quota);
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
    const limitBytes = Number(quota.limitBytes);
    const usedBytes = Number(quota.usedBytes);
    const pendingBytes = Number(quota.pendingBytes);
    const availableBytes = Math.max(0, limitBytes - usedBytes - pendingBytes);
    const usedPercent =
      limitBytes > 0 ? Math.round((usedBytes / limitBytes) * 10000) / 100 : 0;

    return {
      tierName: quota.tierName,
      limitBytes,
      usedBytes,
      pendingBytes,
      availableBytes,
      usedPercent,
      imageCount: Number(quota.imageCount),
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
      {
        usedBytes: actualUsedBytes,
        imageCount: actualImageCount,
      },
    );

    this.logger.log(
      `Quota reconciled for user ${userId}: ${actualUsedBytes} bytes, ${actualImageCount} images`,
    );
  }

  private get defaultStorageLimit(): number {
    return this.configService.get<number>(
      'image.defaultStorageLimit',
      5368709120,
    );
  }

  private getRepository(manager?: EntityManager): Repository<UserStorageQuota> {
    return manager
      ? manager.getRepository(UserStorageQuota)
      : this.quotaRepository;
  }

  private async getQuotaForUpdate(
    userId: string,
    manager: EntityManager,
  ): Promise<UserStorageQuota> {
    const repo = this.getRepository(manager);
    let quota = await repo
      .createQueryBuilder('quota')
      .setLock('pessimistic_write')
      .where('quota.userId = :userId', { userId })
      .getOne();

    if (!quota) {
      quota = repo.create({
        userId,
        tierName: StorageTier.FREE,
        limitBytes: this.defaultStorageLimit,
        usedBytes: 0,
        pendingBytes: 0,
        imageCount: 0,
      });
      await repo.save(quota);

      quota = await repo
        .createQueryBuilder('quota')
        .setLock('pessimistic_write')
        .where('quota.userId = :userId', { userId })
        .getOne();
    }

    if (!quota) {
      throw new Error(`Quota row not found for user ${userId}`);
    }

    return quota;
  }
}
