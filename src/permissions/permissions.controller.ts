import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  Headers,
  UseGuards,
  BadRequestException,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiHeader } from '@nestjs/swagger';
import { PermissionsService } from './permissions.service';
import { CreatePermissionDto, UpdatePermissionDto, AssignRolePermissionsDto } from './dto/permission.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles, GymId, UserId, CurrentUser } from '../auth/decorators';
import type { AuthenticatedUser } from '../auth/strategies/jwt.strategy';

@ApiTags('permissions')
@Controller('permissions')
export class PermissionsController {
  constructor(private readonly permissionsService: PermissionsService) {}

  // ============ PERMISSIONS ============

  @Get()
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get all permissions' })
  findAll() {
    return this.permissionsService.findAllPermissions();
  }

  @Get('module/:module')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get permissions by module' })
  findByModule(@Param('module') module: string) {
    return this.permissionsService.findPermissionsByModule(module);
  }

  @Get('code/:code')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get permission by code' })
  findByCode(@Param('code') code: string) {
    return this.permissionsService.findPermissionByCode(code);
  }

  @Post()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('superadmin', 'admin')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Create a new permission' })
  create(@Body() dto: CreatePermissionDto) {
    return this.permissionsService.createPermission(dto);
  }

  @Patch(':code')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('superadmin', 'admin')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Update a permission' })
  update(@Param('code') code: string, @Body() dto: UpdatePermissionDto) {
    return this.permissionsService.updatePermission(code, dto);
  }

  @Delete(':code')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('superadmin')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Delete a permission (soft delete)' })
  delete(@Param('code') code: string) {
    return this.permissionsService.deletePermission(code);
  }

  // ============ ROLE PERMISSIONS ============

  @Get('roles')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get all roles with their permissions' })
  getAllRolesWithPermissions() {
    return this.permissionsService.getAllRolesWithPermissions();
  }

  @Get('role/:role')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get permissions for a specific role' })
  getPermissionsByRole(@Param('role') role: string) {
    return this.permissionsService.getPermissionsByRole(role);
  }

  @Post('role/assign')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('superadmin', 'admin')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Assign permissions to a role (replaces existing)' })
  assignPermissionsToRole(@Body() dto: AssignRolePermissionsDto) {
    return this.permissionsService.assignPermissionsToRole(dto);
  }

  @Post('role/:role/permission/:permissionCode')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('superadmin', 'admin')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Add a single permission to a role' })
  addPermissionToRole(
    @Param('role') role: string,
    @Param('permissionCode') permissionCode: string,
  ) {
    return this.permissionsService.addPermissionToRole(role, permissionCode);
  }

  @Delete('role/:role/permission/:permissionCode')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('superadmin', 'admin')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Remove a permission from a role' })
  removePermissionFromRole(
    @Param('role') role: string,
    @Param('permissionCode') permissionCode: string,
  ) {
    return this.permissionsService.removePermissionFromRole(role, permissionCode);
  }

  // ============ CURRENT USER PERMISSIONS ============

  @Get('me')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get current user permissions' })
  getMyPermissions(@CurrentUser() user: AuthenticatedUser) {
    return this.permissionsService.getUserPermissions(user.userId, user.gymId, user.role, user.isImpersonating);
  }

  @Get('me/codes')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get current user permission codes' })
  getMyPermissionCodes(@CurrentUser() user: AuthenticatedUser) {
    return this.permissionsService.getUserPermissionCodes(user.userId, user.gymId, user.role, user.isImpersonating);
  }

  // ============ USER PERMISSIONS (admin - userId from header) ============

  @Get('user')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('superadmin', 'admin', 'manager')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get permissions for a specific user' })
  @ApiHeader({ name: 'x-user-id', required: true, description: 'Target user ID' })
  getUserPermissions(@CurrentUser() user: AuthenticatedUser, @Headers('x-user-id') userId: string) {
    if (!userId) throw new BadRequestException('x-user-id header is required');
    return this.permissionsService.getUserPermissions(parseInt(userId), user.gymId);
  }

  @Get('user/codes')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('superadmin', 'admin', 'manager')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get permission codes for a specific user' })
  @ApiHeader({ name: 'x-user-id', required: true, description: 'Target user ID' })
  getUserPermissionCodes(@CurrentUser() user: AuthenticatedUser, @Headers('x-user-id') userId: string) {
    if (!userId) throw new BadRequestException('x-user-id header is required');
    return this.permissionsService.getUserPermissionCodes(parseInt(userId), user.gymId);
  }
}
