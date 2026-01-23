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

  @Get()
  @UseGuards(RolesGuard)
  @Roles('admin', 'manager')
  @ApiOperation({ summary: 'Get all memberships' })
  @ApiQuery({ name: 'status', required: false })
  @ApiQuery({ name: 'planId', required: false })
  @ApiQuery({ name: 'search', required: false, description: 'Search by user name or email' })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  @ApiHeader({ name: 'x-user-id', required: false, description: 'Filter by user ID' })
  findAll(
    @Request() req: any,
    @Query('status') status?: string,
    @Headers('x-user-id') userId?: string,
    @Query('planId') planId?: string,
    @Query('search') search?: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    /* Filter by admin's gym (tenant isolation) - superadmin or admins without gymId see all */
    const gymId = (req.user.role === 'superadmin' || !req.user.gymId) ? undefined : req.user.gymId;

    return this.membershipsService.findAll({
      status,
      userId: userId ? parseInt(userId) : undefined,
      planId: planId ? parseInt(planId) : undefined,
      search,
      page: page ? parseInt(page) : undefined,
      limit: limit ? parseInt(limit) : undefined,
      gymId,
    });
  }

  @Get('overview')
  @UseGuards(RolesGuard)
  @Roles('admin', 'manager')
  @ApiOperation({ summary: 'Get all overview data in a single call (stats, expiring, recent, plans)' })
  getOverview(@Request() req: any) {
    /* Filter by admin's gym (tenant isolation) - superadmin or admins without gymId see all */
    const gymId = (req.user.role === 'superadmin' || !req.user.gymId) ? undefined : req.user.gymId;
    return this.membershipsService.getOverview(gymId);
  }

  @Get('stats')
  @UseGuards(RolesGuard)
  @Roles('admin', 'manager')
  @ApiOperation({ summary: 'Get membership statistics' })
  getStats(@Request() req: any) {
    /* Filter by admin's gym (tenant isolation) - superadmin or admins without gymId see all */
    const gymId = (req.user.role === 'superadmin' || !req.user.gymId) ? undefined : req.user.gymId;
    return this.membershipsService.getStats(gymId);
  }

  @Get('expiring')
  @UseGuards(RolesGuard)
  @Roles('admin', 'manager')
  @ApiOperation({ summary: 'Get memberships expiring soon' })
  @ApiQuery({ name: 'days', required: false, type: Number })
  getExpiringSoon(@Request() req: any, @Query('days') days?: string) {
    /* Filter by admin's gym (tenant isolation) - superadmin or admins without gymId see all */
    const gymId = (req.user.role === 'superadmin' || !req.user.gymId) ? undefined : req.user.gymId;
    return this.membershipsService.getExpiringSoon(days ? parseInt(days) : 7, gymId);
  }

  @Get('expired')
  @UseGuards(RolesGuard)
  @Roles('admin', 'manager')
  @ApiOperation({ summary: 'Get expired memberships' })
  getExpired(@Request() req: any) {
    /* Filter by admin's gym (tenant isolation) - superadmin or admins without gymId see all */
    const gymId = (req.user.role === 'superadmin' || !req.user.gymId) ? undefined : req.user.gymId;
    return this.membershipsService.getExpired(gymId);
  }

  @Post('mark-expired')
  @UseGuards(RolesGuard)
  @Roles('admin')
  @ApiOperation({ summary: 'Mark all expired memberships' })
  markExpired() {
    return this.membershipsService.markExpiredMemberships();
  }

  // ============ CURRENT USER ENDPOINTS ============

  @Get('me')
  @ApiOperation({ summary: 'Get current user memberships' })
  getMyMemberships(@Request() req: any) {
    return this.membershipsService.findByUser(req.user.userId);
  }

  @Get('me/active')
  @ApiOperation({ summary: 'Get current user active membership' })
  getMyActiveMembership(@Request() req: any) {
    return this.membershipsService.getActiveMembership(req.user.userId);
  }

  @Get('me/status')
  @ApiOperation({ summary: 'Check current user membership status' })
  checkMyStatus(@Request() req: any) {
    return this.membershipsService.checkMembershipStatus(req.user.userId);
  }

  @Post('me/renew')
  @ApiOperation({ summary: 'Renew current user membership' })
  renewMyMembership(@Request() req: any, @Body() dto: RenewMembershipDto) {
    return this.membershipsService.renew(req.user.userId, dto);
  }

  // ============ USER-SPECIFIC ENDPOINTS (admin - userId from header) ============

  @Get('user')
  @UseGuards(RolesGuard)
  @Roles('admin', 'manager')
  @ApiOperation({ summary: 'Get memberships for a specific user' })
  @ApiHeader({ name: 'x-user-id', required: true, description: 'Target user ID' })
  findByUser(@Request() req: any, @Headers('x-user-id') userId: string) {
    if (!userId) throw new BadRequestException('x-user-id header is required');
    /* Filter by admin's gym (tenant isolation) */
    return this.membershipsService.findByUser(parseInt(userId), req.user.gymId);
  }

  @Get('user/active')
  @UseGuards(RolesGuard)
  @Roles('admin', 'manager')
  @ApiOperation({ summary: 'Get active membership for a user' })
  @ApiHeader({ name: 'x-user-id', required: true, description: 'Target user ID' })
  getActiveMembership(@Request() req: any, @Headers('x-user-id') userId: string) {
    if (!userId) throw new BadRequestException('x-user-id header is required');
    /* Filter by admin's gym (tenant isolation) */
    return this.membershipsService.getActiveMembership(parseInt(userId), req.user.gymId);
  }

  @Get('user/status')
  @UseGuards(RolesGuard)
  @Roles('admin', 'manager')
  @ApiOperation({ summary: 'Check membership status for a user' })
  @ApiHeader({ name: 'x-user-id', required: true, description: 'Target user ID' })
  checkStatus(@Request() req: any, @Headers('x-user-id') userId: string) {
    if (!userId) throw new BadRequestException('x-user-id header is required');
    /* Filter by admin's gym (tenant isolation) */
    return this.membershipsService.checkMembershipStatus(parseInt(userId), req.user.gymId);
  }

  @Post('user/renew')
  @UseGuards(RolesGuard)
  @Roles('admin', 'manager')
  @ApiOperation({ summary: 'Renew membership for a user' })
  @ApiHeader({ name: 'x-user-id', required: true, description: 'Target user ID' })
  renew(@Request() req: any, @Headers('x-user-id') userId: string, @Body() dto: RenewMembershipDto) {
    if (!userId) throw new BadRequestException('x-user-id header is required');
    /* Use admin's gym for renewal */
    dto.gymId = req.user.gymId;
    return this.membershipsService.renew(parseInt(userId), dto);
  }

  // ============ INDIVIDUAL MEMBERSHIP ENDPOINTS (by membership ID) ============

  @Get(':id')
  @UseGuards(RolesGuard)
  @Roles('admin', 'manager')
  @ApiOperation({ summary: 'Get membership by ID' })
  findOne(@Request() req: any, @Param('id', ParseIntPipe) id: number) {
    /* Filter by admin's gym (tenant isolation) */
    return this.membershipsService.findOne(id, req.user.gymId);
  }

  @Post()
  @UseGuards(RolesGuard)
  @Roles('admin', 'manager')
  @ApiOperation({ summary: 'Create a new membership' })
  create(@Request() req: any, @Body() dto: CreateMembershipDto) {
    return this.membershipsService.create(dto, req.user.userId);
  }

  @Patch(':id')
  @UseGuards(RolesGuard)
  @Roles('admin', 'manager')
  @ApiOperation({ summary: 'Update a membership' })
  async update(@Request() req: any, @Param('id', ParseIntPipe) id: number, @Body() dto: UpdateMembershipDto) {
    /* Verify membership belongs to admin's gym (tenant isolation) */
    await this.membershipsService.findOne(id, req.user.gymId);
    return this.membershipsService.update(id, dto);
  }

  @Post(':id/payment')
  @UseGuards(RolesGuard)
  @Roles('admin', 'manager')
  @ApiOperation({ summary: 'Record payment for a membership' })
  async recordPayment(@Request() req: any, @Param('id', ParseIntPipe) id: number, @Body() dto: RecordPaymentDto) {
    /* Verify membership belongs to admin's gym (tenant isolation) */
    await this.membershipsService.findOne(id, req.user.gymId);
    return this.membershipsService.recordPayment(id, dto);
  }

  @Post(':id/activate')
  @UseGuards(RolesGuard)
  @Roles('admin', 'manager')
  @ApiOperation({ summary: 'Activate a membership' })
  async activate(@Request() req: any, @Param('id', ParseIntPipe) id: number) {
    /* Verify membership belongs to admin's gym (tenant isolation) */
    await this.membershipsService.findOne(id, req.user.gymId);
    return this.membershipsService.activate(id);
  }

  @Post(':id/cancel')
  @UseGuards(RolesGuard)
  @Roles('admin', 'manager')
  @ApiOperation({ summary: 'Cancel a membership' })
  async cancel(@Request() req: any, @Param('id', ParseIntPipe) id: number, @Body() dto: CancelMembershipDto) {
    /* Verify membership belongs to admin's gym (tenant isolation) */
    await this.membershipsService.findOne(id, req.user.gymId);
    return this.membershipsService.cancel(id, dto);
  }

  @Post(':id/pause')
  @UseGuards(RolesGuard)
  @Roles('admin', 'manager')
  @ApiOperation({ summary: 'Pause a membership' })
  async pause(@Request() req: any, @Param('id', ParseIntPipe) id: number) {
    /* Verify membership belongs to admin's gym (tenant isolation) */
    await this.membershipsService.findOne(id, req.user.gymId);
    return this.membershipsService.pause(id);
  }

  @Post(':id/resume')
  @UseGuards(RolesGuard)
  @Roles('admin', 'manager')
  @ApiOperation({ summary: 'Resume a paused membership' })
  async resume(@Request() req: any, @Param('id', ParseIntPipe) id: number) {
    /* Verify membership belongs to admin's gym (tenant isolation) */
    await this.membershipsService.findOne(id, req.user.gymId);
    return this.membershipsService.resume(id);
  }

  @Delete(':id')
  @UseGuards(RolesGuard)
  @Roles('admin')
  @ApiOperation({ summary: 'Delete a membership' })
  @ApiQuery({ name: 'force', required: false, type: Boolean, description: 'Force delete active/pending memberships' })
  async delete(@Request() req: any, @Param('id', ParseIntPipe) id: number, @Query('force') force?: string) {
    /* Verify membership belongs to admin's gym (tenant isolation) */
    await this.membershipsService.findOne(id, req.user.gymId);
    return this.membershipsService.delete(id, force === 'true');
  }
}
