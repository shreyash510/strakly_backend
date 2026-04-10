import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
} from '@nestjs/common';
import { Observable } from 'rxjs';

/**
 * Reads the x-branch-id header (sent by the frontend branch switcher)
 * and sets req.user.branchId so that downstream code (resolveEffectiveBranchId,
 * @OptionalBranchId decorator, etc.) can use it without query-param plumbing.
 *
 * Runs AFTER JWT auth guard, so req.user is already populated.
 */
@Injectable()
export class BranchContextInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    const req = context.switchToHttp().getRequest();
    const headerValue = req.headers['x-branch-id'];

    if (headerValue && typeof headerValue === 'string' && req.user) {
      const parsed = parseInt(headerValue, 10);
      if (!isNaN(parsed) && parsed > 0) {
        // Only override if user doesn't already have a locked branchId
        // (non-admin single-branch users keep their token branchId)
        if (
          req.user.role === 'admin' ||
          req.user.role === 'superadmin' ||
          req.user.role === 'manager'
        ) {
          req.user.branchId = parsed;
        } else if (req.user.branchIds?.includes(parsed)) {
          // Multi-branch staff: allow switching between their assigned branches
          req.user.branchId = parsed;
        }
      }
    }

    return next.handle();
  }
}
