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
import { GymId } from '../common/decorators/gym-id.decorator';
import { BranchId } from '../common/decorators/branch-id.decorator';

@Controller('activity-logs')
@UseGuards(JwtAuthGuard)
export class ActivityLogsController {
  constructor(private readonly activityLogsService: ActivityLogsService) {}

  @Get()
  async findAll(
    @GymId() gymId: number,
    @BranchId() branchId: number | null,
    @Query() filters: ActivityLogFiltersDto,
  ) {
    return this.activityLogsService.findAll(gymId, branchId, filters);
  }

  @Get('target/:type/:id')
  async findByTarget(
    @Param('type') targetType: string,
    @Param('id', ParseIntPipe) targetId: number,
    @GymId() gymId: number,
    @BranchId() branchId: number | null,
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
