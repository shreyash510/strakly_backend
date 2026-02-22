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
import { PlanFeaturesGuard } from '../auth/guards/plan-features.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { PlanFeatures } from '../auth/decorators/plan-features.decorator';
import { PLAN_FEATURES } from '../common/constants/features';
import { NotificationsGateway } from '../notifications/notifications.gateway';
import type { AuthenticatedRequest } from '../common/types';

@ApiTags('facilities')
@Controller('facilities')
@UseGuards(JwtAuthGuard, PlanFeaturesGuard)
@PlanFeatures(PLAN_FEATURES.AMENITIES_MANAGEMENT)
@ApiBearerAuth()
export class FacilitiesController {
  constructor(
    private readonly facilitiesService: FacilitiesService,
    private readonly notificationsGateway: NotificationsGateway,
  ) {}

  private resolveBranchId(req: AuthenticatedRequest, queryBranchId?: string): number | null {
    // If user has a specific branch assigned, they can only see their branch
    if (req.user.branchId !== null && req.user.branchId !== undefined) {
      return req.user.branchId;
    }
    // User is admin with access to all branches - use query param if provided
    if (queryBranchId && queryBranchId !== 'all' && queryBranchId !== '') {
      return parseInt(queryBranchId);
    }
    return null; // all branches
  }

  @Get()
  @ApiOperation({ summary: 'Get all facilities' })
  @ApiQuery({ name: 'includeInactive', required: false, type: Boolean })
  @ApiQuery({
    name: 'branchId',
    required: false,
    type: Number,
    description: 'Branch ID for filtering (admin only)',
  })
  findAll(
    @Request() req: AuthenticatedRequest,
    @Query('includeInactive') includeInactive?: string,
    @Query('branchId') queryBranchId?: string,
  ) {
    const branchId = this.resolveBranchId(req, queryBranchId);
    return this.facilitiesService.findAll(
      req.user.gymId!,
      branchId,
      includeInactive === 'true',
    );
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get facility by ID' })
  @ApiQuery({
    name: 'branchId',
    required: false,
    type: Number,
    description: 'Branch ID for filtering (admin only)',
  })
  findOne(
    @Request() req: AuthenticatedRequest,
    @Param('id', ParseIntPipe) id: number,
    @Query('branchId') queryBranchId?: string,
  ) {
    const branchId = this.resolveBranchId(req, queryBranchId);
    return this.facilitiesService.findOne(id, req.user.gymId!, branchId);
  }

  @Post()
  @UseGuards(RolesGuard)
  @Roles('superadmin', 'admin', 'branch_admin', 'manager')
  @ApiOperation({ summary: 'Create a new facility' })
  @ApiQuery({
    name: 'branchId',
    required: false,
    type: Number,
    description: 'Branch ID for the facility (admin only)',
  })
  async create(
    @Request() req: AuthenticatedRequest,
    @Body() dto: CreateFacilityDto,
    @Query('branchId') queryBranchId?: string,
  ) {
    const branchId = this.resolveBranchId(req, queryBranchId);
    const result = await this.facilitiesService.create(dto, req.user.gymId!, branchId);
    this.notificationsGateway.emitFacilityChanged(req.user.gymId!, { action: 'created' });
    return result;
  }

  @Patch(':id')
  @UseGuards(RolesGuard)
  @Roles('superadmin', 'admin', 'branch_admin', 'manager')
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
  @UseGuards(RolesGuard)
  @Roles('superadmin', 'admin', 'branch_admin', 'manager')
  @ApiOperation({ summary: 'Delete a facility (soft delete)' })
  async delete(@Request() req: AuthenticatedRequest, @Param('id', ParseIntPipe) id: number) {
    const result = await this.facilitiesService.delete(id, req.user.gymId!);
    this.notificationsGateway.emitFacilityChanged(req.user.gymId!, { action: 'deleted' });
    return result;
  }
}
