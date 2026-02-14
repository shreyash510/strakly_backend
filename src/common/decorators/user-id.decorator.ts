import {
  createParamDecorator,
  ExecutionContext,
  ForbiddenException,
} from '@nestjs/common';
import { AuthenticatedUser } from '../../auth/strategies/jwt.strategy';

/**
 * Parameter decorator that extracts userId from the authenticated user.
 *
 * @example
 * ```typescript
 * @Get('profile')
 * getProfile(@UserId() userId: number) {
 *   return this.service.getProfile(userId);
 * }
 * ```
 */
export const UserId = createParamDecorator(
  (data: unknown, ctx: ExecutionContext): number => {
    const request = ctx.switchToHttp().getRequest();
    const user = request.user as AuthenticatedUser;

    if (!user || !user.userId) {
      throw new ForbiddenException('User not authenticated');
    }

    return user.userId;
  },
);

/**
 * Parameter decorator that extracts the user's role from the authenticated user.
 *
 * @example
 * ```typescript
 * @Patch(':id/status')
 * updateStatus(@CurrentUserRole() role: string) {
 *   // role = 'admin' | 'client' | etc.
 * }
 * ```
 */
export const CurrentUserRole = createParamDecorator(
  (data: unknown, ctx: ExecutionContext): string => {
    const request = ctx.switchToHttp().getRequest();
    const user = request.user as AuthenticatedUser;

    if (!user) {
      throw new ForbiddenException('User not authenticated');
    }

    return user.role || 'client';
  },
);

/**
 * Parameter decorator that extracts the full authenticated user object.
 *
 * @example
 * ```typescript
 * @Get('profile')
 * getProfile(@CurrentUser() user: AuthenticatedUser) {
 *   return this.service.getProfile(user.userId, user.gymId);
 * }
 * ```
 */
export const CurrentUser = createParamDecorator(
  (data: unknown, ctx: ExecutionContext): AuthenticatedUser => {
    const request = ctx.switchToHttp().getRequest();
    const user = request.user as AuthenticatedUser;

    if (!user) {
      throw new ForbiddenException('User not authenticated');
    }

    return user;
  },
);
