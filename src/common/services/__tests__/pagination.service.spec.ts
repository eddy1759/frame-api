import { PaginationService } from '../pagination.service';

describe('PaginationService', () => {
  let service: PaginationService;

  beforeEach(() => {
    service = new PaginationService();
  });

  it('resolves defaults when page and limit are missing', () => {
    expect(service.resolve({})).toEqual({
      page: 1,
      limit: 20,
      skip: 0,
      take: 20,
    });
  });

  it('clamps values to valid bounds', () => {
    expect(service.resolve({ page: 0, limit: 200 })).toEqual({
      page: 1,
      limit: 100,
      skip: 0,
      take: 100,
    });
  });

  it('builds pagination metadata', () => {
    expect(service.buildMeta(45, 2, 20)).toEqual({
      pagination: {
        page: 2,
        limit: 20,
        total: 45,
        totalPages: 3,
        hasNext: true,
        hasPrevious: true,
      },
    });
  });

  it('keeps totalPages at minimum 1 for empty results', () => {
    expect(service.buildMeta(0, 1, 20)).toEqual({
      pagination: {
        page: 1,
        limit: 20,
        total: 0,
        totalPages: 1,
        hasNext: false,
        hasPrevious: false,
      },
    });
  });
});
