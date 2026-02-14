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
import { ClassesService } from './classes.service';
import {
  CreateClassTypeDto,
  UpdateClassTypeDto,
  CreateClassScheduleDto,
  UpdateClassScheduleDto,
  GenerateSessionsDto,
  UpdateSessionDto,
  UpdateBookingStatusDto,
  ClassFiltersDto,
  SessionFiltersDto,
} from './dto/class.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { PlanFeaturesGuard } from '../auth/guards/plan-features.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { PlanFeatures } from '../auth/decorators/plan-features.decorator';
import { PLAN_FEATURES } from '../common/constants/features';
import { GymId } from '../common/decorators/gym-id.decorator';
import { OptionalBranchId } from '../common/decorators/branch-id.decorator';
import { UserId, CurrentUserRole } from '../common/decorators/user-id.decorator';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';

@ApiTags('classes')
@Controller('classes')
@UseGuards(JwtAuthGuard, RolesGuard, PlanFeaturesGuard)
@PlanFeatures(PLAN_FEATURES.CLASS_SCHEDULING)
@ApiBearerAuth()
export class ClassesController {
  constructor(private readonly classesService: ClassesService) {}

  // ─── Class Types ───

  @Get('types')
  @Roles('admin', 'branch_admin', 'manager', 'trainer', 'client')
  @ApiOperation({ summary: 'List class types' })
  async findAllTypes(
    @GymId() gymId: number,
    @OptionalBranchId() branchId: number | null,
    @Query() filters: ClassFiltersDto,
  ) {
    return this.classesService.findAllTypes(gymId, branchId, filters);
  }

  @Get('types/:id')
  @Roles('admin', 'branch_admin', 'manager', 'trainer', 'client')
  @ApiOperation({ summary: 'Get a single class type' })
  async findOneType(
    @Param('id', ParseIntPipe) id: number,
    @GymId() gymId: number,
  ) {
    return this.classesService.findOneType(id, gymId);
  }

  @Post('types')
  @Roles('admin', 'branch_admin', 'manager')
  @ApiOperation({ summary: 'Create a class type' })
  async createType(
    @Body() dto: CreateClassTypeDto,
    @GymId() gymId: number,
    @OptionalBranchId() branchId: number | null,
  ) {
    return this.classesService.createType(gymId, branchId, dto);
  }

  @Patch('types/:id')
  @Roles('admin', 'branch_admin', 'manager')
  @ApiOperation({ summary: 'Update a class type' })
  async updateType(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateClassTypeDto,
    @GymId() gymId: number,
  ) {
    return this.classesService.updateType(id, gymId, dto);
  }

  @Delete('types/:id')
  @Roles('admin', 'branch_admin', 'manager')
  @ApiOperation({ summary: 'Soft delete a class type' })
  async deleteType(
    @Param('id', ParseIntPipe) id: number,
    @GymId() gymId: number,
  ) {
    return this.classesService.deleteType(id, gymId);
  }

  // ─── Schedules ───

  @Get('schedules')
  @Roles('admin', 'branch_admin', 'manager', 'trainer', 'client')
  @ApiOperation({ summary: 'List class schedules' })
  async findAllSchedules(
    @GymId() gymId: number,
    @OptionalBranchId() branchId: number | null,
  ) {
    return this.classesService.findAllSchedules(gymId, branchId);
  }

  @Post('schedules')
  @Roles('admin', 'branch_admin', 'manager')
  @ApiOperation({ summary: 'Create a class schedule' })
  async createSchedule(
    @Body() dto: CreateClassScheduleDto,
    @GymId() gymId: number,
    @OptionalBranchId() branchId: number | null,
  ) {
    return this.classesService.createSchedule(gymId, branchId, dto);
  }

  @Patch('schedules/:id')
  @Roles('admin', 'branch_admin', 'manager')
  @ApiOperation({ summary: 'Update a class schedule' })
  async updateSchedule(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateClassScheduleDto,
    @GymId() gymId: number,
  ) {
    return this.classesService.updateSchedule(id, gymId, dto);
  }

  @Delete('schedules/:id')
  @Roles('admin', 'branch_admin', 'manager')
  @ApiOperation({ summary: 'Soft delete a class schedule' })
  async deleteSchedule(
    @Param('id', ParseIntPipe) id: number,
    @GymId() gymId: number,
  ) {
    return this.classesService.deleteSchedule(id, gymId);
  }

  // ─── Sessions ───

  @Get('sessions')
  @Roles('admin', 'branch_admin', 'manager', 'trainer', 'client')
  @ApiOperation({ summary: 'List class sessions with filters' })
  async findAllSessions(
    @GymId() gymId: number,
    @OptionalBranchId() branchId: number | null,
    @Query() filters: SessionFiltersDto,
  ) {
    return this.classesService.findAllSessions(gymId, branchId, filters);
  }

  @Post('sessions/generate')
  @Roles('admin', 'branch_admin', 'manager')
  @ApiOperation({ summary: 'Generate sessions from schedules for a date range' })
  async generateSessions(
    @Body() dto: GenerateSessionsDto,
    @GymId() gymId: number,
    @OptionalBranchId() branchId: number | null,
  ) {
    return this.classesService.generateSessions(gymId, branchId, dto);
  }

  @Get('sessions/:id')
  @Roles('admin', 'branch_admin', 'manager', 'trainer', 'client')
  @ApiOperation({ summary: 'Get a single session by ID' })
  async findOneSession(
    @Param('id', ParseIntPipe) id: number,
    @GymId() gymId: number,
  ) {
    return this.classesService.findOneSession(id, gymId);
  }

  @Patch('sessions/:id')
  @Roles('admin', 'branch_admin', 'manager', 'trainer')
  @ApiOperation({ summary: 'Update session (cancel, complete, change instructor)' })
  async updateSession(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateSessionDto,
    @GymId() gymId: number,
  ) {
    return this.classesService.updateSession(id, gymId, dto);
  }

  // ─── Bookings ───

  @Get('sessions/:id/bookings')
  @Roles('admin', 'branch_admin', 'manager', 'trainer')
  @ApiOperation({ summary: 'Get bookings for a session' })
  async getSessionBookings(
    @Param('id', ParseIntPipe) id: number,
    @GymId() gymId: number,
  ) {
    return this.classesService.getSessionBookings(id, gymId);
  }

  @Post('sessions/:id/book')
  @Roles('admin', 'branch_admin', 'manager', 'trainer', 'client')
  @ApiOperation({ summary: 'Book into a session (auto-waitlist if full)' })
  async bookSession(
    @Param('id', ParseIntPipe) id: number,
    @GymId() gymId: number,
    @UserId() userId: number,
  ) {
    return this.classesService.bookSession(id, userId, gymId);
  }

  @Patch('bookings/:id/status')
  @Roles('admin', 'branch_admin', 'manager', 'trainer', 'client')
  @ApiOperation({ summary: 'Update booking status (attend, no_show, cancel)' })
  async updateBookingStatus(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateBookingStatusDto,
    @GymId() gymId: number,
    @UserId() userId: number,
    @CurrentUserRole() userRole: string,
  ) {
    return this.classesService.updateBookingStatus(id, gymId, dto, userId, userRole);
  }

  @Get('my-bookings')
  @Roles('admin', 'branch_admin', 'manager', 'trainer', 'client')
  @ApiOperation({ summary: 'Get current user\'s class bookings' })
  async getMyBookings(
    @GymId() gymId: number,
    @UserId() userId: number,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
    @Query('status') status?: string,
    @Query('fromDate') fromDate?: string,
    @Query('toDate') toDate?: string,
  ) {
    return this.classesService.getMyBookings(
      userId,
      gymId,
      page ? (parseInt(page, 10) || 1) : 1,
      limit ? (parseInt(limit, 10) || 20) : 20,
      { status, fromDate, toDate },
    );
  }
}
