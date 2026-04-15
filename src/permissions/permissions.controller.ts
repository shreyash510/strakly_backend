import {
  Controller,
  Get,
  Post,
  Body,
  UseGuards,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiBearerAuth,
} from '@nestjs/swagger';
import { PermissionsService } from './permissions.service';
import { AssignRolePermissionsDto } from './dto/permission.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles, CurrentUser } from '../auth/decorators';
import type { AuthenticatedUser } from '../auth/strategies/jwt.strategy';
import { NotificationsGateway } from '../notifications/notifications.gateway';

@ApiTags('permissions')
@Controller('permissions')
export class PermissionsController {
  constructor(
    private readonly permissionsService: PermissionsService,
    private readonly notificationsGateway: NotificationsGateway,
  ) {}

  // ============ PERMISSIONS ============

  @Get()
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get all permissions' })
  findAll() {
    return this.permissionsService.findAllPermissions();
  }

  // ============ ROLE PERMISSIONS ============

  @Get('roles')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get all roles with their permissions' })
  getAllRolesWithPermissions() {
    return this.permissionsService.getAllRolesWithPermissions();
  }

  @Post('role/assign')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('superadmin', 'admin')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Assign permissions to a role (replaces existing)' })
  async assignPermissionsToRole(@Body() dto: AssignRolePermissionsDto) {
    const result = await this.permissionsService.assignPermissionsToRole(dto);
    this.notificationsGateway.emitPermissionChangedGlobal({ action: 'role_assigned' });
    return result;
  }

  // ============ CURRENT USER PERMISSIONS ============

  @Get('me/codes')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get current user permission codes' })
  getMyPermissionCodes(@CurrentUser() user: AuthenticatedUser) {
    return this.permissionsService.getUserPermissionCodes(
      user.userId,
      user.gymId,
      user.role,
      user.isImpersonating,
    );
  }
}
