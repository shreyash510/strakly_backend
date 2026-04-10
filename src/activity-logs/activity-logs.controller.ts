import {
  Controller,
  Get,
  Query,
  Param,
  UseGuards,
  ParseIntPipe,
  Req,
} from '@nestjs/common';
import { ActivityLogsService } from './activity-logs.service';
import { ActivityLogFiltersDto } from './dto/activity-log.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { GymId } from '../common/decorators/gym-id.decorator';
import type { AuthenticatedRequest } from '../common/types';
import { resolveEffectiveBranchId } from '../common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';

@ApiTags('activity-logs')
@ApiBearerAuth()
@Controller('activity-logs')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('superadmin', 'admin', 'manager')
export class ActivityLogsController {
  constructor(private readonly activityLogsService: ActivityLogsService) {}

  @Get()
  async findAll(
    @GymId() gymId: number,
    @Query() filters: ActivityLogFiltersDto,
  ) {
    return this.activityLogsService.findAll(gymId, filters);
  }

  @Get('stats')
  async getStats(
    @Req() req: AuthenticatedRequest,
    @GymId() gymId: number,
    @Query('branchId') branchId?: string,
  ) {
    return this.activityLogsService.getStats(gymId, resolveEffectiveBranchId(req.user, branchId) ?? undefined);
  }

  @Get('target/:type/:id')
  async findByTarget(
    @Param('type') targetType: string,
    @Param('id', ParseIntPipe) targetId: number,
    @GymId() gymId: number,
  ) {
    return this.activityLogsService.findByTarget(
      targetType,
      targetId,
      gymId,
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
