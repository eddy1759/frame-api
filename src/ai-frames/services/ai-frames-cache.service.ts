import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHash } from 'crypto';
import { CacheService } from '../../common/services';

@Injectable()
export class AiFramesCacheService {
  constructor(
    private readonly cacheService: CacheService,
    private readonly configService: ConfigService,
  ) {}

  async getJobStatus<T>(jobId: string): Promise<T | null> {
    return this.cacheService.get<T>(`ai-frames:job:${jobId}:status`);
  }

  async setJobStatus<T>(jobId: string, value: T): Promise<void> {
    await this.cacheService.set(
      `ai-frames:job:${jobId}:status`,
      value,
      this.statusTtl,
    );
  }

  async getJobResult<T>(jobId: string): Promise<T | null> {
    return this.cacheService.get<T>(`ai-frames:job:${jobId}:result`);
  }

  async setJobResult<T>(jobId: string, value: T): Promise<void> {
    await this.cacheService.set(
      `ai-frames:job:${jobId}:result`,
      value,
      this.statusTtl,
    );
  }

  async invalidateJob(jobId: string): Promise<void> {
    await this.cacheService.del(`ai-frames:job:${jobId}:status`);
    await this.cacheService.del(`ai-frames:job:${jobId}:result`);
  }

  async getUserJobs<T>(
    userId: string,
    params: Record<string, unknown>,
  ): Promise<T | null> {
    const version = await this.getUserJobsVersion(userId);
    const hash = this.hashParams(params);
    return this.cacheService.get<T>(
      `ai-frames:user:${userId}:jobs:v${version}:${hash}`,
    );
  }

  async setUserJobs<T>(
    userId: string,
    params: Record<string, unknown>,
    value: T,
  ): Promise<void> {
    const version = await this.getUserJobsVersion(userId);
    const hash = this.hashParams(params);
    await this.cacheService.set(
      `ai-frames:user:${userId}:jobs:v${version}:${hash}`,
      value,
      this.jobListTtl,
    );
  }

  async invalidateUserJobs(userId: string): Promise<void> {
    await this.cacheService.increment(`ai-frames:user:${userId}:jobs:version`);
  }

  private async getUserJobsVersion(userId: string): Promise<number> {
    return this.cacheService.getNumber(`ai-frames:user:${userId}:jobs:version`);
  }

  private hashParams(params: Record<string, unknown>): string {
    return createHash('sha256')
      .update(JSON.stringify(params))
      .digest('hex')
      .slice(0, 16);
  }

  private get statusTtl(): number {
    return this.configService.get<number>('ai.statusCacheTtl', 30);
  }

  private get jobListTtl(): number {
    return this.configService.get<number>('ai.jobListCacheTtl', 120);
  }
}
