import { BadRequestException, ForbiddenException } from '@nestjs/common';

/**
 * Helper to resolve gymId for operations that support both:
 * - Regular users (gymId from token)
 * - Superadmins (gymId from query parameter)
 *
 * @param tokenGymId - gymId from the authenticated user's token (null for superadmins)
 * @param queryGymId - gymId from query parameter (optional)
 * @param isSuperAdmin - whether the user is a superadmin
 * @returns The resolved gymId
 * @throws ForbiddenException if no valid gymId can be resolved
 *
 * @example
 * ```typescript
 * // In controller method:
 * const gymId = resolveGymId(user.gymId, queryGymId, user.role === 'superadmin');
 * ```
 */
export function resolveGymId(
  tokenGymId: number | null,
  queryGymId?: string,
  isSuperAdmin?: boolean,
): number {
  // If user has gymId in token, use it
  if (tokenGymId !== null) {
    return tokenGymId;
  }

  // For superadmin, require gymId from query
  if (isSuperAdmin && queryGymId) {
    const parsed = parseInt(queryGymId, 10);
    if (isNaN(parsed)) {
      throw new BadRequestException('Invalid gymId parameter');
    }
    return parsed;
  }

  throw new ForbiddenException(
    'This operation requires a gym context. Superadmins must provide gymId query parameter.',
  );
}

/**
 * Resolves the effective branchId for a request.
 *
 * - admin / superadmin: honours the query param freely (null = all branches)
 * - non-admin with multiple allowed branches: query param is used only if it
 *   appears in the user's branchIds list; otherwise falls back to primary branchId
 * - non-admin with a single branch: always locked to their branchId, query
 *   param is ignored
 */
export function resolveEffectiveBranchId(
  user: { role: string; branchId?: number | null; branchIds?: number[] },
  queryBranchId?: string,
): number | null {
  if (user.role === 'admin' || user.role === 'superadmin') {
    return queryBranchId ? parseInt(queryBranchId, 10) : null;
  }

  // Multi-branch non-admin: allow switching between their assigned branches
  const allowedBranchIds = user.branchIds ?? [];
  if (allowedBranchIds.length > 1 && queryBranchId) {
    const requested = parseInt(queryBranchId, 10);
    if (allowedBranchIds.includes(requested)) {
      return requested;
    }
  }

  // Single-branch or unrecognised query param: locked to primary branch
  return user.branchId ?? null;
}

/**
 * Optional version that returns null instead of throwing for operations
 * that can work without a gym context.
 */
export function resolveOptionalGymId(
  tokenGymId: number | null,
  queryGymId?: string,
): number | null {
  if (tokenGymId !== null) {
    return tokenGymId;
  }

  if (queryGymId) {
    const parsed = parseInt(queryGymId, 10);
    if (!isNaN(parsed)) {
      return parsed;
    }
  }

  return null;
}
