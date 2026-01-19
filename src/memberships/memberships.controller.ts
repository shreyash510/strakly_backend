import {
  Controller,
  Get,
  Post,
  Patch,
  Body,
  Param,
  Query,
  UseGuards,
  Request,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiQuery } from '@nestjs/swagger';
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
  @ApiQuery({ name: 'userId', required: false })
  @ApiQuery({ name: 'planId', required: false })
  findAll(
    @Query('status') status?: string,
    @Query('userId') userId?: string,
    @Query('planId') planId?: string,
  ) {
    return this.membershipsService.findAll({ status, userId, planId });
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

  // Current user endpoints
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

  // User-specific endpoints (admin access)
  @Get('user/:userId')
  @UseGuards(RolesGuard)
  @Roles('superadmin', 'admin', 'manager')
  @ApiOperation({ summary: 'Get memberships for a specific user' })
  findByUser(@Param('userId') userId: string) {
    return this.membershipsService.findByUser(userId);
  }

  @Get('user/:userId/active')
  @UseGuards(RolesGuard)
  @Roles('superadmin', 'admin', 'manager')
  @ApiOperation({ summary: 'Get active membership for a user' })
  getActiveMembership(@Param('userId') userId: string) {
    return this.membershipsService.getActiveMembership(userId);
  }

  @Get('user/:userId/status')
  @UseGuards(RolesGuard)
  @Roles('superadmin', 'admin', 'manager')
  @ApiOperation({ summary: 'Check membership status for a user' })
  checkStatus(@Param('userId') userId: string) {
    return this.membershipsService.checkMembershipStatus(userId);
  }

  // Individual membership endpoints
  @Get(':id')
  @ApiOperation({ summary: 'Get membership by ID' })
  findOne(@Param('id') id: string) {
    return this.membershipsService.findOne(id);
  }

  @Post()
  @UseGuards(RolesGuard)
  @Roles('superadmin', 'admin', 'manager')
  @ApiOperation({ summary: 'Create a new membership' })
  create(@Body() dto: CreateMembershipDto) {
    return this.membershipsService.create(dto);
  }

  @Patch(':id')
  @UseGuards(RolesGuard)
  @Roles('superadmin', 'admin', 'manager')
  @ApiOperation({ summary: 'Update a membership' })
  update(@Param('id') id: string, @Body() dto: UpdateMembershipDto) {
    return this.membershipsService.update(id, dto);
  }

  @Post(':id/payment')
  @UseGuards(RolesGuard)
  @Roles('superadmin', 'admin', 'manager')
  @ApiOperation({ summary: 'Record payment for a membership' })
  recordPayment(@Param('id') id: string, @Body() dto: RecordPaymentDto) {
    return this.membershipsService.recordPayment(id, dto);
  }

  @Post(':id/activate')
  @UseGuards(RolesGuard)
  @Roles('superadmin', 'admin', 'manager')
  @ApiOperation({ summary: 'Activate a membership' })
  activate(@Param('id') id: string) {
    return this.membershipsService.activate(id);
  }

  @Post(':id/cancel')
  @UseGuards(RolesGuard)
  @Roles('superadmin', 'admin', 'manager')
  @ApiOperation({ summary: 'Cancel a membership' })
  cancel(@Param('id') id: string, @Body() dto: CancelMembershipDto) {
    return this.membershipsService.cancel(id, dto);
  }

  @Post(':id/pause')
  @UseGuards(RolesGuard)
  @Roles('superadmin', 'admin', 'manager')
  @ApiOperation({ summary: 'Pause a membership' })
  pause(@Param('id') id: string) {
    return this.membershipsService.pause(id);
  }

  @Post(':id/resume')
  @UseGuards(RolesGuard)
  @Roles('superadmin', 'admin', 'manager')
  @ApiOperation({ summary: 'Resume a paused membership' })
  resume(@Param('id') id: string) {
    return this.membershipsService.resume(id);
  }

  @Post('user/:userId/renew')
  @UseGuards(RolesGuard)
  @Roles('superadmin', 'admin', 'manager')
  @ApiOperation({ summary: 'Renew membership for a user' })
  renew(@Param('userId') userId: string, @Body() dto: RenewMembershipDto) {
    return this.membershipsService.renew(userId, dto);
  }
}
