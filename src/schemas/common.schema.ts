import { z } from 'zod';
import { createZodDto } from 'nestjs-zod';

// ============================================
// PAGINATION SCHEMAS
// ============================================

/**
 * Standard pagination query parameters
 */
export const paginationQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(10),
  search: z.string().optional(),
  sortBy: z.string().optional(),
  sortOrder: z.enum(['asc', 'desc']).default('desc'),
  noPagination: z
    .enum(['true', 'false'])
    .transform((v) => v === 'true')
    .optional(),
});

/**
 * Pagination response metadata
 */
export const paginationMetaSchema = z.object({
  total: z.number().int(),
  page: z.number().int(),
  limit: z.number().int(),
  totalPages: z.number().int(),
});

// ============================================
// COMMON PARAM SCHEMAS
// ============================================

/**
 * ID path parameter
 */
export const idParamSchema = z.object({
  id: z.coerce.number().int().positive(),
});

/**
 * Multiple IDs in request body
 */
export const idsBodySchema = z.object({
  ids: z.array(z.number().int().positive()).min(1),
});

// ============================================
// STATUS SCHEMAS
// ============================================

/**
 * Generic active/inactive status
 */
export const activeStatusSchema = z.enum(['active', 'inactive']);

/**
 * Archive action
 */
export const archiveActionSchema = z.object({
  reason: z.string().optional(),
});

// ============================================
// DATE SCHEMAS
// ============================================

/**
 * Date range query
 */
export const dateRangeQuerySchema = z.object({
  startDate: z.string().optional(),
  endDate: z.string().optional(),
});

/**
 * Date string (ISO format or common formats)
 */
export const dateStringSchema = z.string().refine(
  (val) => {
    if (!val) return true;
    const date = new Date(val);
    return !isNaN(date.getTime());
  },
  { message: 'Invalid date format' }
);

// ============================================
// DTO CLASSES (for NestJS controller params)
// ============================================

export class PaginationQueryDto extends createZodDto(paginationQuerySchema) {}
export class IdParamDto extends createZodDto(idParamSchema) {}
export class IdsBodyDto extends createZodDto(idsBodySchema) {}
export class DateRangeQueryDto extends createZodDto(dateRangeQuerySchema) {}

// ============================================
// TYPE EXPORTS
// ============================================

export type PaginationQuery = z.infer<typeof paginationQuerySchema>;
export type PaginationMeta = z.infer<typeof paginationMetaSchema>;
export type IdParam = z.infer<typeof idParamSchema>;
export type IdsBody = z.infer<typeof idsBodySchema>;
export type DateRangeQuery = z.infer<typeof dateRangeQuerySchema>;
