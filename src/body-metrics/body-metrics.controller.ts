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
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiQuery, ApiHeader } from '@nestjs/swagger';
import { BodyMetricsService } from './body-metrics.service';
import { UpdateBodyMetricsDto, RecordMetricsDto } from './dto/body-metrics.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';

@ApiTags('body-metrics')
@Controller('body-metrics')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class BodyMetricsController {
  constructor(private readonly bodyMetricsService: BodyMetricsService) {}

  // ============ CURRENT USER ENDPOINTS ============

  @Get('me')
  @ApiOperation({ summary: 'Get current user body metrics' })
  getMyMetrics(@Request() req: any) {
    return this.bodyMetricsService.getOrCreateMetrics(req.user.userId, req.user.gymId);
  }

  @Patch('me')
  @ApiOperation({ summary: 'Update current user body metrics' })
  updateMyMetrics(@Request() req: any, @Body() dto: UpdateBodyMetricsDto) {
    return this.bodyMetricsService.updateMetrics(req.user.userId, req.user.gymId, dto);
  }

  @Post('me/record')
  @ApiOperation({ summary: 'Record body metrics and save to history' })
  recordMyMetrics(@Request() req: any, @Body() dto: RecordMetricsDto) {
    return this.bodyMetricsService.recordMetrics(req.user.userId, req.user.gymId, dto);
  }

  @Get('me/history')
  @ApiOperation({ summary: 'Get current user metrics history' })
  @ApiQuery({ name: 'startDate', required: false })
  @ApiQuery({ name: 'endDate', required: false })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  getMyHistory(
    @Request() req: any,
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
    @Query('limit') limit?: string,
  ) {
    return this.bodyMetricsService.getHistory(req.user.userId, req.user.gymId, {
      startDate: startDate ? new Date(startDate) : undefined,
      endDate: endDate ? new Date(endDate) : undefined,
      limit: limit ? parseInt(limit) : undefined,
    });
  }

  @Get('me/progress')
  @ApiOperation({ summary: 'Get current user progress' })
  getMyProgress(@Request() req: any) {
    return this.bodyMetricsService.getProgress(req.user.userId, req.user.gymId);
  }

  @Delete('me/history/:id')
  @ApiOperation({ summary: 'Delete a history record' })
  deleteMyHistoryRecord(@Request() req: any, @Param('id') id: string) {
    return this.bodyMetricsService.deleteHistoryRecord(parseInt(id), req.user.userId, req.user.gymId);
  }

  // ============ ADMIN ENDPOINTS (for managing other users) ============
  // userId passed via x-user-id header

  @Get('user')
  @UseGuards(RolesGuard)
  @Roles('superadmin', 'admin', 'manager', 'trainer')
  @ApiOperation({ summary: 'Get body metrics for a specific user' })
  @ApiHeader({ name: 'x-user-id', required: true, description: 'Target user ID' })
  getUserMetrics(@Request() req: any, @Headers('x-user-id') userId: string) {
    if (!userId) throw new BadRequestException('x-user-id header is required');
    return this.bodyMetricsService.getOrCreateMetrics(parseInt(userId), req.user.gymId);
  }

  @Patch('user')
  @UseGuards(RolesGuard)
  @Roles('superadmin', 'admin', 'manager', 'trainer')
  @ApiOperation({ summary: 'Update body metrics for a specific user' })
  @ApiHeader({ name: 'x-user-id', required: true, description: 'Target user ID' })
  updateUserMetrics(
    @Request() req: any,
    @Headers('x-user-id') userId: string,
    @Body() dto: UpdateBodyMetricsDto,
  ) {
    if (!userId) throw new BadRequestException('x-user-id header is required');
    return this.bodyMetricsService.updateMetrics(parseInt(userId), req.user.gymId, dto);
  }

  @Post('user/record')
  @UseGuards(RolesGuard)
  @Roles('superadmin', 'admin', 'manager', 'trainer')
  @ApiOperation({ summary: 'Record body metrics for a specific user' })
  @ApiHeader({ name: 'x-user-id', required: true, description: 'Target user ID' })
  recordUserMetrics(
    @Request() req: any,
    @Headers('x-user-id') userId: string,
    @Body() dto: RecordMetricsDto,
  ) {
    if (!userId) throw new BadRequestException('x-user-id header is required');
    return this.bodyMetricsService.recordMetrics(parseInt(userId), req.user.gymId, dto);
  }

  @Get('user/history')
  @UseGuards(RolesGuard)
  @Roles('superadmin', 'admin', 'manager', 'trainer')
  @ApiOperation({ summary: 'Get metrics history for a specific user' })
  @ApiHeader({ name: 'x-user-id', required: true, description: 'Target user ID' })
  @ApiQuery({ name: 'startDate', required: false })
  @ApiQuery({ name: 'endDate', required: false })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  async getUserHistory(
    @Request() req: any,
    @Headers('x-user-id') userId: string,
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
    @Query('limit') limit?: string,
  ) {
    if (!userId) throw new BadRequestException('x-user-id header is required');
    const history = await this.bodyMetricsService.getHistory(parseInt(userId), req.user.gymId, {
      startDate: startDate ? new Date(startDate) : undefined,
      endDate: endDate ? new Date(endDate) : undefined,
      limit: limit ? parseInt(limit) : undefined,
    });
    return history;
  }

  @Get('user/progress')
  @UseGuards(RolesGuard)
  @Roles('superadmin', 'admin', 'manager', 'trainer')
  @ApiOperation({ summary: 'Get progress for a specific user' })
  @ApiHeader({ name: 'x-user-id', required: true, description: 'Target user ID' })
  getUserProgress(@Request() req: any, @Headers('x-user-id') userId: string) {
    if (!userId) throw new BadRequestException('x-user-id header is required');
    return this.bodyMetricsService.getProgress(parseInt(userId), req.user.gymId);
  }
}
