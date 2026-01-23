import { Injectable, NotFoundException, ConflictException } from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';
import { CreatePermissionDto, UpdatePermissionDto, AssignRolePermissionsDto } from './dto/permission.dto';

@Injectable()
export class PermissionsService {
  constructor(private readonly prisma: PrismaService) {}

  // ============ PERMISSIONS ============

  async findAllPermissions() {
    return this.prisma.permission.findMany({
      where: { isActive: true },
      orderBy: [{ module: 'asc' }, { code: 'asc' }],
    });
  }

  async findPermissionsByModule(module: string) {
    return this.prisma.permission.findMany({
      where: { module, isActive: true },
      orderBy: { code: 'asc' },
    });
  }

  async findPermissionByCode(code: string) {
    const permission = await this.prisma.permission.findUnique({
      where: { code },
    });

    if (!permission) {
      throw new NotFoundException(`Permission with code ${code} not found`);
    }

    return permission;
  }

  async createPermission(dto: CreatePermissionDto) {
    const existing = await this.prisma.permission.findUnique({
      where: { code: dto.code },
    });

    if (existing) {
      throw new ConflictException(`Permission with code ${dto.code} already exists`);
    }

    return this.prisma.permission.create({
      data: dto,
    });
  }

  async updatePermission(code: string, dto: UpdatePermissionDto) {
    await this.findPermissionByCode(code);

    return this.prisma.permission.update({
      where: { code },
      data: dto,
    });
  }

  async deletePermission(code: string) {
    await this.findPermissionByCode(code);

    return this.prisma.permission.update({
      where: { code },
      data: { isActive: false },
    });
  }

  // ============ ROLE PERMISSIONS ============

  async getPermissionsByRole(role: string) {
    const rolePermissions = await this.prisma.rolePermissionXref.findMany({
      where: { role },
      include: {
        permission: true,
      },
    });

    return rolePermissions.map(rp => rp.permission);
  }

  async getPermissionCodesByRole(role: string) {
    const permissions = await this.getPermissionsByRole(role);
    return permissions.map(p => p.code);
  }

  async getAllRolesWithPermissions() {
    const rolePermissions = await this.prisma.rolePermissionXref.findMany({
      include: {
        permission: true,
      },
      orderBy: { role: 'asc' },
    });

    // Group by role
    const grouped: Record<string, any[]> = {};
    for (const rp of rolePermissions) {
      if (!grouped[rp.role]) {
        grouped[rp.role] = [];
      }
      grouped[rp.role].push(rp.permission);
    }

    return grouped;
  }

  async assignPermissionsToRole(dto: AssignRolePermissionsDto) {
    const { role, permissionCodes } = dto;

    // Delete existing role permissions
    await this.prisma.rolePermissionXref.deleteMany({
      where: { role },
    });

    // Create new role permissions
    const results: any[] = [];
    for (const code of permissionCodes) {
      const permission = await this.prisma.permission.findUnique({
        where: { code },
      });

      if (!permission) {
        continue;
      }

      const created = await this.prisma.rolePermissionXref.create({
        data: {
          role,
          permissionId: permission.id,
        },
        include: {
          permission: true,
        },
      });
      results.push(created);
    }

    return results;
  }

  async addPermissionToRole(role: string, permissionCode: string) {
    const permission = await this.findPermissionByCode(permissionCode);

    const existing = await this.prisma.rolePermissionXref.findUnique({
      where: {
        role_permissionId: {
          role,
          permissionId: permission.id,
        },
      },
    });

    if (existing) {
      throw new ConflictException(`Role ${role} already has permission ${permissionCode}`);
    }

    return this.prisma.rolePermissionXref.create({
      data: {
        role,
        permissionId: permission.id,
      },
      include: {
        permission: true,
      },
    });
  }

  async removePermissionFromRole(role: string, permissionCode: string) {
    const permission = await this.findPermissionByCode(permissionCode);

    const existing = await this.prisma.rolePermissionXref.findUnique({
      where: {
        role_permissionId: {
          role,
          permissionId: permission.id,
        },
      },
    });

    if (!existing) {
      throw new NotFoundException(`Role ${role} does not have permission ${permissionCode}`);
    }

    await this.prisma.rolePermissionXref.delete({
      where: {
        role_permissionId: {
          role,
          permissionId: permission.id,
        },
      },
    });

    return { success: true };
  }

  // ============ USER PERMISSIONS (via role) ============

  async getUserPermissions(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: parseInt(userId) },
      include: { role: true },
    });

    if (!user) {
      throw new NotFoundException(`User with ID ${userId} not found`);
    }

    // Get role code from the lookup relation
    const roleCode = user.role?.code || 'member';
    return this.getPermissionsByRole(roleCode);
  }

  async getUserPermissionCodes(userId: string) {
    const permissions = await this.getUserPermissions(userId);
    return permissions.map(p => p.code);
  }

  async userHasPermission(userId: string, permissionCode: string): Promise<boolean> {
    const permissionCodes = await this.getUserPermissionCodes(userId);
    return permissionCodes.includes(permissionCode);
  }
}
