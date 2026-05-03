import { ConfigService } from '@nestjs/config';
import { AiFramesCacheService } from '../ai-frames-cache.service';

describe('AiFramesCacheService', () => {
  const cacheService = {
    get: jest.fn(),
    set: jest.fn(),
    del: jest.fn(),
    getNumber: jest.fn(),
    increment: jest.fn(),
  };

  let service: AiFramesCacheService;

  beforeEach(() => {
    jest.clearAllMocks();
    cacheService.getNumber.mockResolvedValue(3);

    service = new AiFramesCacheService(
      cacheService as never,
      {
        get: jest.fn((key: string, fallback?: unknown) => {
          if (key === 'ai.statusCacheTtl') return 45;
          if (key === 'ai.jobListCacheTtl') return 120;
          return fallback;
        }),
      } as unknown as ConfigService,
    );
  });

  it('stores job status entries with the configured TTL', async () => {
    await service.setJobStatus('job-1', { status: 'queued' });

    expect(cacheService.set).toHaveBeenCalledWith(
      'ai-frames:job:job-1:status',
      { status: 'queued' },
      45,
    );
  });

  it('includes the per-user jobs version in job list cache keys', async () => {
    cacheService.get.mockResolvedValue({ data: [], meta: {} });

    await service.getUserJobs('user-1', { page: 1, limit: 20 });

    expect(cacheService.get).toHaveBeenCalledWith(
      expect.stringMatching(/^ai-frames:user:user-1:jobs:v3:/),
    );
  });

  it('bumps the per-user jobs version on invalidation', async () => {
    await service.invalidateUserJobs('user-1');

    expect(cacheService.increment).toHaveBeenCalledWith(
      'ai-frames:user:user-1:jobs:version',
    );
  });
});
