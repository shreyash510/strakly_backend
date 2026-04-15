import {
  Injectable,
  CanActivate,
  ExecutionContext,
  BadRequestException,
} from '@nestjs/common';

/**
 * Guard that ensures a user has selected a specific branch (not "All Branches" mode).
 * Blocks create/edit/delete operations when branchId is null.
 * Safety net for the frontend's axios interceptor block.
 *
 * NOTE: NestJS runs guards before interceptors, so BranchContextInterceptor has not
 * yet copied x-branch-id into req.user.branchId when this guard executes.
 * For admin/manager/superadmin we therefore read the header directly here,
 * mirroring the interceptor's acceptance logic.
 */
@Injectable()
export class RequireBranchGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const req = context.switchToHttp().getRequest();

    // Non-admin users have branchId locked into their token/DB record.
    if (req.user?.branchId) {
      return true;
    }

    // Admin/manager/superadmin select a branch via the x-branch-id header.
    // BranchContextInterceptor writes this into req.user.branchId later,
    // but we need to validate it now before that interceptor runs.
    const role = req.user?.role;
    if (role === 'admin' || role === 'superadmin' || role === 'manager') {
      const headerValue = req.headers?.['x-branch-id'];
      if (headerValue) {
        const parsed = parseInt(String(headerValue), 10);
        if (!isNaN(parsed) && parsed > 0) {
          return true;
        }
      }
    }

    throw new BadRequestException(
      'Please select a specific branch before creating or editing records.',
    );
  }
}
