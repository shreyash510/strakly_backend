import {
  Controller,
  Get,
  Post,
  Patch,
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
import { EngagementService } from './engagement.service';
import {
  EngagementFiltersDto,
  AcknowledgeAlertDto,
  AlertFiltersDto,
} from './dto/engagement.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { PlanFeaturesGuard } from '../auth/guards/plan-features.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { PlanFeatures } from '../auth/decorators/plan-features.decorator';
import { GymId } from '../common/decorators/gym-id.decorator';
import { OptionalBranchId } from '../common/decorators/branch-id.decorator';
import { UserId } from '../common/decorators/user-id.decorator';
import { PLAN_FEATURES } from '../common/constants/features';

@ApiTags('engagement')
@Controller('engagement')
@UseGuards(JwtAuthGuard, RolesGuard, PlanFeaturesGuard)
@PlanFeatures(PLAN_FEATURES.ENGAGEMENT_SCORING)
@ApiBearerAuth()
export class EngagementController {
  constructor(private readonly engagementService: EngagementService) {}

  // ─── Scores ───

  @Get('scores')
  @Roles('admin', 'branch_admin', 'manager')
  @ApiOperation({ summary: 'List current engagement scores (paginated, filterable)' })
  getScores(
    @GymId() gymId: number,
    @OptionalBranchId() branchId: number | null,
    @Query() filters: EngagementFiltersDto,
  ) {
    return this.engagementService.getScores(gymId, branchId, filters);
  }

  @Get('dashboard')
  @Roles('admin', 'branch_admin')
  @ApiOperation({ summary: 'Get engagement dashboard with risk distribution and stats' })
  getDashboard(
    @GymId() gymId: number,
    @OptionalBranchId() branchId: number | null,
  ) {
    return this.engagementService.getDashboard(gymId, branchId);
  }

  @Get('alerts')
  @Roles('admin', 'branch_admin', 'manager')
  @ApiOperation({ summary: 'List churn alerts (paginated, filterable)' })
  getAlerts(
    @GymId() gymId: number,
    @OptionalBranchId() branchId: number | null,
    @Query() filters: AlertFiltersDto,
  ) {
    return this.engagementService.getAlerts(gymId, branchId, filters);
  }

  @Get('scores/:userId')
  @Roles('admin', 'branch_admin', 'manager', 'trainer')
  @ApiOperation({ summary: 'Get engagement score for a specific user' })
  @ApiParam({ name: 'userId', type: Number })
  getScoreByUser(
    @Param('userId', ParseIntPipe) userId: number,
    @GymId() gymId: number,
  ) {
    return this.engagementService.getScoreByUser(userId, gymId);
  }

  @Get('scores/:userId/history')
  @Roles('admin', 'branch_admin', 'manager')
  @ApiOperation({ summary: 'Get engagement score history for a specific user (for trend chart)' })
  @ApiParam({ name: 'userId', type: Number })
  getScoreHistory(
    @Param('userId', ParseIntPipe) userId: number,
    @GymId() gymId: number,
  ) {
    return this.engagementService.getScoreHistory(userId, gymId);
  }

  // ─── Calculation Triggers ───

  @Post('calculate')
  @Roles('admin')
  @ApiOperation({ summary: 'Trigger full engagement score recalculation for all members' })
  calculateAll(@GymId() gymId: number) {
    return this.engagementService.calculateForAllMembers(gymId);
  }

  @Post('calculate/:userId')
  @Roles('admin', 'branch_admin')
  @ApiOperation({ summary: 'Trigger engagement score calculation for a specific user' })
  @ApiParam({ name: 'userId', type: Number })
  calculateForUser(
    @Param('userId', ParseIntPipe) userId: number,
    @GymId() gymId: number,
  ) {
    return this.engagementService.calculateForUser(userId, gymId);
  }

  // ─── Alert Actions ───

  @Patch('alerts/:id/acknowledge')
  @Roles('admin', 'branch_admin', 'manager')
  @ApiOperation({ summary: 'Acknowledge a churn alert' })
  @ApiParam({ name: 'id', type: Number })
  acknowledgeAlert(
    @Param('id', ParseIntPipe) id: number,
    @GymId() gymId: number,
    @UserId() userId: number,
    @Body() dto: AcknowledgeAlertDto,
  ) {
    return this.engagementService.acknowledgeAlert(id, gymId, userId, dto);
  }
}
