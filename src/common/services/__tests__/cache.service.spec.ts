import { RedisService } from '../../redis/redis.service';
import { CacheService } from '../cache.service';

describe('CacheService', () => {
  let service: CacheService;
  let redisService: jest.Mocked<RedisService>;

  beforeEach(() => {
    redisService = {
      get: jest.fn(),
      set: jest.fn(),
      del: jest.fn(),
      deleteByPattern: jest.fn(),
      zIncrBy: jest.fn(),
      zRevRangeWithScores: jest.fn(),
      zRangeWithScores: jest.fn(),
    } as unknown as jest.Mocked<RedisService>;

    service = new CacheService(redisService);
  });

  it('reads and parses cached values', async () => {
    redisService.get.mockResolvedValueOnce(JSON.stringify({ ok: true }));
    await expect(service.get<{ ok: boolean }>('key')).resolves.toEqual({
      ok: true,
    });
  });

  it('returns null when key is missing', async () => {
    redisService.get.mockResolvedValueOnce(null);
    await expect(service.get('missing')).resolves.toBeNull();
  });

  it('returns null when cache payload is invalid JSON', async () => {
    redisService.get.mockResolvedValueOnce('{bad-json');
    await expect(service.get('bad')).resolves.toBeNull();
  });

  it('serializes values on set', async () => {
    await service.set('k', { hello: 'world' }, 60);
    expect(redisService.set).toHaveBeenCalledWith(
      'k',
      JSON.stringify({ hello: 'world' }),
      60,
    );
  });

  it('delegates deletion and pattern invalidation', async () => {
    await service.del('k1');
    await service.invalidateByPattern('frames:list:*');

    expect(redisService.del).toHaveBeenCalledWith('k1');
    expect(redisService.deleteByPattern).toHaveBeenCalledWith('frames:list:*');
  });

  it('returns null from zIncrBy on redis error', async () => {
    redisService.zIncrBy.mockRejectedValueOnce(new Error('redis down'));
    await expect(
      service.zIncrBy('popular:frames:applies', 1, 'frame-1'),
    ).resolves.toBeNull();
  });

  it('returns empty arrays for sorted set reads on redis error', async () => {
    redisService.zRevRangeWithScores.mockRejectedValueOnce(
      new Error('redis down'),
    );
    redisService.zRangeWithScores.mockRejectedValueOnce(
      new Error('redis down'),
    );

    await expect(service.zRevRangeWithScores('k', 0, 10)).resolves.toEqual([]);
    await expect(service.zRangeWithScores('k', 0, 10)).resolves.toEqual([]);
  });
});
