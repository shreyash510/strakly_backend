import {
  createParamDecorator,
  ExecutionContext,
  ForbiddenException,
} from '@nestjs/common';
import { AuthenticatedUser } from '../../auth/strategies/jwt.strategy';

/**
 * Parameter decorator that extracts and validates gymId from the authenticated user.
 * Throws ForbiddenException if gymId is null (e.g., for superadmin users).
 *
 * @example
 * ```typescript
 * @Get()
 * findAll(@GymId() gymId: number) {
 *   return this.service.findAll(gymId);
 * }
 * ```
 */
export const GymId = createParamDecorator(
  (data: unknown, ctx: ExecutionContext): number => {
    const request = ctx.switchToHttp().getRequest();
    const user = request.user as AuthenticatedUser;

    if (!user) {
      throw new ForbiddenException('User not authenticated');
    }

    if (user.gymId === null || user.gymId === undefined) {
      throw new ForbiddenException('This operation requires a gym context');
    }

    return user.gymId;
  },
);

/**
 * Parameter decorator that extracts gymId from the authenticated user.
 * Returns null if gymId is not set (useful for superadmin operations).
 *
 * @example
 * ```typescript
 * @Get()
 * findAll(@OptionalGymId() gymId: number | null) {
 *   if (gymId) {
 *     return this.service.findAllForGym(gymId);
 *   }
 *   return this.service.findAllGlobal();
 * }
 * ```
 */
export const OptionalGymId = createParamDecorator(
  (data: unknown, ctx: ExecutionContext): number | null => {
    const request = ctx.switchToHttp().getRequest();
    const user = request.user as AuthenticatedUser;

    if (!user) {
      return null;
    }

    return user.gymId;
  },
);
