import type { Response } from 'express';

export interface PaginationParams {
  page?: number;
  limit?: number;
  search?: string;
  noPagination?: boolean;
}

export interface PaginationMeta {
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

export interface PaginatedResponse<T> {
  data: T[];
  pagination: PaginationMeta;
}

export function getPaginationParams(query: Record<string, any>): {
  page: number;
  limit: number;
  skip: number;
  take: number;
  noPagination: boolean;
} {
  const page = Math.max(1, parseInt(query.page) || 1);
  const limit = Math.min(100, Math.max(1, parseInt(query.limit) || 10));
  const noPagination =
    query.noPagination === 'true' || query.noPagination === true;

  return {
    page,
    limit,
    skip: noPagination ? 0 : (page - 1) * limit,
    take: noPagination ? 5000 : Math.min(limit, 100),
    noPagination,
  };
}

export function createPaginationMeta(
  total: number,
  page: number,
  limit: number,
  noPagination: boolean = false,
): PaginationMeta {
  return {
    total,
    page: noPagination ? 1 : page,
    limit: noPagination ? total : limit,
    totalPages: noPagination ? 1 : Math.ceil(total / limit),
  };
}

/**
 * Sanitize raw pagination inputs to enforce safe bounds.
 * Use this in services that don't go through getPaginationParams.
 */
export function sanitizePagination(
  page?: number,
  limit?: number,
  defaultLimit = 10,
): { page: number; limit: number; skip: number } {
  const safePage = Math.max(1, page || 1);
  const safeLimit = Math.min(Math.max(1, limit || defaultLimit), 100);
  return {
    page: safePage,
    limit: safeLimit,
    skip: (safePage - 1) * safeLimit,
  };
}

export function setPaginationHeaders(
  res: Response,
  pagination: PaginationMeta,
): void {
  res.setHeader('X-Total-Count', pagination.total.toString());
  res.setHeader('X-Page', pagination.page.toString());
  res.setHeader('X-Per-Page', pagination.limit.toString());
  res.setHeader('X-Total-Pages', pagination.totalPages.toString());

  // Allow these headers to be read by frontend
  res.setHeader(
    'Access-Control-Expose-Headers',
    'X-Total-Count, X-Page, X-Per-Page, X-Total-Pages',
  );
}
