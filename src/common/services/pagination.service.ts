import { Injectable } from '@nestjs/common';

export interface PaginationParams {
  page: number;
  limit: number;
}

export interface PaginationResult {
  page: number;
  limit: number;
  skip: number;
  take: number;
}

export interface PaginatedResult<T> {
  data: T[];
  meta: PaginationMeta;
}

export interface PaginationMeta {
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
    hasNext: boolean;
    hasPrevious: boolean;
  };
}

@Injectable()
export class PaginationService {
  resolve(params: Partial<PaginationParams>): PaginationResult {
    const page = Math.max(1, params.page ?? 1);
    const limit = Math.min(100, Math.max(1, params.limit ?? 20));

    return {
      page,
      limit,
      skip: (page - 1) * limit,
      take: limit,
    };
  }

  buildMeta(total: number, page: number, limit: number): PaginationMeta {
    const totalPages = Math.max(1, Math.ceil(total / limit));

    return {
      pagination: {
        page,
        limit,
        total,
        totalPages,
        hasNext: page < totalPages,
        hasPrevious: page > 1,
      },
    };
  }
}
