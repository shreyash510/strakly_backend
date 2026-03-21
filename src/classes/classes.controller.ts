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
import { Roles } from '../auth/decorators/roles.decorator';
import { GymId } from '../common/decorators/gym-id.decorator';
import { UserId, CurrentUserRole } from '../common/decorators/user-id.decorator';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { ManagerPermissionsGuard } from '../auth/guards/manager-permissions.guard';
import { ManagerPermission } from '../auth/decorators/manager-permission.decorator';

@ApiTags('classes')
@Controller('classes')
@UseGuards(JwtAuthGuard, RolesGuard, ManagerPermissionsGuard)
@ApiBearerAuth()
export class ClassesController {
  constructor(private readonly classesService: ClassesService) {}

  // ─── Class Types ───

  @Get('types')
  @Roles('admin', 'manager', 'trainer', 'client')
  @ApiOperation({ summary: 'List class types' })
  async findAllTypes(
    @GymId() gymId: number,
    @Query() filters: ClassFiltersDto,
  ) {
    return this.classesService.findAllTypes(gymId, filters);
  }

  @Get('types/:id')
  @Roles('admin', 'manager', 'trainer', 'client')
  @ApiOperation({ summary: 'Get a single class type' })
  async findOneType(
    @Param('id', ParseIntPipe) id: number,
    @GymId() gymId: number,
  ) {
    return this.classesService.findOneType(id, gymId);
  }

  @Post('types')
  @Roles('admin', 'manager')
  @ManagerPermission('classes', 'create')
  @ApiOperation({ summary: 'Create a class type' })
  async createType(
    @Body() dto: CreateClassTypeDto,
    @GymId() gymId: number,
  ) {
    return this.classesService.createType(gymId, dto);
  }

  @Patch('types/:id')
  @Roles('admin', 'manager')
  @ManagerPermission('classes', 'update')
  @ApiOperation({ summary: 'Update a class type' })
  async updateType(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateClassTypeDto,
    @GymId() gymId: number,
  ) {
    return this.classesService.updateType(id, gymId, dto);
  }

  @Delete('types/:id')
  @Roles('admin', 'manager')
  @ManagerPermission('classes', 'delete')
  @ApiOperation({ summary: 'Soft delete a class type' })
  async deleteType(
    @Param('id', ParseIntPipe) id: number,
    @GymId() gymId: number,
  ) {
    return this.classesService.deleteType(id, gymId);
  }

  // ─── Schedules ───

  @Get('schedules')
  @Roles('admin', 'manager', 'trainer', 'client')
  @ApiOperation({ summary: 'List class schedules' })
  async findAllSchedules(
    @GymId() gymId: number,
  ) {
    return this.classesService.findAllSchedules(gymId);
  }

  @Post('schedules')
  @Roles('admin', 'manager')
  @ManagerPermission('classes', 'create')
  @ApiOperation({ summary: 'Create a class schedule' })
  async createSchedule(
    @Body() dto: CreateClassScheduleDto,
    @GymId() gymId: number,
  ) {
    return this.classesService.createSchedule(gymId, dto);
  }

  @Patch('schedules/:id')
  @Roles('admin', 'manager')
  @ManagerPermission('classes', 'update')
  @ApiOperation({ summary: 'Update a class schedule' })
  async updateSchedule(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateClassScheduleDto,
    @GymId() gymId: number,
  ) {
    return this.classesService.updateSchedule(id, gymId, dto);
  }

  @Delete('schedules/:id')
  @Roles('admin', 'manager')
  @ManagerPermission('classes', 'delete')
  @ApiOperation({ summary: 'Soft delete a class schedule' })
  async deleteSchedule(
    @Param('id', ParseIntPipe) id: number,
    @GymId() gymId: number,
  ) {
    return this.classesService.deleteSchedule(id, gymId);
  }

  // ─── Sessions ───

  @Get('sessions')
  @Roles('admin', 'manager', 'trainer', 'client')
  @ApiOperation({ summary: 'List class sessions with filters' })
  async findAllSessions(
    @GymId() gymId: number,
    @Query() filters: SessionFiltersDto,
  ) {
    return this.classesService.findAllSessions(gymId, filters);
  }

  @Post('sessions/generate')
  @Roles('admin', 'manager')
  @ManagerPermission('classes', 'create')
  @ApiOperation({ summary: 'Generate sessions from schedules for a date range' })
  async generateSessions(
    @Body() dto: GenerateSessionsDto,
    @GymId() gymId: number,
  ) {
    return this.classesService.generateSessions(gymId, dto);
  }

  @Get('sessions/:id')
  @Roles('admin', 'manager', 'trainer', 'client')
  @ApiOperation({ summary: 'Get a single session by ID' })
  async findOneSession(
    @Param('id', ParseIntPipe) id: number,
    @GymId() gymId: number,
  ) {
    return this.classesService.findOneSession(id, gymId);
  }

  @Patch('sessions/:id')
  @Roles('admin', 'manager', 'trainer')
  @ManagerPermission('classes', 'update')
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
  @Roles('admin', 'manager', 'trainer')
  @ApiOperation({ summary: 'Get bookings for a session' })
  async getSessionBookings(
    @Param('id', ParseIntPipe) id: number,
    @GymId() gymId: number,
  ) {
    return this.classesService.getSessionBookings(id, gymId);
  }

  @Post('sessions/:id/book')
  @Roles('admin', 'manager', 'trainer', 'client')
  @ManagerPermission('classes', 'create')
  @ApiOperation({ summary: 'Book into a session (auto-waitlist if full)' })
  async bookSession(
    @Param('id', ParseIntPipe) id: number,
    @GymId() gymId: number,
    @UserId() userId: number,
  ) {
    return this.classesService.bookSession(id, userId, gymId);
  }

  @Patch('bookings/:id/status')
  @Roles('admin', 'manager', 'trainer', 'client')
  @ManagerPermission('classes', 'update')
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
  @Roles('admin', 'manager', 'trainer', 'client')
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
