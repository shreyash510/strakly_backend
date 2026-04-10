import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  Query,
  Headers,
  UseGuards,
  Request,
  BadRequestException,
  ParseIntPipe,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiBearerAuth,
  ApiQuery,
  ApiHeader,
} from '@nestjs/swagger';
import { MembershipsService } from './memberships.service';
import {
  CreateMembershipDto,
  UpdateMembershipDto,
  CancelMembershipDto,
  FreezeMembershipDto,
  RenewMembershipDto,
  UpdateMembershipFacilitiesDto,
} from './dto/membership.dto';
import type { AuthenticatedRequest } from '../common/types';
import { resolveEffectiveBranchId } from '../common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { ManagerPermissionsGuard } from '../auth/guards/manager-permissions.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { ManagerPermission } from '../auth/decorators/manager-permission.decorator';
import { NotificationsGateway } from '../notifications/notifications.gateway';

@ApiTags('memberships')
@Controller('memberships')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class MembershipsController {
  constructor(
    private readonly membershipsService: MembershipsService,
    private readonly notificationsGateway: NotificationsGateway,
  ) {}

  @Get()
  @UseGuards(RolesGuard)
  @Roles('superadmin', 'admin', 'manager')
  @ApiOperation({ summary: 'Get all memberships' })
  @ApiQuery({ name: 'status', required: false })
  @ApiQuery({ name: 'planId', required: false })
  @ApiQuery({
    name: 'clientId',
    required: false,
    type: Number,
    description: 'Filter by client ID',
  })
  @ApiQuery({
    name: 'search',
    required: false,
    description: 'Search by user name or email',
  })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  @ApiQuery({
    name: 'gymId',
    required: false,
    type: Number,
    description: 'Gym ID (required for superadmin)',
  })
  findAll(
    @Request() req: AuthenticatedRequest,
    @Query('status') status?: string,
    @Query('clientId') clientId?: string,
    @Query('planId') planId?: string,
    @Query('search') search?: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
    @Query('gymId') queryGymId?: string,
    @Query('branchId') branchId?: string,
  ): Promise<any> {
    const gymId =
      req.user.role === 'superadmin'
        ? queryGymId
          ? parseInt(queryGymId)
          : null
        : req.user.gymId!;

    if (!gymId) {
      throw new BadRequestException('gymId is required');
    }

    return this.membershipsService.findAll(gymId, {
      status,
      userId: clientId ? parseInt(clientId) : undefined,
      planId: planId ? parseInt(planId) : undefined,
      search,
      page: page ? parseInt(page) : undefined,
      limit: limit ? parseInt(limit) : undefined,
      branchId: resolveEffectiveBranchId(req.user, branchId),
    });
  }

  @Get('stats')
  @UseGuards(RolesGuard)
  @Roles('admin', 'manager')
  @ApiOperation({ summary: 'Get membership statistics' })
  getStats(
    @Request() req: AuthenticatedRequest,
    @Query('branchId') branchId?: string,
  ): Promise<any> {
    return this.membershipsService.getStats(req.user.gymId!, resolveEffectiveBranchId(req.user, branchId));
  }

  @Get('overview')
  @UseGuards(RolesGuard)
  @Roles('superadmin', 'admin', 'manager')
  @ApiOperation({
    summary: 'Get membership overview (stats, expiring, recent)',
  })
  @ApiQuery({
    name: 'gymId',
    required: false,
    type: Number,
    description: 'Gym ID (required for superadmin)',
  })
  getOverview(
    @Request() req: AuthenticatedRequest,
    @Query('gymId') queryGymId?: string,
    @Query('branchId') branchId?: string,
  ): Promise<any> {
    const gymId =
      req.user.role === 'superadmin'
        ? queryGymId
          ? parseInt(queryGymId)
          : null
        : req.user.gymId!;

    if (!gymId) {
      throw new BadRequestException('gymId is required');
    }

    return this.membershipsService.getOverview(gymId, resolveEffectiveBranchId(req.user, branchId));
  }

  @Get('expiring')
  @UseGuards(RolesGuard)
  @Roles('admin', 'manager')
  @ApiOperation({ summary: 'Get memberships expiring soon' })
  @ApiQuery({ name: 'days', required: false, type: Number })
  getExpiringSoon(
    @Request() req: AuthenticatedRequest,
    @Query('days') days?: string,
  ): Promise<any> {
    return this.membershipsService.getExpiringSoon(
      req.user.gymId!,
      days ? parseInt(days) : 7,
    );
  }

  @Get('history')
  @UseGuards(RolesGuard)
  @Roles('superadmin', 'admin', 'manager')
  @ApiOperation({ summary: 'Get membership history for a client' })
  @ApiQuery({
    name: 'clientId',
    required: true,
    type: Number,
    description: 'Client user ID',
  })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  getHistory(
    @Request() req: AuthenticatedRequest,
    @Query('clientId') clientId?: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ): Promise<any> {
    if (!clientId) {
      throw new BadRequestException('clientId query parameter is required');
    }
    return this.membershipsService.getHistory(
      parseInt(clientId),
      req.user.gymId!,
      {
        page: page ? parseInt(page) : undefined,
        limit: limit ? parseInt(limit) : undefined,
      },
    );
  }

  @Get('audit-log')
  @UseGuards(RolesGuard)
  @Roles('superadmin', 'admin', 'manager')
  @ApiOperation({ summary: 'Get membership audit log from membership_history table' })
  @ApiQuery({ name: 'clientId', required: true, type: Number })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  getAuditLog(
    @Request() req: AuthenticatedRequest,
    @Query('clientId') clientId?: string,
    @Query('limit') limit?: string,
  ): Promise<any> {
    if (!clientId) {
      throw new BadRequestException('clientId query parameter is required');
    }
    return this.membershipsService.getAuditLog(
      parseInt(clientId),
      req.user.gymId!,
      limit ? parseInt(limit) : 50,
    );
  }

  // ============ CURRENT USER ENDPOINTS ============

  @Get('me')
  @ApiOperation({ summary: 'Get current user memberships' })
  getMyMemberships(@Request() req: AuthenticatedRequest): Promise<any> {
    return this.membershipsService.findByUser(
      req.user.userId,
      req.user.gymId!,
    );
  }

  @Get('me/active')
  @ApiOperation({ summary: 'Get current user active membership' })
  getMyActiveMembership(@Request() req: AuthenticatedRequest): Promise<any> {
    return this.membershipsService.getActiveMembership(
      req.user.userId,
      req.user.gymId!,
    );
  }

  @Get('me/facilities')
  @ApiOperation({
    summary: 'Get facilities for current user active membership',
  })
  async getMyFacilities(@Request() req: AuthenticatedRequest): Promise<any> {
    const activeMembership = await this.membershipsService.getActiveMembership(
      req.user.userId,
      req.user.gymId!,
    );
    if (!activeMembership) {
      return { facilities: [], amenities: [] };
    }
    return this.membershipsService.getMembershipFacilitiesAndAmenities(
      activeMembership.id,
      req.user.gymId!,
    );
  }

  @Post('me/renew')
  @ApiOperation({ summary: 'Renew current user membership' })
  async renewMyMembership(@Request() req: AuthenticatedRequest, @Body() dto: RenewMembershipDto): Promise<any> {
    const result = await this.membershipsService.renew(
      req.user.userId,
      req.user.gymId!,
      dto,
    );
    this.notificationsGateway.emitMembershipChanged(req.user.gymId!, { action: 'renewed' });
    return result;
  }

  // ============ USER-SPECIFIC ENDPOINTS (admin - userId from header) ============

  @Get('user')
  @UseGuards(RolesGuard)
  @Roles('admin', 'manager')
  @ApiOperation({ summary: 'Get memberships for a specific user' })
  @ApiHeader({
    name: 'x-user-id',
    required: true,
    description: 'Target user ID',
  })
  findByUser(
    @Request() req: AuthenticatedRequest,
    @Headers('x-user-id') userId: string,
  ): Promise<any> {
    if (!userId) throw new BadRequestException('x-user-id header is required');
    return this.membershipsService.findByUser(
      parseInt(userId),
      req.user.gymId!,
    );
  }

  @Get('user/active')
  @UseGuards(RolesGuard)
  @Roles('admin', 'manager')
  @ApiOperation({ summary: 'Get active membership for a user' })
  @ApiHeader({
    name: 'x-user-id',
    required: true,
    description: 'Target user ID',
  })
  getActiveMembership(
    @Request() req: AuthenticatedRequest,
    @Headers('x-user-id') userId: string,
  ): Promise<any> {
    if (!userId) throw new BadRequestException('x-user-id header is required');
    return this.membershipsService.getActiveMembership(
      parseInt(userId),
      req.user.gymId!,
    );
  }

  // ============ LOOKUP ENDPOINTS (must be before :id to avoid route shadowing) ============

  @Get('cancellation-reasons/list')
  @UseGuards(RolesGuard)
  @Roles('admin', 'manager')
  @ApiOperation({ summary: 'Get cancellation reasons' })
  async getCancellationReasons(@Request() req: AuthenticatedRequest): Promise<any> {
    return this.membershipsService.getCancellationReasons(req.user.gymId!);
  }

  // ============ INDIVIDUAL MEMBERSHIP ENDPOINTS (by membership ID) ============

  @Get(':id')
  @UseGuards(RolesGuard)
  @Roles('admin', 'manager')
  @ApiOperation({ summary: 'Get membership by ID' })
  findOne(
    @Request() req: AuthenticatedRequest,
    @Param('id', ParseIntPipe) id: number,
  ): Promise<any> {
    return this.membershipsService.findOne(id, req.user.gymId!);
  }

  @Get(':id/facilities')
  @UseGuards(RolesGuard)
  @Roles('admin', 'manager')
  @ApiOperation({ summary: 'Get facilities and amenities for a membership' })
  getMembershipFacilities(
    @Request() req: AuthenticatedRequest,
    @Param('id', ParseIntPipe) id: number,
  ): Promise<any> {
    return this.membershipsService.getMembershipFacilitiesAndAmenities(
      id,
      req.user.gymId!,
    );
  }

  @Patch(':id/facilities')
  @UseGuards(RolesGuard)
  @Roles('admin', 'manager')
  @ApiOperation({ summary: 'Update facilities and amenities for a membership' })
  async updateMembershipFacilities(
    @Request() req: AuthenticatedRequest,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateMembershipFacilitiesDto,
  ): Promise<any> {
    const result = await this.membershipsService.updateMembershipFacilitiesAndAmenities(
      id,
      req.user.gymId!,
      dto.facilityIds || [],
      dto.amenityIds || [],
    );
    this.notificationsGateway.emitMembershipChanged(req.user.gymId!, { action: 'updated' });
    return result;
  }

  @Post()
  @UseGuards(RolesGuard, ManagerPermissionsGuard)
  @Roles('admin', 'manager')
  @ManagerPermission('subscriptions', 'create')
  @ApiOperation({ summary: 'Create a new membership' })
  async create(
    @Request() req: AuthenticatedRequest,
    @Body() dto: CreateMembershipDto,
  ): Promise<any> {
    const result = await this.membershipsService.create(dto, req.user.gymId!, {
      id: req.user.userId,
      name: req.user.name || req.user.email,
      role: req.user.role,
    });
    this.notificationsGateway.emitMembershipChanged(req.user.gymId!, { action: 'created' });
    return result;
  }

  @Patch(':id')
  @UseGuards(RolesGuard, ManagerPermissionsGuard)
  @Roles('admin', 'manager')
  @ManagerPermission('subscriptions', 'update')
  @ApiOperation({ summary: 'Update a membership' })
  async update(
    @Request() req: AuthenticatedRequest,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateMembershipDto,
  ): Promise<any> {
    const result = await this.membershipsService.update(id, req.user.gymId!, dto);
    this.notificationsGateway.emitMembershipChanged(req.user.gymId!, { action: 'updated' });
    return result;
  }

  @Post(':id/cancel')
  @UseGuards(RolesGuard, ManagerPermissionsGuard)
  @Roles('admin', 'manager')
  @ManagerPermission('subscriptions', 'update')
  @ApiOperation({ summary: 'Cancel a membership' })
  async cancel(
    @Request() req: AuthenticatedRequest,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: CancelMembershipDto,
  ): Promise<any> {
    const result = await this.membershipsService.cancel(id, req.user.gymId!, dto);
    this.notificationsGateway.emitMembershipChanged(req.user.gymId!, { action: 'cancelled' });
    return result;
  }

  @Delete(':id/void')
  @UseGuards(RolesGuard)
  @Roles('admin')
  @ApiOperation({ summary: 'Permanently delete a membership and its related data' })
  async voidDelete(
    @Request() req: AuthenticatedRequest,
    @Param('id', ParseIntPipe) id: number,
  ): Promise<any> {
    const result = await this.membershipsService.voidDelete(id, req.user.gymId!);
    this.notificationsGateway.emitMembershipChanged(req.user.gymId!, { action: 'voided' });
    return result;
  }

  @Delete(':id')
  @UseGuards(RolesGuard, ManagerPermissionsGuard)
  @Roles('admin')
  @ManagerPermission('subscriptions', 'delete')
  @ApiOperation({ summary: 'Delete a membership' })
  @ApiQuery({
    name: 'force',
    required: false,
    type: Boolean,
    description: 'Force delete active/pending memberships',
  })
  async delete(
    @Request() req: AuthenticatedRequest,
    @Param('id', ParseIntPipe) id: number,
    @Query('force') force?: string,
  ): Promise<any> {
    const result = await this.membershipsService.delete(id, req.user.gymId!, force === 'true', req.user.userId);
    this.notificationsGateway.emitMembershipChanged(req.user.gymId!, { action: 'deleted' });
    return result;
  }

  @Post(':id/freeze')
  @UseGuards(RolesGuard)
  @Roles('admin', 'manager')
  @ApiOperation({ summary: 'Freeze a membership' })
  async freeze(
    @Request() req: AuthenticatedRequest,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: FreezeMembershipDto,
  ): Promise<any> {
    return this.membershipsService.freeze(id, req.user.gymId!, dto, req.user.userId);
  }

  @Post(':id/unfreeze')
  @UseGuards(RolesGuard)
  @Roles('admin', 'manager')
  @ApiOperation({ summary: 'Unfreeze a membership' })
  async unfreeze(
    @Request() req: AuthenticatedRequest,
    @Param('id', ParseIntPipe) id: number,
  ): Promise<any> {
    return this.membershipsService.unfreeze(id, req.user.gymId!);
  }

  @Get(':id/freezes')
  @UseGuards(RolesGuard)
  @Roles('admin', 'manager', 'trainer')
  @ApiOperation({ summary: 'Get freeze history for a membership' })
  async getFreezeHistory(
    @Request() req: AuthenticatedRequest,
    @Param('id', ParseIntPipe) id: number,
  ): Promise<any> {
    return this.membershipsService.getFreezeHistory(id, req.user.gymId!);
  }

}
