import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Put,
  Body,
  Param,
  Query,
  UseGuards,
  ParseIntPipe,
} from '@nestjs/common';
import { AppointmentsService } from './appointments.service';
import {
  CreateServiceDto,
  UpdateServiceDto,
  SetAvailabilityDto,
  CreateAppointmentDto,
  UpdateAppointmentDto,
  UpdateAppointmentStatusDto,
  CreateSessionPackageDto,
  AppointmentFiltersDto,
  AvailableSlotsDto,
} from './dto/appointment.dto';
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

@ApiTags('appointments')
@Controller('appointments')
@UseGuards(JwtAuthGuard, RolesGuard, PlanFeaturesGuard)
@PlanFeatures(PLAN_FEATURES.APPOINTMENT_BOOKING)
@ApiBearerAuth()
export class AppointmentsController {
  constructor(private readonly appointmentsService: AppointmentsService) {}

  // ─── Services ───

  @Get('services')
  @Roles('admin', 'branch_admin', 'manager', 'trainer', 'client')
  @ApiOperation({ summary: 'List PT/appointment services' })
  async findAllServices(
    @GymId() gymId: number,
    @OptionalBranchId() branchId: number | null,
  ) {
    return this.appointmentsService.findAllServices(gymId, branchId);
  }

  @Post('services')
  @Roles('admin', 'branch_admin', 'manager')
  @ApiOperation({ summary: 'Create a service' })
  async createService(
    @Body() dto: CreateServiceDto,
    @GymId() gymId: number,
    @OptionalBranchId() branchId: number | null,
  ) {
    return this.appointmentsService.createService(gymId, branchId, dto);
  }

  @Patch('services/:id')
  @Roles('admin', 'branch_admin', 'manager')
  @ApiOperation({ summary: 'Update a service' })
  async updateService(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateServiceDto,
    @GymId() gymId: number,
  ) {
    return this.appointmentsService.updateService(id, gymId, dto);
  }

  @Delete('services/:id')
  @Roles('admin', 'branch_admin', 'manager')
  @ApiOperation({ summary: 'Soft delete a service' })
  async deleteService(
    @Param('id', ParseIntPipe) id: number,
    @GymId() gymId: number,
  ) {
    return this.appointmentsService.deleteService(id, gymId);
  }

  // ─── Trainer Availability ───

  @Get('availability/:trainerId')
  @Roles('admin', 'branch_admin', 'manager', 'trainer', 'client')
  @ApiOperation({ summary: 'Get trainer availability' })
  async getAvailability(
    @Param('trainerId', ParseIntPipe) trainerId: number,
    @GymId() gymId: number,
  ) {
    return this.appointmentsService.getAvailability(trainerId, gymId);
  }

  @Put('availability')
  @Roles('admin', 'branch_admin', 'manager', 'trainer')
  @ApiOperation({ summary: 'Set/update trainer availability for a day' })
  async setAvailability(
    @Body() dto: SetAvailabilityDto,
    @GymId() gymId: number,
    @OptionalBranchId() branchId: number | null,
    @UserId() userId: number,
    @CurrentUserRole() userRole: string,
  ) {
    return this.appointmentsService.setAvailability(gymId, branchId, dto, userId, userRole);
  }

  // ─── Appointments ───

  @Get('available-slots')
  @Roles('admin', 'branch_admin', 'manager', 'trainer', 'client')
  @ApiOperation({ summary: 'Get available time slots for a trainer on a date' })
  async getAvailableSlots(
    @GymId() gymId: number,
    @Query() dto: AvailableSlotsDto,
  ) {
    return this.appointmentsService.getAvailableSlots(gymId, dto);
  }

  @Get('my')
  @Roles('admin', 'branch_admin', 'manager', 'trainer', 'client')
  @ApiOperation({ summary: 'Get current user\'s appointments' })
  async getMyAppointments(
    @GymId() gymId: number,
    @UserId() userId: number,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
    @Query('status') status?: string,
    @Query('fromDate') fromDate?: string,
    @Query('toDate') toDate?: string,
  ) {
    return this.appointmentsService.getMyAppointments(
      userId,
      gymId,
      page ? (parseInt(page, 10) || 1) : 1,
      limit ? (parseInt(limit, 10) || 20) : 20,
      { status, fromDate, toDate },
    );
  }

  @Get()
  @Roles('admin', 'branch_admin', 'manager', 'trainer')
  @ApiOperation({ summary: 'List appointments with filters' })
  async findAll(
    @GymId() gymId: number,
    @OptionalBranchId() branchId: number | null,
    @Query() filters: AppointmentFiltersDto,
    @UserId() userId: number,
    @CurrentUserRole() userRole: string,
  ) {
    return this.appointmentsService.findAllAppointments(gymId, branchId, filters, userId, userRole);
  }

  @Post()
  @Roles('admin', 'branch_admin', 'manager', 'trainer', 'client')
  @ApiOperation({ summary: 'Book an appointment (checks trainer conflicts)' })
  async create(
    @Body() dto: CreateAppointmentDto,
    @GymId() gymId: number,
    @OptionalBranchId() branchId: number | null,
    @UserId() userId: number,
    @CurrentUserRole() userRole: string,
  ) {
    return this.appointmentsService.createAppointment(gymId, branchId, dto, userId, userRole);
  }

  @Patch(':id')
  @Roles('admin', 'branch_admin', 'manager', 'trainer')
  @ApiOperation({ summary: 'Update an appointment' })
  async update(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateAppointmentDto,
    @GymId() gymId: number,
    @UserId() userId: number,
    @CurrentUserRole() userRole: string,
  ) {
    return this.appointmentsService.updateAppointment(id, gymId, dto, userId, userRole);
  }

  @Patch(':id/status')
  @Roles('admin', 'branch_admin', 'manager', 'trainer', 'client')
  @ApiOperation({ summary: 'Update appointment status (confirm, complete, cancel, no_show)' })
  async updateStatus(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateAppointmentStatusDto,
    @GymId() gymId: number,
    @UserId() userId: number,
    @CurrentUserRole() userRole: string,
  ) {
    return this.appointmentsService.updateAppointmentStatus(id, gymId, dto, userId, userRole);
  }

  // ─── Session Packages ───

  @Get('packages')
  @Roles('admin', 'branch_admin', 'manager')
  @ApiOperation({ summary: 'List session packages' })
  async findAllPackages(
    @GymId() gymId: number,
    @OptionalBranchId() branchId: number | null,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    return this.appointmentsService.findAllPackages(
      gymId,
      branchId,
      page ? (parseInt(page, 10) || 1) : 1,
      limit ? (parseInt(limit, 10) || 20) : 20,
    );
  }

  @Post('packages')
  @Roles('admin', 'branch_admin', 'manager')
  @ApiOperation({ summary: 'Create a session package' })
  async createPackage(
    @Body() dto: CreateSessionPackageDto,
    @GymId() gymId: number,
    @OptionalBranchId() branchId: number | null,
  ) {
    return this.appointmentsService.createPackage(gymId, branchId, dto);
  }

  @Get('packages/user/:userId')
  @Roles('admin', 'branch_admin', 'manager', 'trainer', 'client')
  @ApiOperation({ summary: 'Get session packages for a user' })
  async getUserPackages(
    @Param('userId', ParseIntPipe) userId: number,
    @GymId() gymId: number,
    @UserId() authUserId: number,
    @CurrentUserRole() userRole: string,
  ) {
    return this.appointmentsService.getUserPackages(userId, gymId, authUserId, userRole);
  }

  // ─── Single Appointment ───

  @Get(':id')
  @Roles('admin', 'branch_admin', 'manager', 'trainer', 'client')
  @ApiOperation({ summary: 'Get a single appointment by ID' })
  async findOne(
    @Param('id', ParseIntPipe) id: number,
    @GymId() gymId: number,
    @UserId() userId: number,
    @CurrentUserRole() userRole: string,
  ) {
    return this.appointmentsService.findOneAppointment(id, gymId, userId, userRole);
  }
}
