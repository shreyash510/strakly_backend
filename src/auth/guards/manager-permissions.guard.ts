import {
  Injectable,
  CanActivate,
  ExecutionContext,
  ForbiddenException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import {
  MANAGER_PERMISSION_KEY,
  type ManagerPermissionMeta,
} from '../decorators/manager-permission.decorator';
import { TenantService } from '../../tenant/tenant.service';
import { ROLES } from '../../common/constants';

@Injectable()
export class ManagerPermissionsGuard implements CanActivate {
  constructor(
    private reflector: Reflector,
    private tenantService: TenantService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const permission =
      this.reflector.getAllAndOverride<ManagerPermissionMeta>(
        MANAGER_PERMISSION_KEY,
        [context.getHandler(), context.getClass()],
      );

    // No @ManagerPermission decorator → allow
    if (!permission) {
      return true;
    }

    const request = context.switchToHttp().getRequest();
    const user = request.user;

    if (!user || !user.userId) {
      throw new ForbiddenException('User not authenticated');
    }

    // Superadmin and admin bypass manager permission checks
    if (
      user.isSuperAdmin ||
      user.role === ROLES.SUPERADMIN ||
      user.role === ROLES.ADMIN
    ) {
      return true;
    }

    // Only enforce for managers and cashiers — other roles are handled by RolesGuard
    if (user.role !== ROLES.MANAGER && user.role !== ROLES.CASHIER) {
      return true;
    }

    const gymId = user.gymId;
    if (!gymId) {
      throw new ForbiddenException('Gym context required');
    }

    // Load manager/cashier permissions from tenant DB
    const managerPermissions = await this.tenantService.executeInTenant(
      gymId,
      async (client) => {
        const result = await client.query(
          `SELECT manager_permissions FROM users WHERE id = $1`,
          [user.userId],
        );
        return result.rows[0]?.manager_permissions || null;
      },
    );

    if (!managerPermissions) {
      // No permissions configured — allow all (backward compat).
      // Once permissions are set, deny anything not explicitly granted.
      return true;
    }

    const modulePerms = managerPermissions[permission.module];
    if (!modulePerms) {
      throw new ForbiddenException(
        `You do not have permission to ${permission.action} ${permission.module}`,
      );
    }

    const allowed = modulePerms[permission.action];
    if (allowed !== true) {
      throw new ForbiddenException(
        `You do not have permission to ${permission.action} ${permission.module}`,
      );
    }

    return true;
  }
}
