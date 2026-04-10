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
 */
@Injectable()
export class RequireBranchGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const req = context.switchToHttp().getRequest();
    if (!req.user?.branchId) {
      throw new BadRequestException(
        'Please select a specific branch before creating or editing records.',
      );
    }
    return true;
  }
}
