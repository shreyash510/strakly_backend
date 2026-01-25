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
  @ApiQuery({ name: 'clientId', required: false, type: Number, description: 'Filter by client ID' })
  @ApiQuery({ name: 'search', required: false, description: 'Search by user name or email' })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  @ApiQuery({ name: 'gymId', required: false, type: Number, description: 'Gym ID (required for superadmin)' })
  findAll(
    @Request() req: any,
    @Query('status') status?: string,
    @Query('clientId') clientId?: string,
    @Query('planId') planId?: string,
    @Query('search') search?: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
    @Query('gymId') queryGymId?: string,
  ) {
    const gymId = req.user.role === 'superadmin'
      ? (queryGymId ? parseInt(queryGymId) : null)
      : req.user.gymId;

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
    });
  }

  @Get('stats')
  @UseGuards(RolesGuard)
  @Roles('admin', 'manager')
  @ApiOperation({ summary: 'Get membership statistics' })
  getStats(@Request() req: any) {
    return this.membershipsService.getStats(req.user.gymId);
  }

  @Get('expiring')
  @UseGuards(RolesGuard)
  @Roles('admin', 'manager')
  @ApiOperation({ summary: 'Get memberships expiring soon' })
  @ApiQuery({ name: 'days', required: false, type: Number })
  getExpiringSoon(@Request() req: any, @Query('days') days?: string) {
    return this.membershipsService.getExpiringSoon(req.user.gymId, days ? parseInt(days) : 7);
  }

  // ============ CURRENT USER ENDPOINTS ============

  @Get('me')
  @ApiOperation({ summary: 'Get current user memberships' })
  getMyMemberships(@Request() req: any) {
    return this.membershipsService.findByUser(req.user.userId, req.user.gymId);
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
    return this.membershipsService.renew(req.user.userId, req.user.gymId, dto);
  }

  // ============ USER-SPECIFIC ENDPOINTS (admin - userId from header) ============

  @Get('user')
  @UseGuards(RolesGuard)
  @Roles('admin', 'manager')
  @ApiOperation({ summary: 'Get memberships for a specific user' })
  @ApiHeader({ name: 'x-user-id', required: true, description: 'Target user ID' })
  findByUser(@Request() req: any, @Headers('x-user-id') userId: string) {
    if (!userId) throw new BadRequestException('x-user-id header is required');
    return this.membershipsService.findByUser(parseInt(userId), req.user.gymId);
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
  renew(@Request() req: any, @Headers('x-user-id') userId: string, @Body() dto: RenewMembershipDto) {
    if (!userId) throw new BadRequestException('x-user-id header is required');
    return this.membershipsService.renew(parseInt(userId), req.user.gymId, dto);
  }

  // ============ INDIVIDUAL MEMBERSHIP ENDPOINTS (by membership ID) ============

  @Get(':id')
  @UseGuards(RolesGuard)
  @Roles('admin', 'manager')
  @ApiOperation({ summary: 'Get membership by ID' })
  findOne(@Request() req: any, @Param('id', ParseIntPipe) id: number) {
    return this.membershipsService.findOne(id, req.user.gymId);
  }

  @Post()
  @UseGuards(RolesGuard)
  @Roles('admin', 'manager')
  @ApiOperation({ summary: 'Create a new membership' })
  create(@Request() req: any, @Body() dto: CreateMembershipDto) {
    return this.membershipsService.create(dto, req.user.gymId);
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
