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
import { BodyMetricsService } from './body-metrics.service';
import { UpdateBodyMetricsDto, RecordMetricsDto } from './dto/body-metrics.dto';
import type { AuthenticatedRequest } from '../common/types';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { PlanFeaturesGuard } from '../auth/guards/plan-features.guard';
import { PlanFeatures } from '../auth/decorators/plan-features.decorator';
import { PLAN_FEATURES } from '../common/constants/features';
import { NotificationsGateway } from '../notifications/notifications.gateway';

@ApiTags('body-metrics')
@Controller('body-metrics')
@UseGuards(JwtAuthGuard, PlanFeaturesGuard)
@PlanFeatures(PLAN_FEATURES.BODY_METRICS)
@ApiBearerAuth()
export class BodyMetricsController {
  constructor(
    private readonly bodyMetricsService: BodyMetricsService,
    private readonly notificationsGateway: NotificationsGateway,
  ) {}

  // ============ CURRENT USER ENDPOINTS ============

  @Get('me')
  @ApiOperation({ summary: 'Get current user body metrics' })
  getMyMetrics(@Request() req: AuthenticatedRequest) {
    const branchId = req.user.branchId ?? null;
    return this.bodyMetricsService.getOrCreateMetrics(
      req.user.userId,
      req.user.gymId!,
      branchId,
    );
  }

  @Patch('me')
  @ApiOperation({ summary: 'Update current user body metrics' })
  async updateMyMetrics(@Request() req: AuthenticatedRequest, @Body() dto: UpdateBodyMetricsDto) {
    const branchId = req.user.branchId ?? null;
    const result = await this.bodyMetricsService.updateMetrics(
      req.user.userId,
      req.user.gymId!,
      dto,
      branchId,
    );
    this.notificationsGateway.emitBodyMetricsChanged(req.user.gymId!, { action: 'updated' });
    return result;
  }

  @Post('me/record')
  @ApiOperation({ summary: 'Record body metrics and save to history' })
  async recordMyMetrics(@Request() req: AuthenticatedRequest, @Body() dto: RecordMetricsDto) {
    const branchId = req.user.branchId ?? null;
    const result = await this.bodyMetricsService.recordMetrics(
      req.user.userId,
      req.user.gymId!,
      dto,
      branchId,
    );
    this.notificationsGateway.emitBodyMetricsChanged(req.user.gymId!, { action: 'recorded' });
    return result;
  }

  @Get('me/history')
  @ApiOperation({ summary: 'Get current user metrics history' })
  @ApiQuery({
    name: 'page',
    required: false,
    type: Number,
    description: 'Page number (default: 1)',
  })
  @ApiQuery({
    name: 'limit',
    required: false,
    type: Number,
    description: 'Items per page (default: 10)',
  })
  @ApiQuery({ name: 'startDate', required: false })
  @ApiQuery({ name: 'endDate', required: false })
  getMyHistory(
    @Request() req: AuthenticatedRequest,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
  ) {
    return this.bodyMetricsService.getHistory(req.user.userId, req.user.gymId!, {
      page: page ? parseInt(page) : undefined,
      limit: limit ? parseInt(limit) : undefined,
      startDate: startDate ? new Date(startDate) : undefined,
      endDate: endDate ? new Date(endDate) : undefined,
    });
  }

  @Get('me/progress')
  @ApiOperation({ summary: 'Get current user progress' })
  getMyProgress(@Request() req: AuthenticatedRequest) {
    return this.bodyMetricsService.getProgress(req.user.userId, req.user.gymId!);
  }

  @Delete('me/history/:id')
  @ApiOperation({ summary: 'Delete a history record' })
  async deleteMyHistoryRecord(
    @Request() req: AuthenticatedRequest,
    @Param('id', ParseIntPipe) id: number,
  ) {
    const result = await this.bodyMetricsService.deleteHistoryRecord(
      id,
      req.user.userId,
      req.user.gymId!,
    );
    this.notificationsGateway.emitBodyMetricsChanged(req.user.gymId!, { action: 'deleted' });
    return result;
  }

  // ============ ADMIN ENDPOINTS (for managing other users) ============
  // userId passed via x-user-id header

  @Get('user')
  @UseGuards(RolesGuard)
  @Roles('superadmin', 'admin', 'branch_admin', 'manager', 'trainer')
  @ApiOperation({ summary: 'Get body metrics for a specific user' })
  @ApiHeader({
    name: 'x-user-id',
    required: true,
    description: 'Target user ID',
  })
  getUserMetrics(@Request() req: AuthenticatedRequest, @Headers('x-user-id') userId: string) {
    if (!userId) throw new BadRequestException('x-user-id header is required');
    const branchId = req.user.branchId ?? null;
    return this.bodyMetricsService.getOrCreateMetrics(
      parseInt(userId),
      req.user.gymId!,
      branchId,
    );
  }

  @Patch('user')
  @UseGuards(RolesGuard)
  @Roles('superadmin', 'admin', 'branch_admin', 'manager', 'trainer')
  @ApiOperation({ summary: 'Update body metrics for a specific user' })
  @ApiHeader({
    name: 'x-user-id',
    required: true,
    description: 'Target user ID',
  })
  async updateUserMetrics(
    @Request() req: AuthenticatedRequest,
    @Headers('x-user-id') userId: string,
    @Body() dto: UpdateBodyMetricsDto,
  ) {
    if (!userId) throw new BadRequestException('x-user-id header is required');
    const branchId = req.user.branchId ?? null;
    const result = await this.bodyMetricsService.updateMetrics(
      parseInt(userId),
      req.user.gymId!,
      dto,
      branchId,
    );
    this.notificationsGateway.emitBodyMetricsChanged(req.user.gymId!, { action: 'updated' });
    return result;
  }

  @Post('user/record')
  @UseGuards(RolesGuard)
  @Roles('superadmin', 'admin', 'branch_admin', 'manager', 'trainer')
  @ApiOperation({ summary: 'Record body metrics for a specific user' })
  @ApiHeader({
    name: 'x-user-id',
    required: true,
    description: 'Target user ID',
  })
  async recordUserMetrics(
    @Request() req: AuthenticatedRequest,
    @Headers('x-user-id') userId: string,
    @Body() dto: RecordMetricsDto,
  ) {
    if (!userId) throw new BadRequestException('x-user-id header is required');
    const branchId = req.user.branchId ?? null;
    const result = await this.bodyMetricsService.recordMetrics(
      parseInt(userId),
      req.user.gymId!,
      dto,
      branchId,
    );
    this.notificationsGateway.emitBodyMetricsChanged(req.user.gymId!, { action: 'recorded' });
    return result;
  }

  @Get('user/history')
  @UseGuards(RolesGuard)
  @Roles('superadmin', 'admin', 'branch_admin', 'manager', 'trainer')
  @ApiOperation({ summary: 'Get metrics history for a specific user' })
  @ApiHeader({
    name: 'x-user-id',
    required: true,
    description: 'Target user ID',
  })
  @ApiQuery({
    name: 'page',
    required: false,
    type: Number,
    description: 'Page number (default: 1)',
  })
  @ApiQuery({
    name: 'limit',
    required: false,
    type: Number,
    description: 'Items per page (default: 10)',
  })
  @ApiQuery({ name: 'startDate', required: false })
  @ApiQuery({ name: 'endDate', required: false })
  async getUserHistory(
    @Request() req: AuthenticatedRequest,
    @Headers('x-user-id') userId: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
  ) {
    if (!userId) throw new BadRequestException('x-user-id header is required');
    return this.bodyMetricsService.getHistory(
      parseInt(userId),
      req.user.gymId!,
      {
        page: page ? parseInt(page) : undefined,
        limit: limit ? parseInt(limit) : undefined,
        startDate: startDate ? new Date(startDate) : undefined,
        endDate: endDate ? new Date(endDate) : undefined,
      },
    );
  }

  @Get('user/progress')
  @UseGuards(RolesGuard)
  @Roles('superadmin', 'admin', 'branch_admin', 'manager', 'trainer')
  @ApiOperation({ summary: 'Get progress for a specific user' })
  @ApiHeader({
    name: 'x-user-id',
    required: true,
    description: 'Target user ID',
  })
  getUserProgress(@Request() req: AuthenticatedRequest, @Headers('x-user-id') userId: string) {
    if (!userId) throw new BadRequestException('x-user-id header is required');
    return this.bodyMetricsService.getProgress(
      parseInt(userId),
      req.user.gymId!,
    );
  }
}
