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
