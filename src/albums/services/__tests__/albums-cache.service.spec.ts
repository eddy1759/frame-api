import { AlbumsCacheService } from '../albums-cache.service';

describe('AlbumsCacheService', () => {
  const cacheService = {
    get: jest.fn(),
    set: jest.fn(),
    del: jest.fn(),
    getNumber: jest.fn(),
    increment: jest.fn(),
  };

  let service: AlbumsCacheService;

  beforeEach(() => {
    jest.clearAllMocks();
    cacheService.getNumber.mockResolvedValue(2);
    service = new AlbumsCacheService(cacheService as never);
  });

  it('includes the per-album item list version in album item cache keys', async () => {
    cacheService.get.mockResolvedValue({ data: [] });

    await service.getAlbumItems('album-1', { page: 1, limit: 20 });

    expect(cacheService.get).toHaveBeenCalledWith(
      expect.stringMatching(/^album:album-1:items:v2:/),
    );
  });

  it('bumps the shared search version key on search invalidation', async () => {
    await service.bumpSearchVersion();

    expect(cacheService.increment).toHaveBeenCalledWith(
      'albums:search:version',
    );
  });
});
