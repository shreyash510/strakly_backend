import {
  createParamDecorator,
  ExecutionContext,
  ForbiddenException,
} from '@nestjs/common';
import { AuthenticatedUser } from '../../auth/strategies/jwt.strategy';

/**
 * Extract branchId from the authenticated user.
 * Throws ForbiddenException if branchId is not set (required for branch-specific operations).
 *
 * Usage:
 * ```typescript
 * @Get('plans')
 * findPlans(@BranchId() branchId: number) {
 *   // branchId is guaranteed to be a number
 * }
 * ```
 */
export const BranchId = createParamDecorator(
  (data: unknown, ctx: ExecutionContext): number => {
    const request = ctx.switchToHttp().getRequest();
    const user = request.user as AuthenticatedUser;

    if (user?.branchId === null || user?.branchId === undefined) {
      throw new ForbiddenException(
        'Branch context required for this operation',
      );
    }

    return user.branchId;
  },
);

/**
 * Extract branchId from the authenticated user, or return null if not set.
 * Use this when the operation can work with or without a branch context
 * (e.g., admins who have access to all branches).
 *
 * Usage:
 * ```typescript
 * @Get('members')
 * findMembers(@OptionalBranchId() branchId: number | null) {
 *   if (branchId) {
 *     // Filter by branch
 *   } else {
 *     // Return all branches
 *   }
 * }
 * ```
 */
export const OptionalBranchId = createParamDecorator(
  (data: unknown, ctx: ExecutionContext): number | null => {
    const request = ctx.switchToHttp().getRequest();
    const user = request.user as AuthenticatedUser;
    return user?.branchId ?? null;
  },
);
