import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  Query,
  UseGuards,
  Request,
  ParseIntPipe,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiBearerAuth,
  ApiQuery,
} from '@nestjs/swagger';
import { FacilitiesService } from './facilities.service';
import { CreateFacilityDto } from './dto/create-facility.dto';
import { UpdateFacilityDto } from './dto/update-facility.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { ManagerPermissionsGuard } from '../auth/guards/manager-permissions.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { ManagerPermission } from '../auth/decorators/manager-permission.decorator';
import { NotificationsGateway } from '../notifications/notifications.gateway';
import type { AuthenticatedRequest } from '../common/types';
import { resolveEffectiveBranchId } from '../common';

@ApiTags('facilities')
@Controller('facilities')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class FacilitiesController {
  constructor(
    private readonly facilitiesService: FacilitiesService,
    private readonly notificationsGateway: NotificationsGateway,
  ) {}

  @Get()
  @ApiOperation({ summary: 'Get all facilities' })
  @ApiQuery({ name: 'includeInactive', required: false, type: Boolean })
  @ApiQuery({ name: 'branchId', required: false, type: Number })
  findAll(
    @Request() req: AuthenticatedRequest,
    @Query('includeInactive') includeInactive?: string,
    @Query('branchId') branchId?: string,
  ) {
    return this.facilitiesService.findAll(
      req.user.gymId!,
      includeInactive === 'true',
      resolveEffectiveBranchId(req.user, branchId),
    );
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get facility by ID' })
  findOne(
    @Request() req: AuthenticatedRequest,
    @Param('id', ParseIntPipe) id: number,
  ) {
    return this.facilitiesService.findOne(id, req.user.gymId!);
  }

  @Post()
  @UseGuards(RolesGuard, ManagerPermissionsGuard)
  @Roles('superadmin', 'admin', 'manager')
  @ManagerPermission('facilities', 'create')
  @ApiOperation({ summary: 'Create a new facility' })
  async create(
    @Request() req: AuthenticatedRequest,
    @Body() dto: CreateFacilityDto,
  ) {
    const result = await this.facilitiesService.create(dto, req.user.gymId!);
    this.notificationsGateway.emitFacilityChanged(req.user.gymId!, { action: 'created' });
    return result;
  }

  @Patch(':id')
  @UseGuards(RolesGuard, ManagerPermissionsGuard)
  @Roles('superadmin', 'admin', 'manager')
  @ManagerPermission('facilities', 'update')
  @ApiOperation({ summary: 'Update a facility' })
  async update(
    @Request() req: AuthenticatedRequest,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateFacilityDto,
  ) {
    const result = await this.facilitiesService.update(id, req.user.gymId!, dto);
    this.notificationsGateway.emitFacilityChanged(req.user.gymId!, { action: 'updated' });
    return result;
  }

  @Delete(':id')
  @UseGuards(RolesGuard, ManagerPermissionsGuard)
  @Roles('superadmin', 'admin', 'manager')
  @ManagerPermission('facilities', 'delete')
  @ApiOperation({ summary: 'Delete a facility (soft delete)' })
  async delete(@Request() req: AuthenticatedRequest, @Param('id', ParseIntPipe) id: number) {
    const result = await this.facilitiesService.delete(id, req.user.gymId!);
    this.notificationsGateway.emitFacilityChanged(req.user.gymId!, { action: 'deleted' });
    return result;
  }
}
