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
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiHeader } from '@nestjs/swagger';
import { AttendanceService } from './attendance.service';
import { MarkAttendanceDto, CheckOutDto } from './dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';

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
  @ApiOperation({ summary: 'Mark attendance (check-in) for a user' })
  async markAttendance(@Body() body: MarkAttendanceDto) {
    // Search for user by attendance code
    const user = await this.attendanceService.searchUserByCode(body.code);
    if (!user) {
      throw new BadRequestException('Invalid attendance code');
    }

    return this.attendanceService.markAttendance(
      {
        id: user.id,
        odooEmployeeId: user.odooEmployeeId || undefined,
        odooUserId: user.odooUserId || undefined,
        name: user.name,
        email: user.email,
        attendanceCode: user.attendanceCode,
      },
      body.staffId,
      body.staffName,
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
      attendanceId,
      body?.staffId,
      body?.staffName,
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
  @ApiOperation({ summary: "Get today's attendance records" })
  async getTodayAttendance() {
    return this.attendanceService.getTodayAttendance();
  }

  @Get('date/:date')
  @UseGuards(RolesGuard)
  @Roles('superadmin', 'admin', 'manager', 'trainer')
  @ApiOperation({ summary: 'Get attendance records for a specific date' })
  async getAttendanceByDate(@Param('date') date: string) {
    return this.attendanceService.getAttendanceByDate(date);
  }

  @Get('user')
  @UseGuards(RolesGuard)
  @Roles('superadmin', 'admin', 'manager', 'trainer')
  @ApiOperation({ summary: "Get a user's attendance history" })
  @ApiHeader({ name: 'x-user-id', required: true, description: 'Target user ID' })
  async getUserAttendance(
    @Headers('x-user-id') userId: string,
    @Query('limit') limit?: number,
  ) {
    if (!userId) throw new BadRequestException('x-user-id header is required');
    return this.attendanceService.getUserAttendance(userId, limit || 50);  // userId is stored as string in attendance
  }

  // =====================
  // STATS
  // =====================

  @Get('stats')
  @UseGuards(RolesGuard)
  @Roles('superadmin', 'admin', 'manager', 'trainer')
  @ApiOperation({ summary: 'Get attendance statistics' })
  async getAttendanceStats() {
    return this.attendanceService.getAttendanceStats();
  }

  @Get('present-count')
  @UseGuards(RolesGuard)
  @Roles('superadmin', 'admin', 'manager', 'trainer')
  @ApiOperation({ summary: 'Get currently present count' })
  async getCurrentlyPresentCount() {
    const count = await this.attendanceService.getCurrentlyPresentCount();
    return { count };
  }

  // =====================
  // ADMIN OPERATIONS
  // =====================

  @Get('all')
  @UseGuards(RolesGuard)
  @Roles('superadmin', 'admin', 'manager')
  @ApiOperation({ summary: 'Get all attendance records with pagination' })
  async getAllAttendance(
    @Query('page') page?: number,
    @Query('limit') limit?: number,
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
  ) {
    return this.attendanceService.getAllAttendance(
      page || 1,
      limit || 50,
      startDate,
      endDate,
    );
  }

  @Delete(':id')
  @UseGuards(RolesGuard)
  @Roles('superadmin', 'admin')
  @ApiOperation({ summary: 'Delete an attendance record' })
  async deleteAttendance(@Param('id') attendanceId: string) {
    const result = await this.attendanceService.deleteAttendance(attendanceId);
    return { success: result };
  }
}
