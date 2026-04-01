import { ImagesCacheService } from '../images-cache.service';

describe('ImagesCacheService', () => {
  const cacheService = {
    get: jest.fn(),
    set: jest.fn(),
    del: jest.fn(),
    getNumber: jest.fn(),
    increment: jest.fn(),
  };

  let service: ImagesCacheService;

  beforeEach(() => {
    jest.clearAllMocks();
    cacheService.getNumber.mockResolvedValue(3);
    service = new ImagesCacheService(cacheService as never);
  });

  it('includes the user list cache version in list keys', async () => {
    cacheService.get.mockResolvedValue({ data: [] });

    await service.getImageList('user-1', { page: 1, limit: 20 });

    expect(cacheService.get).toHaveBeenCalledWith(
      expect.stringMatching(/^images:user:user-1:list:v3:/),
    );
  });

  it('bumps the per-user list version on invalidation', async () => {
    await service.invalidateUserLists('user-1');

    expect(cacheService.increment).toHaveBeenCalledWith(
      'images:user:user-1:list:version',
    );
  });
});
