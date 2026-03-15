import { SetMetadata } from '@nestjs/common';

export const MANAGER_PERMISSION_KEY = 'managerPermission';

export interface ManagerPermissionMeta {
  module: string;
  action: 'create' | 'read' | 'update' | 'delete';
}

export const ManagerPermission = (
  module: string,
  action: 'create' | 'read' | 'update' | 'delete',
) => SetMetadata(MANAGER_PERMISSION_KEY, { module, action } as ManagerPermissionMeta);
