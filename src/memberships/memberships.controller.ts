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
import { ApiTags, ApiOperation, ApiBearerAuth, ApiQuery, ApiHeader } from '@nestjs/swagger';
import { MembershipsService } from './memberships.service';
import {
  CreateMembershipDto,
  UpdateMembershipDto,
  CancelMembershipDto,
  RenewMembershipDto,
  RecordPaymentDto,
} from './dto/membership.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';

@ApiTags('memberships')
@Controller('memberships')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class MembershipsController {
  constructor(private readonly membershipsService: MembershipsService) {}

  private resolveBranchId(req: any, queryBranchId?: string): number | null {
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
  @UseGuards(RolesGuard)
  @Roles('superadmin', 'admin', 'manager')
  @ApiOperation({ summary: 'Get all memberships' })
  @ApiQuery({ name: 'status', required: false })
  @ApiQuery({ name: 'planId', required: false })
  @ApiQuery({ name: 'clientId', required: false, type: Number, description: 'Filter by client ID' })
  @ApiQuery({ name: 'search', required: false, description: 'Search by user name or email' })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  @ApiQuery({ name: 'gymId', required: false, type: Number, description: 'Gym ID (required for superadmin)' })
  @ApiQuery({ name: 'branchId', required: false, type: Number, description: 'Branch ID for filtering (admin only)' })
  findAll(
    @Request() req: any,
    @Query('status') status?: string,
    @Query('clientId') clientId?: string,
    @Query('planId') planId?: string,
    @Query('search') search?: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
    @Query('gymId') queryGymId?: string,
    @Query('branchId') queryBranchId?: string,
  ) {
    const gymId = req.user.role === 'superadmin'
      ? (queryGymId ? parseInt(queryGymId) : null)
      : req.user.gymId;

    if (!gymId) {
      throw new BadRequestException('gymId is required');
    }

    const branchId = this.resolveBranchId(req, queryBranchId);

    return this.membershipsService.findAll(gymId, branchId, {
      status,
      userId: clientId ? parseInt(clientId) : undefined,
      planId: planId ? parseInt(planId) : undefined,
      search,
      page: page ? parseInt(page) : undefined,
      limit: limit ? parseInt(limit) : undefined,
    });
  }

  @Get('stats')
  @UseGuards(RolesGuard)
  @Roles('admin', 'manager')
  @ApiOperation({ summary: 'Get membership statistics' })
  @ApiQuery({ name: 'branchId', required: false, type: Number, description: 'Branch ID for filtering (admin only)' })
  getStats(@Request() req: any, @Query('branchId') queryBranchId?: string) {
    const branchId = this.resolveBranchId(req, queryBranchId);
    return this.membershipsService.getStats(req.user.gymId, branchId);
  }

  @Get('overview')
  @UseGuards(RolesGuard)
  @Roles('superadmin', 'admin', 'manager')
  @ApiOperation({ summary: 'Get membership overview (stats, expiring, recent)' })
  @ApiQuery({ name: 'gymId', required: false, type: Number, description: 'Gym ID (required for superadmin)' })
  @ApiQuery({ name: 'branchId', required: false, type: Number, description: 'Branch ID for filtering (admin only)' })
  getOverview(@Request() req: any, @Query('gymId') queryGymId?: string, @Query('branchId') queryBranchId?: string) {
    const gymId = req.user.role === 'superadmin'
      ? (queryGymId ? parseInt(queryGymId) : null)
      : req.user.gymId;

    if (!gymId) {
      throw new BadRequestException('gymId is required');
    }

    const branchId = this.resolveBranchId(req, queryBranchId);
    return this.membershipsService.getOverview(gymId, branchId);
  }

  @Get('expiring')
  @UseGuards(RolesGuard)
  @Roles('admin', 'manager')
  @ApiOperation({ summary: 'Get memberships expiring soon' })
  @ApiQuery({ name: 'days', required: false, type: Number })
  @ApiQuery({ name: 'branchId', required: false, type: Number, description: 'Branch ID for filtering (admin only)' })
  getExpiringSoon(@Request() req: any, @Query('days') days?: string, @Query('branchId') queryBranchId?: string) {
    const branchId = this.resolveBranchId(req, queryBranchId);
    return this.membershipsService.getExpiringSoon(req.user.gymId, branchId, days ? parseInt(days) : 7);
  }

  // ============ CURRENT USER ENDPOINTS ============

  @Get('me')
  @ApiOperation({ summary: 'Get current user memberships' })
  getMyMemberships(@Request() req: any) {
    return this.membershipsService.findByUser(req.user.userId, req.user.gymId, req.user.branchId);
  }

  @Get('me/active')
  @ApiOperation({ summary: 'Get current user active membership' })
  getMyActiveMembership(@Request() req: any) {
    return this.membershipsService.getActiveMembership(req.user.userId, req.user.gymId);
  }

  @Get('me/status')
  @ApiOperation({ summary: 'Check current user membership status' })
  checkMyStatus(@Request() req: any) {
    return this.membershipsService.checkMembershipStatus(req.user.userId, req.user.gymId);
  }

  @Post('me/renew')
  @ApiOperation({ summary: 'Renew current user membership' })
  renewMyMembership(@Request() req: any, @Body() dto: RenewMembershipDto) {
    return this.membershipsService.renew(req.user.userId, req.user.gymId, req.user.branchId, dto);
  }

  // ============ USER-SPECIFIC ENDPOINTS (admin - userId from header) ============

  @Get('user')
  @UseGuards(RolesGuard)
  @Roles('admin', 'manager')
  @ApiOperation({ summary: 'Get memberships for a specific user' })
  @ApiHeader({ name: 'x-user-id', required: true, description: 'Target user ID' })
  @ApiQuery({ name: 'branchId', required: false, type: Number, description: 'Branch ID for filtering (admin only)' })
  findByUser(@Request() req: any, @Headers('x-user-id') userId: string, @Query('branchId') queryBranchId?: string) {
    if (!userId) throw new BadRequestException('x-user-id header is required');
    const branchId = this.resolveBranchId(req, queryBranchId);
    return this.membershipsService.findByUser(parseInt(userId), req.user.gymId, branchId);
  }

  @Get('user/active')
  @UseGuards(RolesGuard)
  @Roles('admin', 'manager')
  @ApiOperation({ summary: 'Get active membership for a user' })
  @ApiHeader({ name: 'x-user-id', required: true, description: 'Target user ID' })
  getActiveMembership(@Request() req: any, @Headers('x-user-id') userId: string) {
    if (!userId) throw new BadRequestException('x-user-id header is required');
    return this.membershipsService.getActiveMembership(parseInt(userId), req.user.gymId);
  }

  @Get('user/status')
  @UseGuards(RolesGuard)
  @Roles('admin', 'manager')
  @ApiOperation({ summary: 'Check membership status for a user' })
  @ApiHeader({ name: 'x-user-id', required: true, description: 'Target user ID' })
  checkStatus(@Request() req: any, @Headers('x-user-id') userId: string) {
    if (!userId) throw new BadRequestException('x-user-id header is required');
    return this.membershipsService.checkMembershipStatus(parseInt(userId), req.user.gymId);
  }

  @Post('user/renew')
  @UseGuards(RolesGuard)
  @Roles('admin', 'manager')
  @ApiOperation({ summary: 'Renew membership for a user' })
  @ApiHeader({ name: 'x-user-id', required: true, description: 'Target user ID' })
  @ApiQuery({ name: 'branchId', required: false, type: Number, description: 'Branch ID for filtering (admin only)' })
  renew(@Request() req: any, @Headers('x-user-id') userId: string, @Body() dto: RenewMembershipDto, @Query('branchId') queryBranchId?: string) {
    if (!userId) throw new BadRequestException('x-user-id header is required');
    const branchId = this.resolveBranchId(req, queryBranchId);
    return this.membershipsService.renew(parseInt(userId), req.user.gymId, branchId, dto);
  }

  // ============ INDIVIDUAL MEMBERSHIP ENDPOINTS (by membership ID) ============

  @Get(':id')
  @UseGuards(RolesGuard)
  @Roles('admin', 'manager')
  @ApiOperation({ summary: 'Get membership by ID' })
  @ApiQuery({ name: 'branchId', required: false, type: Number, description: 'Branch ID for filtering (admin only)' })
  findOne(@Request() req: any, @Param('id', ParseIntPipe) id: number, @Query('branchId') queryBranchId?: string) {
    const branchId = this.resolveBranchId(req, queryBranchId);
    return this.membershipsService.findOne(id, req.user.gymId, branchId);
  }

  @Post()
  @UseGuards(RolesGuard)
  @Roles('admin', 'manager')
  @ApiOperation({ summary: 'Create a new membership' })
  @ApiQuery({ name: 'branchId', required: false, type: Number, description: 'Branch ID for the membership (admin only)' })
  create(@Request() req: any, @Body() dto: CreateMembershipDto, @Query('branchId') queryBranchId?: string) {
    const branchId = this.resolveBranchId(req, queryBranchId);
    return this.membershipsService.create(dto, req.user.gymId, branchId);
  }

  @Patch(':id')
  @UseGuards(RolesGuard)
  @Roles('admin', 'manager')
  @ApiOperation({ summary: 'Update a membership' })
  async update(@Request() req: any, @Param('id', ParseIntPipe) id: number, @Body() dto: UpdateMembershipDto) {
    return this.membershipsService.update(id, req.user.gymId, dto);
  }

  @Post(':id/payment')
  @UseGuards(RolesGuard)
  @Roles('admin', 'manager')
  @ApiOperation({ summary: 'Record payment for a membership' })
  async recordPayment(@Request() req: any, @Param('id', ParseIntPipe) id: number, @Body() dto: RecordPaymentDto) {
    return this.membershipsService.recordPayment(id, req.user.gymId, dto);
  }

  @Post(':id/cancel')
  @UseGuards(RolesGuard)
  @Roles('admin', 'manager')
  @ApiOperation({ summary: 'Cancel a membership' })
  async cancel(@Request() req: any, @Param('id', ParseIntPipe) id: number, @Body() dto: CancelMembershipDto) {
    return this.membershipsService.cancel(id, req.user.gymId, dto);
  }

  @Delete(':id')
  @UseGuards(RolesGuard)
  @Roles('admin')
  @ApiOperation({ summary: 'Delete a membership' })
  @ApiQuery({ name: 'force', required: false, type: Boolean, description: 'Force delete active/pending memberships' })
  async delete(@Request() req: any, @Param('id', ParseIntPipe) id: number, @Query('force') force?: string) {
    return this.membershipsService.delete(id, req.user.gymId, force === 'true');
  }
}
