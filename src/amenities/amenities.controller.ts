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
import { AmenitiesService } from './amenities.service';
import { CreateAmenityDto } from './dto/create-amenity.dto';
import { UpdateAmenityDto } from './dto/update-amenity.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { ManagerPermissionsGuard } from '../auth/guards/manager-permissions.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { ManagerPermission } from '../auth/decorators/manager-permission.decorator';
import { NotificationsGateway } from '../notifications/notifications.gateway';
import type { AuthenticatedRequest } from '../common/types';

@ApiTags('amenities')
@Controller('amenities')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class AmenitiesController {
  constructor(
    private readonly amenitiesService: AmenitiesService,
    private readonly notificationsGateway: NotificationsGateway,
  ) {}

  @Get()
  @ApiOperation({ summary: 'Get all amenities' })
  @ApiQuery({ name: 'includeInactive', required: false, type: Boolean })
  @ApiQuery({ name: 'branchId', required: false, type: Number })
  findAll(
    @Request() req: AuthenticatedRequest,
    @Query('includeInactive') includeInactive?: string,
    @Query('branchId') branchId?: string,
  ) {
    return this.amenitiesService.findAll(
      req.user.gymId!,
      includeInactive === 'true',
      branchId ? parseInt(branchId) : null,
    );
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get amenity by ID' })
  findOne(
    @Request() req: AuthenticatedRequest,
    @Param('id', ParseIntPipe) id: number,
  ) {
    return this.amenitiesService.findOne(id, req.user.gymId!);
  }

  @Post()
  @UseGuards(RolesGuard, ManagerPermissionsGuard)
  @Roles('superadmin', 'admin', 'manager')
  @ManagerPermission('amenities', 'create')
  @ApiOperation({ summary: 'Create a new amenity' })
  async create(
    @Request() req: AuthenticatedRequest,
    @Body() dto: CreateAmenityDto,
  ) {
    const result = await this.amenitiesService.create(dto, req.user.gymId!);
    this.notificationsGateway.emitAmenityChanged(req.user.gymId!, { action: 'created' });
    return result;
  }

  @Patch(':id')
  @UseGuards(RolesGuard, ManagerPermissionsGuard)
  @Roles('superadmin', 'admin', 'manager')
  @ManagerPermission('amenities', 'update')
  @ApiOperation({ summary: 'Update an amenity' })
  async update(
    @Request() req: AuthenticatedRequest,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateAmenityDto,
  ) {
    const result = await this.amenitiesService.update(id, req.user.gymId!, dto);
    this.notificationsGateway.emitAmenityChanged(req.user.gymId!, { action: 'updated' });
    return result;
  }

  @Delete(':id')
  @UseGuards(RolesGuard, ManagerPermissionsGuard)
  @Roles('superadmin', 'admin', 'manager')
  @ManagerPermission('amenities', 'delete')
  @ApiOperation({ summary: 'Delete an amenity (soft delete)' })
  async delete(@Request() req: AuthenticatedRequest, @Param('id', ParseIntPipe) id: number) {
    const result = await this.amenitiesService.delete(id, req.user.gymId!);
    this.notificationsGateway.emitAmenityChanged(req.user.gymId!, { action: 'deleted' });
    return result;
  }
}
