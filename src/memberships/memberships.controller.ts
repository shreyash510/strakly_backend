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
  @Roles('superadmin', 'admin', 'manager')
  @ApiOperation({ summary: 'Get all memberships' })
  @ApiQuery({ name: 'status', required: false })
  @ApiQuery({ name: 'planId', required: false })
  @ApiQuery({ name: 'search', required: false, description: 'Search by user name or email' })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  @ApiHeader({ name: 'x-user-id', required: false, description: 'Filter by user ID' })
  findAll(
    @Query('status') status?: string,
    @Headers('x-user-id') userId?: string,
    @Query('planId') planId?: string,
    @Query('search') search?: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    return this.membershipsService.findAll({
      status,
      userId: userId ? parseInt(userId) : undefined,
      planId: planId ? parseInt(planId) : undefined,
      search,
      page: page ? parseInt(page) : undefined,
      limit: limit ? parseInt(limit) : undefined,
    });
  }

  @Get('stats')
  @UseGuards(RolesGuard)
  @Roles('superadmin', 'admin', 'manager')
  @ApiOperation({ summary: 'Get membership statistics' })
  getStats() {
    return this.membershipsService.getStats();
  }

  @Get('expiring')
  @UseGuards(RolesGuard)
  @Roles('superadmin', 'admin', 'manager')
  @ApiOperation({ summary: 'Get memberships expiring soon' })
  @ApiQuery({ name: 'days', required: false, type: Number })
  getExpiringSoon(@Query('days') days?: string) {
    return this.membershipsService.getExpiringSoon(days ? parseInt(days) : 7);
  }

  @Get('expired')
  @UseGuards(RolesGuard)
  @Roles('superadmin', 'admin', 'manager')
  @ApiOperation({ summary: 'Get expired memberships' })
  getExpired() {
    return this.membershipsService.getExpired();
  }

  @Post('mark-expired')
  @UseGuards(RolesGuard)
  @Roles('superadmin', 'admin')
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
  @Roles('superadmin', 'admin', 'manager')
  @ApiOperation({ summary: 'Get memberships for a specific user' })
  @ApiHeader({ name: 'x-user-id', required: true, description: 'Target user ID' })
  findByUser(@Headers('x-user-id') userId: string) {
    if (!userId) throw new BadRequestException('x-user-id header is required');
    return this.membershipsService.findByUser(parseInt(userId));
  }

  @Get('user/active')
  @UseGuards(RolesGuard)
  @Roles('superadmin', 'admin', 'manager')
  @ApiOperation({ summary: 'Get active membership for a user' })
  @ApiHeader({ name: 'x-user-id', required: true, description: 'Target user ID' })
  getActiveMembership(@Headers('x-user-id') userId: string) {
    if (!userId) throw new BadRequestException('x-user-id header is required');
    return this.membershipsService.getActiveMembership(parseInt(userId));
  }

  @Get('user/status')
  @UseGuards(RolesGuard)
  @Roles('superadmin', 'admin', 'manager')
  @ApiOperation({ summary: 'Check membership status for a user' })
  @ApiHeader({ name: 'x-user-id', required: true, description: 'Target user ID' })
  checkStatus(@Headers('x-user-id') userId: string) {
    if (!userId) throw new BadRequestException('x-user-id header is required');
    return this.membershipsService.checkMembershipStatus(parseInt(userId));
  }

  @Post('user/renew')
  @UseGuards(RolesGuard)
  @Roles('superadmin', 'admin', 'manager')
  @ApiOperation({ summary: 'Renew membership for a user' })
  @ApiHeader({ name: 'x-user-id', required: true, description: 'Target user ID' })
  renew(@Headers('x-user-id') userId: string, @Body() dto: RenewMembershipDto) {
    if (!userId) throw new BadRequestException('x-user-id header is required');
    return this.membershipsService.renew(parseInt(userId), dto);
  }

  // ============ INDIVIDUAL MEMBERSHIP ENDPOINTS (by membership ID) ============

  @Get(':id')
  @ApiOperation({ summary: 'Get membership by ID' })
  findOne(@Param('id', ParseIntPipe) id: number) {
    return this.membershipsService.findOne(id);
  }

  @Post()
  @UseGuards(RolesGuard)
  @Roles('superadmin', 'admin', 'manager')
  @ApiOperation({ summary: 'Create a new membership' })
  create(@Request() req: any, @Body() dto: CreateMembershipDto) {
    return this.membershipsService.create(dto, req.user.userId);
  }

  @Patch(':id')
  @UseGuards(RolesGuard)
  @Roles('superadmin', 'admin', 'manager')
  @ApiOperation({ summary: 'Update a membership' })
  update(@Param('id', ParseIntPipe) id: number, @Body() dto: UpdateMembershipDto) {
    return this.membershipsService.update(id, dto);
  }

  @Post(':id/payment')
  @UseGuards(RolesGuard)
  @Roles('superadmin', 'admin', 'manager')
  @ApiOperation({ summary: 'Record payment for a membership' })
  recordPayment(@Param('id', ParseIntPipe) id: number, @Body() dto: RecordPaymentDto) {
    return this.membershipsService.recordPayment(id, dto);
  }

  @Post(':id/activate')
  @UseGuards(RolesGuard)
  @Roles('superadmin', 'admin', 'manager')
  @ApiOperation({ summary: 'Activate a membership' })
  activate(@Param('id', ParseIntPipe) id: number) {
    return this.membershipsService.activate(id);
  }

  @Post(':id/cancel')
  @UseGuards(RolesGuard)
  @Roles('superadmin', 'admin', 'manager')
  @ApiOperation({ summary: 'Cancel a membership' })
  cancel(@Param('id', ParseIntPipe) id: number, @Body() dto: CancelMembershipDto) {
    return this.membershipsService.cancel(id, dto);
  }

  @Post(':id/pause')
  @UseGuards(RolesGuard)
  @Roles('superadmin', 'admin', 'manager')
  @ApiOperation({ summary: 'Pause a membership' })
  pause(@Param('id', ParseIntPipe) id: number) {
    return this.membershipsService.pause(id);
  }

  @Post(':id/resume')
  @UseGuards(RolesGuard)
  @Roles('superadmin', 'admin', 'manager')
  @ApiOperation({ summary: 'Resume a paused membership' })
  resume(@Param('id', ParseIntPipe) id: number) {
    return this.membershipsService.resume(id);
  }

  @Delete(':id')
  @UseGuards(RolesGuard)
  @Roles('superadmin', 'admin')
  @ApiOperation({ summary: 'Delete a membership' })
  delete(@Param('id', ParseIntPipe) id: number) {
    return this.membershipsService.delete(id);
  }
}
