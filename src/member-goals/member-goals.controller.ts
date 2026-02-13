import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  Query,
  UseGuards,
  ParseIntPipe,
} from '@nestjs/common';
import { MemberGoalsService } from './member-goals.service';
import {
  CreateGoalDto,
  UpdateGoalDto,
  UpdateProgressDto,
  UpdateStatusDto,
  GoalFiltersDto,
  CreateMilestoneDto,
  UpdateMilestoneDto,
} from './dto/member-goal.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { GymId } from '../common/decorators/gym-id.decorator';
import { OptionalBranchId } from '../common/decorators/branch-id.decorator';
import { UserId } from '../common/decorators/user-id.decorator';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';

@ApiTags('member-goals')
@Controller('member-goals')
@UseGuards(JwtAuthGuard, RolesGuard)
@ApiBearerAuth()
export class MemberGoalsController {
  constructor(private readonly memberGoalsService: MemberGoalsService) {}

  @Get()
  @Roles('superadmin', 'admin', 'branch_admin', 'manager', 'trainer')
  @ApiOperation({ summary: 'Get member goals with filters' })
  async findAll(
    @GymId() gymId: number,
    @OptionalBranchId() branchId: number | null,
    @Query() filters: GoalFiltersDto,
  ) {
    return this.memberGoalsService.findByUser(gymId, branchId, filters);
  }

  @Get('user/:userId')
  @Roles('superadmin', 'admin', 'branch_admin', 'manager', 'trainer')
  @ApiOperation({ summary: 'Get goals for a specific user' })
  async findByUser(
    @Param('userId', ParseIntPipe) userId: number,
    @GymId() gymId: number,
    @OptionalBranchId() branchId: number | null,
    @Query() filters: GoalFiltersDto,
  ) {
    return this.memberGoalsService.findByUser(gymId, branchId, { ...filters, userId });
  }

  @Get('me')
  @Roles('superadmin', 'admin', 'branch_admin', 'manager', 'trainer', 'client')
  @ApiOperation({ summary: 'Get my own goals' })
  async findMyGoals(
    @GymId() gymId: number,
    @UserId() userId: number,
    @OptionalBranchId() branchId: number | null,
    @Query() filters: GoalFiltersDto,
  ) {
    return this.memberGoalsService.findMyGoals(gymId, userId, branchId, filters);
  }

  @Get(':id/milestones')
  @Roles('superadmin', 'admin', 'branch_admin', 'manager', 'trainer', 'client')
  @ApiOperation({ summary: 'Get milestones for a goal' })
  async getMilestones(
    @Param('id', ParseIntPipe) id: number,
    @GymId() gymId: number,
  ) {
    return this.memberGoalsService.getMilestones(id, gymId);
  }

  @Post(':id/milestones')
  @Roles('superadmin', 'admin', 'branch_admin', 'manager', 'trainer')
  @ApiOperation({ summary: 'Create a milestone for a goal' })
  async createMilestone(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: CreateMilestoneDto,
    @GymId() gymId: number,
  ) {
    return this.memberGoalsService.createMilestone(id, gymId, dto);
  }

  @Patch('milestones/:milestoneId')
  @Roles('superadmin', 'admin', 'branch_admin', 'manager', 'trainer')
  @ApiOperation({ summary: 'Update a milestone' })
  async updateMilestone(
    @Param('milestoneId', ParseIntPipe) milestoneId: number,
    @Body() dto: UpdateMilestoneDto,
    @GymId() gymId: number,
  ) {
    return this.memberGoalsService.updateMilestone(milestoneId, gymId, dto);
  }

  @Delete('milestones/:milestoneId')
  @Roles('superadmin', 'admin', 'branch_admin', 'manager')
  @ApiOperation({ summary: 'Delete a milestone' })
  async deleteMilestone(
    @Param('milestoneId', ParseIntPipe) milestoneId: number,
    @GymId() gymId: number,
  ) {
    return this.memberGoalsService.deleteMilestone(milestoneId, gymId);
  }

  @Get(':id')
  @Roles('superadmin', 'admin', 'branch_admin', 'manager', 'trainer', 'client')
  @ApiOperation({ summary: 'Get a goal by ID' })
  async findOne(
    @Param('id', ParseIntPipe) id: number,
    @GymId() gymId: number,
  ) {
    return this.memberGoalsService.findOne(id, gymId);
  }

  @Post()
  @Roles('superadmin', 'admin', 'branch_admin', 'manager', 'trainer')
  @ApiOperation({ summary: 'Create a member goal' })
  async create(
    @Body() dto: CreateGoalDto,
    @GymId() gymId: number,
    @OptionalBranchId() branchId: number | null,
    @UserId() userId: number,
  ) {
    return this.memberGoalsService.create(dto, gymId, branchId, userId);
  }

  @Patch(':id')
  @Roles('superadmin', 'admin', 'branch_admin', 'manager', 'trainer')
  @ApiOperation({ summary: 'Update a member goal' })
  async update(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateGoalDto,
    @GymId() gymId: number,
  ) {
    return this.memberGoalsService.update(id, gymId, dto);
  }

  @Patch(':id/progress')
  @Roles('superadmin', 'admin', 'branch_admin', 'manager', 'trainer', 'client')
  @ApiOperation({ summary: 'Update goal progress' })
  async updateProgress(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateProgressDto,
    @GymId() gymId: number,
  ) {
    return this.memberGoalsService.updateProgress(id, gymId, dto);
  }

  @Patch(':id/status')
  @Roles('superadmin', 'admin', 'branch_admin', 'manager', 'trainer')
  @ApiOperation({ summary: 'Update goal status' })
  async updateStatus(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateStatusDto,
    @GymId() gymId: number,
  ) {
    return this.memberGoalsService.updateStatus(id, gymId, dto);
  }

  @Delete(':id')
  @Roles('superadmin', 'admin', 'branch_admin', 'manager')
  @ApiOperation({ summary: 'Soft delete a member goal' })
  async remove(
    @Param('id', ParseIntPipe) id: number,
    @GymId() gymId: number,
    @UserId() userId: number,
  ) {
    return this.memberGoalsService.softDelete(id, gymId, userId);
  }
}
