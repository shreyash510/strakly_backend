import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  Query,
  ParseIntPipe,
  UseGuards,
} from '@nestjs/common';
import {
  ApiTags,
  ApiBearerAuth,
  ApiOperation,
  ApiParam,
} from '@nestjs/swagger';
import { EquipmentService } from './equipment.service';
import {
  CreateEquipmentDto,
  UpdateEquipmentDto,
  CreateMaintenanceDto,
  UpdateMaintenanceDto,
  EquipmentFiltersDto,
  MaintenanceFiltersDto,
} from './dto/equipment.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { PlanFeaturesGuard } from '../auth/guards/plan-features.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { PlanFeatures } from '../auth/decorators/plan-features.decorator';
import { GymId } from '../common/decorators/gym-id.decorator';
import { OptionalBranchId } from '../common/decorators/branch-id.decorator';
import { PLAN_FEATURES } from '../common/constants/features';

@ApiTags('equipment')
@Controller('equipment')
@UseGuards(JwtAuthGuard, RolesGuard, PlanFeaturesGuard)
@PlanFeatures(PLAN_FEATURES.EQUIPMENT_TRACKING)
@ApiBearerAuth()
export class EquipmentController {
  constructor(private readonly equipmentService: EquipmentService) {}

  @Get()
  @Roles('admin', 'branch_admin', 'manager')
  @ApiOperation({ summary: 'List all equipment' })
  findAll(
    @GymId() gymId: number,
    @OptionalBranchId() branchId: number | null,
    @Query() filters: EquipmentFiltersDto,
  ) {
    return this.equipmentService.findAll(gymId, branchId, filters);
  }

  @Get('stats')
  @Roles('admin', 'branch_admin', 'manager')
  @ApiOperation({ summary: 'Get equipment statistics' })
  getStats(
    @GymId() gymId: number,
    @OptionalBranchId() branchId: number | null,
  ) {
    return this.equipmentService.getStats(gymId, branchId);
  }

  @Get('maintenance/upcoming')
  @Roles('admin', 'branch_admin', 'manager')
  @ApiOperation({ summary: 'Get upcoming maintenance across all equipment' })
  getUpcomingMaintenance(
    @GymId() gymId: number,
    @OptionalBranchId() branchId: number | null,
    @Query() filters: MaintenanceFiltersDto,
  ) {
    return this.equipmentService.getUpcomingMaintenance(
      gymId,
      branchId,
      filters,
    );
  }

  // Maintenance sub-resource routes MUST be defined before :id routes
  @Get(':id/maintenance')
  @Roles('admin', 'branch_admin', 'manager')
  @ApiOperation({ summary: 'Get maintenance records for equipment' })
  @ApiParam({ name: 'id', type: Number })
  getMaintenanceForEquipment(
    @Param('id', ParseIntPipe) equipmentId: number,
    @GymId() gymId: number,
    @Query() filters: MaintenanceFiltersDto,
  ) {
    return this.equipmentService.getMaintenanceForEquipment(
      equipmentId,
      gymId,
      filters,
    );
  }

  @Post(':id/maintenance')
  @Roles('admin', 'branch_admin', 'manager')
  @ApiOperation({ summary: 'Create maintenance record' })
  @ApiParam({ name: 'id', type: Number })
  createMaintenance(
    @Param('id', ParseIntPipe) equipmentId: number,
    @GymId() gymId: number,
    @OptionalBranchId() branchId: number | null,
    @Body() dto: CreateMaintenanceDto,
  ) {
    return this.equipmentService.createMaintenance(
      equipmentId,
      gymId,
      branchId,
      dto,
    );
  }

  @Patch('maintenance/:id')
  @Roles('admin', 'branch_admin', 'manager')
  @ApiOperation({ summary: 'Update maintenance record' })
  @ApiParam({ name: 'id', type: Number })
  updateMaintenance(
    @Param('id', ParseIntPipe) maintenanceId: number,
    @GymId() gymId: number,
    @Body() dto: UpdateMaintenanceDto,
  ) {
    return this.equipmentService.updateMaintenance(maintenanceId, gymId, dto);
  }

  @Delete('maintenance/:id')
  @Roles('admin', 'branch_admin')
  @ApiOperation({ summary: 'Delete maintenance record' })
  @ApiParam({ name: 'id', type: Number })
  removeMaintenance(
    @Param('id', ParseIntPipe) maintenanceId: number,
    @GymId() gymId: number,
  ) {
    return this.equipmentService.softDeleteMaintenance(maintenanceId, gymId);
  }

  // Equipment CRUD routes (generic :id routes come after specific routes)
  @Get(':id')
  @Roles('admin', 'branch_admin', 'manager')
  @ApiOperation({ summary: 'Get equipment by ID' })
  @ApiParam({ name: 'id', type: Number })
  findOne(
    @Param('id', ParseIntPipe) id: number,
    @GymId() gymId: number,
  ) {
    return this.equipmentService.findOne(id, gymId);
  }

  @Post()
  @Roles('admin', 'branch_admin', 'manager')
  @ApiOperation({ summary: 'Create equipment' })
  create(
    @GymId() gymId: number,
    @OptionalBranchId() branchId: number | null,
    @Body() dto: CreateEquipmentDto,
  ) {
    return this.equipmentService.create(gymId, branchId, dto);
  }

  @Patch(':id')
  @Roles('admin', 'branch_admin', 'manager')
  @ApiOperation({ summary: 'Update equipment' })
  @ApiParam({ name: 'id', type: Number })
  update(
    @Param('id', ParseIntPipe) id: number,
    @GymId() gymId: number,
    @Body() dto: UpdateEquipmentDto,
  ) {
    return this.equipmentService.update(id, gymId, dto);
  }

  @Delete(':id')
  @Roles('admin', 'branch_admin')
  @ApiOperation({ summary: 'Delete equipment' })
  @ApiParam({ name: 'id', type: Number })
  remove(
    @Param('id', ParseIntPipe) id: number,
    @GymId() gymId: number,
  ) {
    return this.equipmentService.softDelete(id, gymId);
  }
}
