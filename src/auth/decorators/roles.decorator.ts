import { SetMetadata } from '@nestjs/common';
import type { UserRole } from '../../common/constants';

export const ROLES_KEY = 'roles';
export const Roles = (...roles: UserRole[]) => SetMetadata(ROLES_KEY, roles);
