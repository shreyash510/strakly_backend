import { createParamDecorator, ExecutionContext, ForbiddenException } from '@nestjs/common';
import { AuthenticatedUser } from '../../auth/strategies/jwt.strategy';

/**
 * Extract branchId from the authenticated user.
 * Throws ForbiddenException if branchId is not set.
 */
export const BranchId = createParamDecorator(
  (data: unknown, ctx: ExecutionContext): number => {
    const request = ctx.switchToHttp().getRequest();
    const user = request.user as AuthenticatedUser;

    if (user?.branchId === null || user?.branchId === undefined) {
      throw new ForbiddenException('Branch context required for this operation');
    }

    return user.branchId;
  },
);

/**
 * Extract branchId from the authenticated user, or return null if not set.
 * Use when the operation can work with or without a branch context
 * (e.g., admins who have access to all branches).
 */
export const OptionalBranchId = createParamDecorator(
  (data: unknown, ctx: ExecutionContext): number | null => {
    const request = ctx.switchToHttp().getRequest();
    const user = request.user as AuthenticatedUser;
    return user?.branchId ?? null;
  },
);
