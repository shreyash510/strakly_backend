import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Body,
  Param,
  Headers,
  UnauthorizedException,
  NotFoundException,
} from '@nestjs/common';
import { PermissionsService } from './permissions.service';
import { CreatePermissionDto } from './dto/create-permission.dto';
import { UpdatePermissionDto } from './dto/update-permission.dto';

@Controller('permissions')
export class PermissionsController {
  constructor(private readonly permissionsService: PermissionsService) {}

  private getUserId(authHeader: string): string {
    if (!authHeader) {
      throw new UnauthorizedException('User ID header is required');
    }
    return authHeader;
  }

  /**
   * GET /permissions/:userId
   * Get permissions for a specific user
   */
  @Get(':userId')
  async getPermissions(
    @Headers('x-user-id') adminUserId: string,
    @Param('userId') targetUserId: string,
  ) {
    const permissions = await this.permissionsService.getPermissionsByUserId(
      this.getUserId(adminUserId),
      targetUserId,
    );

    if (!permissions) {
      throw new NotFoundException(`Permissions not found for user ${targetUserId}`);
    }

    return permissions;
  }

  /**
   * POST /permissions/:userId
   * Create permissions for a user
   */
  @Post(':userId')
  async createPermissions(
    @Headers('x-user-id') adminUserId: string,
    @Param('userId') targetUserId: string,
    @Body() createPermissionDto: CreatePermissionDto,
  ) {
    return this.permissionsService.createPermissions(
      this.getUserId(adminUserId),
      targetUserId,
      createPermissionDto,
    );
  }

  /**
   * PUT /permissions/:userId
   * Update permissions for a user
   */
  @Put(':userId')
  async updatePermissions(
    @Headers('x-user-id') adminUserId: string,
    @Param('userId') targetUserId: string,
    @Body() updatePermissionDto: UpdatePermissionDto,
  ) {
    return this.permissionsService.updatePermissions(
      this.getUserId(adminUserId),
      targetUserId,
      updatePermissionDto,
    );
  }

  /**
   * DELETE /permissions/:userId
   * Delete permissions for a user
   */
  @Delete(':userId')
  async deletePermissions(
    @Headers('x-user-id') adminUserId: string,
    @Param('userId') targetUserId: string,
  ) {
    return this.permissionsService.deletePermissions(
      this.getUserId(adminUserId),
      targetUserId,
    );
  }
}
