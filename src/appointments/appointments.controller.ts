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
import { AppointmentsService } from './appointments.service';
import { NotificationsGateway } from '../notifications/notifications.gateway';
import {
  CreateServiceDto,
  UpdateServiceDto,
  CreateAppointmentDto,
  UpdateAppointmentDto,
  UpdateAppointmentStatusDto,
  AppointmentFiltersDto,
  AvailableSlotsDto,
} from './dto/appointment.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { ManagerPermissionsGuard } from '../auth/guards/manager-permissions.guard';
import { RequireBranchGuard } from '../auth/guards/require-branch.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { ManagerPermission } from '../auth/decorators/manager-permission.decorator';
import { GymId } from '../common/decorators/gym-id.decorator';
import { UserId, CurrentUserRole } from '../common/decorators/user-id.decorator';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';

@ApiTags('appointments')
@Controller('appointments')
@UseGuards(JwtAuthGuard, RolesGuard)
@ApiBearerAuth()
export class AppointmentsController {
  constructor(
    private readonly appointmentsService: AppointmentsService,
    private readonly notificationsGateway: NotificationsGateway,
  ) {}

  // ─── Services ───

  @Get('services')
  @Roles('admin', 'manager', 'trainer', 'client')
  @ApiOperation({ summary: 'List PT/appointment services' })
  async findAllServices(
    @GymId() gymId: number,
  ) {
    return this.appointmentsService.findAllServices(gymId);
  }

  @Post('services')
  @Roles('admin', 'manager')
  @UseGuards(ManagerPermissionsGuard)
  @ManagerPermission('appointments', 'create')
  @ApiOperation({ summary: 'Create a service' })
  async createService(
    @Body() dto: CreateServiceDto,
    @GymId() gymId: number,
  ) {
    const result = await this.appointmentsService.createService(gymId, dto);
    this.notificationsGateway.emitServiceChanged(gymId, { action: 'created' });
    return result;
  }

  @Patch('services/:id')
  @Roles('admin', 'manager')
  @UseGuards(ManagerPermissionsGuard)
  @ManagerPermission('appointments', 'update')
  @ApiOperation({ summary: 'Update a service' })
  async updateService(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateServiceDto,
    @GymId() gymId: number,
  ) {
    const result = await this.appointmentsService.updateService(id, gymId, dto);
    this.notificationsGateway.emitServiceChanged(gymId, { action: 'updated' });
    return result;
  }

  @Delete('services/:id')
  @Roles('admin', 'manager')
  @UseGuards(ManagerPermissionsGuard)
  @ManagerPermission('appointments', 'delete')
  @ApiOperation({ summary: 'Soft delete a service' })
  async deleteService(
    @Param('id', ParseIntPipe) id: number,
    @GymId() gymId: number,
  ) {
    const result = await this.appointmentsService.deleteService(id, gymId);
    this.notificationsGateway.emitServiceChanged(gymId, { action: 'deleted' });
    return result;
  }

  // ─── Trainer Availability ───

  @Get('availability/:trainerId')
  @Roles('admin', 'manager', 'trainer', 'client')
  @ApiOperation({ summary: 'Get trainer availability' })
  async getAvailability(
    @Param('trainerId', ParseIntPipe) trainerId: number,
    @GymId() gymId: number,
  ) {
    return this.appointmentsService.getAvailability(trainerId, gymId);
  }

  // ─── Appointments ───

  @Get('available-slots')
  @Roles('admin', 'manager', 'trainer', 'client')
  @ApiOperation({ summary: 'Get available time slots for a trainer on a date' })
  async getAvailableSlots(
    @GymId() gymId: number,
    @Query() dto: AvailableSlotsDto,
  ) {
    return this.appointmentsService.getAvailableSlots(gymId, dto);
  }

  @Get('my')
  @Roles('admin', 'manager', 'trainer', 'client')
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
  @Roles('admin', 'manager', 'trainer')
  @ApiOperation({ summary: 'List appointments with filters' })
  async findAll(
    @GymId() gymId: number,
    @Query() filters: AppointmentFiltersDto,
    @UserId() userId: number,
    @CurrentUserRole() userRole: string,
  ) {
    return this.appointmentsService.findAllAppointments(gymId, filters, userId, userRole);
  }

  @Post()
  @Roles('admin', 'manager', 'trainer', 'client')
  @UseGuards(RequireBranchGuard, ManagerPermissionsGuard)
  @ManagerPermission('appointments', 'create')
  @ApiOperation({ summary: 'Book an appointment (checks trainer conflicts)' })
  async create(
    @Body() dto: CreateAppointmentDto,
    @GymId() gymId: number,
    @UserId() userId: number,
    @CurrentUserRole() userRole: string,
  ) {
    const result = await this.appointmentsService.createAppointment(gymId, dto, userId, userRole);
    this.notificationsGateway.emitAppointmentChanged(gymId, { action: 'created' });
    return result;
  }

  @Patch(':id')
  @Roles('admin', 'manager', 'trainer')
  @UseGuards(RequireBranchGuard, ManagerPermissionsGuard)
  @ManagerPermission('appointments', 'update')
  @ApiOperation({ summary: 'Update an appointment' })
  async update(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateAppointmentDto,
    @GymId() gymId: number,
    @UserId() userId: number,
    @CurrentUserRole() userRole: string,
  ) {
    const result = await this.appointmentsService.updateAppointment(id, gymId, dto, userId, userRole);
    this.notificationsGateway.emitAppointmentChanged(gymId, { action: 'updated' });
    return result;
  }

  @Patch(':id/status')
  @Roles('admin', 'manager', 'trainer', 'client')
  @UseGuards(RequireBranchGuard, ManagerPermissionsGuard)
  @ManagerPermission('appointments', 'update')
  @ApiOperation({ summary: 'Update appointment status (confirm, complete, cancel, no_show)' })
  async updateStatus(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateAppointmentStatusDto,
    @GymId() gymId: number,
    @UserId() userId: number,
    @CurrentUserRole() userRole: string,
  ) {
    const result = await this.appointmentsService.updateAppointmentStatus(id, gymId, dto, userId, userRole);
    this.notificationsGateway.emitAppointmentChanged(gymId, { action: 'status_changed' });
    return result;
  }
}
