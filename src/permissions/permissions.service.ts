import { Injectable, NotFoundException } from '@nestjs/common';
import { DatabaseService } from '../database/database.service';
import { CreatePermissionDto, ManagerPermissionsDto } from './dto/create-permission.dto';
import { UpdatePermissionDto } from './dto/update-permission.dto';
import { DEFAULT_MANAGER_PERMISSIONS, ManagerPermissions, CrudPermissions, ReadOnlyPermissions } from '../database/schemas/permission.schema';

export interface Permission {
  id: string;
  userId: string;
  permissions: ManagerPermissions;
  createdAt: string;
  updatedAt: string;
}

@Injectable()
export class PermissionsService {
  private readonly collectionName = 'permissions';

  constructor(private readonly databaseService: DatabaseService) {}

  /**
   * Get permissions for a specific user
   * @param adminUserId - The admin user making the request (for database context)
   * @param targetUserId - The user whose permissions to retrieve
   */
  async getPermissionsByUserId(adminUserId: string, targetUserId: string): Promise<Permission | null> {
    // Query permissions by the target user's ID
    const permissions = await this.databaseService.getCollection<Permission>(
      this.collectionName,
      adminUserId,
    );

    const userPermission = permissions.find(p => p.userId === targetUserId);
    return userPermission || null;
  }

  /**
   * Create permissions for a user
   * @param adminUserId - The admin user making the request (for database context)
   * @param targetUserId - The user to create permissions for
   * @param createPermissionDto - The permission data to create
   */
  async createPermissions(
    adminUserId: string,
    targetUserId: string,
    createPermissionDto: CreatePermissionDto,
  ): Promise<Permission> {
    // Check if permissions already exist for this user
    const existingPermissions = await this.getPermissionsByUserId(adminUserId, targetUserId);
    if (existingPermissions) {
      throw new Error(`Permissions already exist for user ${targetUserId}`);
    }

    const permissionData = {
      userId: targetUserId,
      permissions: this.mergeWithDefaults(createPermissionDto.permissions),
    };

    return this.databaseService.createDocument<Permission>(
      this.collectionName,
      adminUserId,
      permissionData,
    );
  }

  /**
   * Update permissions for a user
   * @param adminUserId - The admin user making the request (for database context)
   * @param targetUserId - The user whose permissions to update
   * @param updatePermissionDto - The permission data to update
   */
  async updatePermissions(
    adminUserId: string,
    targetUserId: string,
    updatePermissionDto: UpdatePermissionDto,
  ): Promise<Permission> {
    const existingPermissions = await this.getPermissionsByUserId(adminUserId, targetUserId);

    if (!existingPermissions) {
      throw new NotFoundException(`Permissions not found for user ${targetUserId}`);
    }

    const updatedPermissions = this.mergePermissions(
      existingPermissions.permissions,
      updatePermissionDto.permissions,
    );

    const permission = await this.databaseService.updateDocument<Permission>(
      this.collectionName,
      adminUserId,
      existingPermissions.id,
      { permissions: updatedPermissions },
    );

    if (!permission) {
      throw new NotFoundException(`Failed to update permissions for user ${targetUserId}`);
    }

    return permission;
  }

  /**
   * Delete permissions for a user
   * @param adminUserId - The admin user making the request (for database context)
   * @param targetUserId - The user whose permissions to delete
   */
  async deletePermissions(adminUserId: string, targetUserId: string): Promise<{ success: boolean }> {
    const existingPermissions = await this.getPermissionsByUserId(adminUserId, targetUserId);

    if (!existingPermissions) {
      throw new NotFoundException(`Permissions not found for user ${targetUserId}`);
    }

    await this.databaseService.deleteDocument(
      this.collectionName,
      adminUserId,
      existingPermissions.id,
    );

    return { success: true };
  }

  /**
   * Merge provided permissions with default permissions
   */
  private mergeWithDefaults(permissions?: ManagerPermissionsDto): ManagerPermissions {
    if (!permissions) {
      return { ...DEFAULT_MANAGER_PERMISSIONS };
    }

    return {
      users: this.mergeCrudPermissions(DEFAULT_MANAGER_PERMISSIONS.users, permissions.users),
      trainers: this.mergeCrudPermissions(DEFAULT_MANAGER_PERMISSIONS.trainers, permissions.trainers),
      programs: this.mergeCrudPermissions(DEFAULT_MANAGER_PERMISSIONS.programs, permissions.programs),
      announcements: this.mergeCrudPermissions(DEFAULT_MANAGER_PERMISSIONS.announcements, permissions.announcements),
      challenges: this.mergeCrudPermissions(DEFAULT_MANAGER_PERMISSIONS.challenges, permissions.challenges),
      rewards: this.mergeCrudPermissions(DEFAULT_MANAGER_PERMISSIONS.rewards, permissions.rewards),
      reports: this.mergeReadOnlyPermissions(DEFAULT_MANAGER_PERMISSIONS.reports, permissions.reports),
    };
  }

  /**
   * Merge existing permissions with new permissions
   */
  private mergePermissions(
    existing: ManagerPermissions,
    updates?: ManagerPermissionsDto,
  ): ManagerPermissions {
    if (!updates) {
      return existing;
    }

    return {
      users: this.mergeCrudPermissions(existing.users, updates.users),
      trainers: this.mergeCrudPermissions(existing.trainers, updates.trainers),
      programs: this.mergeCrudPermissions(existing.programs, updates.programs),
      announcements: this.mergeCrudPermissions(existing.announcements, updates.announcements),
      challenges: this.mergeCrudPermissions(existing.challenges, updates.challenges),
      rewards: this.mergeCrudPermissions(existing.rewards, updates.rewards),
      reports: this.mergeReadOnlyPermissions(existing.reports, updates.reports),
    };
  }

  /**
   * Merge CRUD permissions ensuring all values are boolean
   */
  private mergeCrudPermissions(
    base: CrudPermissions,
    updates?: { create?: boolean; read?: boolean; update?: boolean; delete?: boolean },
  ): CrudPermissions {
    return {
      create: updates?.create ?? base.create,
      read: updates?.read ?? base.read,
      update: updates?.update ?? base.update,
      delete: updates?.delete ?? base.delete,
    };
  }

  /**
   * Merge read-only permissions ensuring all values are boolean
   */
  private mergeReadOnlyPermissions(
    base: ReadOnlyPermissions,
    updates?: { read?: boolean },
  ): ReadOnlyPermissions {
    return {
      read: updates?.read ?? base.read,
    };
  }
}
