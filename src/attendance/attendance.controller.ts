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
  ForbiddenException,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiHeader, ApiQuery } from '@nestjs/swagger';
import { AttendanceService } from './attendance.service';
import { MarkAttendanceDto, CheckOutDto } from './dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';

// Helper to get gymId based on user role
// Managers are restricted to their own gym, admins can access all or specify
async function resolveGymId(
  service: AttendanceService,
  userRole: string,
  userId: number,
  requestedGymId?: number,
): Promise<number | undefined> {
  if (userRole === 'manager') {
    // Managers can only access their own gym
    const managerGymId = await service.getUserGymId(userId);
    if (!managerGymId) {
      throw new ForbiddenException('Manager is not assigned to any gym');
    }
    // If they requested a specific gym, make sure it's their gym
    if (requestedGymId && requestedGymId !== managerGymId) {
      throw new ForbiddenException('You can only access attendance for your own gym');
    }
    return managerGymId;
  }
  // Admins and superadmins can access any gym or all gyms
  return requestedGymId;
}

@ApiTags('attendance')
@Controller('attendance')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class AttendanceController {
  constructor(private readonly attendanceService: AttendanceService) {}

  // =====================
  // SEARCH USER BY CODE
  // =====================

  @Get('search/:code')
  @ApiOperation({ summary: 'Search user by attendance code' })
  async searchUserByCode(@Param('code') code: string) {
    const user = await this.attendanceService.searchUserByCode(code);
    if (!user) {
      return null;
    }
    return user;
  }

  // =====================
  // MARK ATTENDANCE (Check-In)
  // =====================

  @Post('mark')
  @UseGuards(RolesGuard)
  @Roles('superadmin', 'admin', 'manager', 'trainer')
  @ApiOperation({ summary: 'Mark attendance (check-in) for a user at a gym' })
  async markAttendance(@Body() body: MarkAttendanceDto, @Request() req: any) {
    // For managers, verify they can only mark attendance at their own gym
    const gymId = await resolveGymId(
      this.attendanceService,
      req.user.role,
      req.user.userId,
      body.gymId,
    );

    if (!gymId) {
      throw new BadRequestException('Gym ID is required');
    }

    // Search for user by attendance code
    const user = await this.attendanceService.searchUserByCode(body.code);
    if (!user) {
      throw new BadRequestException('Invalid attendance code');
    }

    return this.attendanceService.markAttendance(
      {
        id: user.id,
        name: user.name,
        email: user.email,
        attendanceCode: user.attendanceCode,
      },
      body.staffId,
      gymId,
      body.checkInMethod || 'code',
    );
  }

  // =====================
  // CHECK OUT
  // =====================

  @Patch('checkout/:id')
  @UseGuards(RolesGuard)
  @Roles('superadmin', 'admin', 'manager', 'trainer')
  @ApiOperation({ summary: 'Check out a user' })
  async checkOut(
    @Param('id') attendanceId: string,
    @Body() body?: CheckOutDto,
  ) {
    return this.attendanceService.checkOut(
      parseInt(attendanceId),
      body?.staffId,
    );
  }

  // =====================
  // CURRENT USER ATTENDANCE
  // =====================

  @Get('me')
  @ApiOperation({ summary: 'Get current user attendance history' })
  async getMyAttendance(
    @Request() req: any,
    @Query('limit') limit?: number,
  ) {
    return this.attendanceService.getUserAttendance(req.user.userId, limit || 50);
  }

  // =====================
  // FETCH ATTENDANCE
  // =====================

  @Get('today')
  @UseGuards(RolesGuard)
  @Roles('superadmin', 'admin', 'manager', 'trainer')
  @ApiOperation({ summary: "Get today's attendance records (filtered by gym for managers)" })
  @ApiQuery({ name: 'gymId', required: false, description: 'Filter by gym ID' })
  async getTodayAttendance(
    @Request() req: any,
    @Query('gymId') gymId?: string,
  ) {
    const resolvedGymId = await resolveGymId(
      this.attendanceService,
      req.user.role,
      req.user.userId,
      gymId ? parseInt(gymId) : undefined,
    );
    return this.attendanceService.getTodayAttendance(resolvedGymId);
  }

  @Get('date/:date')
  @UseGuards(RolesGuard)
  @Roles('superadmin', 'admin', 'manager', 'trainer')
  @ApiOperation({ summary: 'Get attendance records for a specific date (filtered by gym for managers)' })
  @ApiQuery({ name: 'gymId', required: false, description: 'Filter by gym ID' })
  async getAttendanceByDate(
    @Param('date') date: string,
    @Request() req: any,
    @Query('gymId') gymId?: string,
  ) {
    const resolvedGymId = await resolveGymId(
      this.attendanceService,
      req.user.role,
      req.user.userId,
      gymId ? parseInt(gymId) : undefined,
    );
    return this.attendanceService.getAttendanceByDate(date, resolvedGymId);
  }

  @Get('user')
  @UseGuards(RolesGuard)
  @Roles('superadmin', 'admin', 'manager', 'trainer')
  @ApiOperation({ summary: "Get a user's attendance history (filtered by gym for managers)" })
  @ApiHeader({ name: 'x-user-id', required: true, description: 'Target user ID' })
  @ApiQuery({ name: 'gymId', required: false, description: 'Filter by gym ID' })
  async getUserAttendance(
    @Headers('x-user-id') userId: string,
    @Request() req: any,
    @Query('limit') limit?: number,
    @Query('gymId') gymId?: string,
  ) {
    if (!userId) throw new BadRequestException('x-user-id header is required');
    const resolvedGymId = await resolveGymId(
      this.attendanceService,
      req.user.role,
      req.user.userId,
      gymId ? parseInt(gymId) : undefined,
    );
    return this.attendanceService.getUserAttendance(parseInt(userId), limit || 50, resolvedGymId);
  }

  // =====================
  // STATS
  // =====================

  @Get('stats')
  @UseGuards(RolesGuard)
  @Roles('superadmin', 'admin', 'manager', 'trainer')
  @ApiOperation({ summary: 'Get attendance statistics (filtered by gym for managers)' })
  @ApiQuery({ name: 'gymId', required: false, description: 'Filter by gym ID' })
  async getAttendanceStats(
    @Request() req: any,
    @Query('gymId') gymId?: string,
  ) {
    const resolvedGymId = await resolveGymId(
      this.attendanceService,
      req.user.role,
      req.user.userId,
      gymId ? parseInt(gymId) : undefined,
    );
    return this.attendanceService.getAttendanceStats(resolvedGymId);
  }

  @Get('present-count')
  @UseGuards(RolesGuard)
  @Roles('superadmin', 'admin', 'manager', 'trainer')
  @ApiOperation({ summary: 'Get currently present count (filtered by gym for managers)' })
  @ApiQuery({ name: 'gymId', required: false, description: 'Filter by gym ID' })
  async getCurrentlyPresentCount(
    @Request() req: any,
    @Query('gymId') gymId?: string,
  ) {
    const resolvedGymId = await resolveGymId(
      this.attendanceService,
      req.user.role,
      req.user.userId,
      gymId ? parseInt(gymId) : undefined,
    );
    const count = await this.attendanceService.getCurrentlyPresentCount(resolvedGymId);
    return { count };
  }

  // =====================
  // ADMIN OPERATIONS
  // =====================

  @Get('all')
  @UseGuards(RolesGuard)
  @Roles('superadmin', 'admin', 'manager')
  @ApiOperation({ summary: 'Get all attendance records with pagination (filtered by gym for managers)' })
  @ApiQuery({ name: 'gymId', required: false, description: 'Filter by gym ID' })
  async getAllAttendance(
    @Request() req: any,
    @Query('page') page?: number,
    @Query('limit') limit?: number,
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
    @Query('gymId') gymId?: string,
  ) {
    const resolvedGymId = await resolveGymId(
      this.attendanceService,
      req.user.role,
      req.user.userId,
      gymId ? parseInt(gymId) : undefined,
    );
    return this.attendanceService.getAllAttendance(
      page || 1,
      limit || 50,
      startDate,
      endDate,
      resolvedGymId,
    );
  }

  @Delete(':id')
  @UseGuards(RolesGuard)
  @Roles('superadmin', 'admin')
  @ApiOperation({ summary: 'Delete an attendance record' })
  async deleteAttendance(@Param('id') attendanceId: string) {
    const result = await this.attendanceService.deleteAttendance(parseInt(attendanceId));
    return { success: result };
  }
}
