import {
  Controller,
  Get,
  Query,
  Param,
  UseGuards,
  ParseIntPipe,
} from '@nestjs/common';
import { ActivityLogsService } from './activity-logs.service';
import { ActivityLogFiltersDto } from './dto/activity-log.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { PlanFeaturesGuard } from '../auth/guards/plan-features.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { PlanFeatures } from '../auth/decorators/plan-features.decorator';
import { PLAN_FEATURES } from '../common/constants/features';
import { GymId } from '../common/decorators/gym-id.decorator';
import { OptionalBranchId } from '../common/decorators/branch-id.decorator';

@Controller('activity-logs')
@UseGuards(JwtAuthGuard, RolesGuard, PlanFeaturesGuard)
@Roles('superadmin', 'admin', 'branch_admin', 'manager')
@PlanFeatures(PLAN_FEATURES.ACTIVITY_LOGS)
export class ActivityLogsController {
  constructor(private readonly activityLogsService: ActivityLogsService) {}

  @Get()
  async findAll(
    @GymId() gymId: number,
    @OptionalBranchId() branchId: number | null,
    @Query() filters: ActivityLogFiltersDto,
  ) {
    return this.activityLogsService.findAll(gymId, branchId, filters);
  }

  @Get('target/:type/:id')
  async findByTarget(
    @Param('type') targetType: string,
    @Param('id', ParseIntPipe) targetId: number,
    @GymId() gymId: number,
    @OptionalBranchId() branchId: number | null,
  ) {
    return this.activityLogsService.findByTarget(
      targetType,
      targetId,
      gymId,
      branchId,
    );
  }

  @Get('actor/:type/:id')
  async findByActor(
    @Param('type') actorType: string,
    @Param('id', ParseIntPipe) actorId: number,
    @GymId() gymId: number,
    @Query('limit') limit?: number,
  ) {
    return this.activityLogsService.findByActor(
      actorId,
      actorType,
      gymId,
      limit || 50,
    );
  }
}
