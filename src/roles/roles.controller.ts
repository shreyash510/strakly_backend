import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  UseGuards,
} from '@nestjs/common';
import { RolesService } from './roles.service';
import { CreateRoleDto } from './dto/create-role.dto';
import { JwtAuthGuard, RolesGuard } from '../auth/guards';
import { Roles, CurrentUser } from '../auth/decorators';
import { SystemRoles } from '../common/constants';

@Controller('roles')
@UseGuards(JwtAuthGuard, RolesGuard)
export class RolesController {
  constructor(private readonly rolesService: RolesService) {}

  @Post()
  @Roles(SystemRoles.SUPER_ADMIN)
  create(@Body() createRoleDto: CreateRoleDto, @CurrentUser() user: any) {
    return this.rolesService.create(createRoleDto, user.userId);
  }

  @Get()
  findAll() {
    return this.rolesService.findAll();
  }

  @Get('permissions')
  findAllPermissions() {
    return this.rolesService.findAllPermissions();
  }

  @Get('permissions/system')
  findSystemPermissions() {
    return this.rolesService.findPermissionsByLevel('system');
  }

  @Get('permissions/gym')
  findGymPermissions() {
    return this.rolesService.findPermissionsByLevel('gym');
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.rolesService.findOne(id);
  }

  @Get(':id/permissions')
  getRolePermissions(@Param('id') id: string) {
    return this.rolesService.getRolePermissions(id);
  }

  @Post(':id/permissions/:permissionId')
  @Roles(SystemRoles.SUPER_ADMIN)
  assignPermission(
    @Param('id') roleId: string,
    @Param('permissionId') permissionId: string,
    @CurrentUser() user: any,
  ) {
    return this.rolesService.assignPermissionToRole(roleId, permissionId, user.userId);
  }

  @Post('seed')
  @Roles(SystemRoles.SUPER_ADMIN)
  seedDefaults() {
    return this.rolesService.seedDefaultRolesAndPermissions();
  }
}
