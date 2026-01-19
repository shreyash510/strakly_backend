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
  BadRequestException,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { AttendanceService } from './attendance.service';
import { MarkAttendanceDto, CheckOutDto } from './dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';

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
  // FETCH ATTENDANCE
  // =====================

  @Get('today')
  @ApiOperation({ summary: "Get today's attendance records" })
  async getTodayAttendance() {
    return this.attendanceService.getTodayAttendance();
  }

  @Get('date/:date')
  @ApiOperation({ summary: 'Get attendance records for a specific date' })
  async getAttendanceByDate(@Param('date') date: string) {
    return this.attendanceService.getAttendanceByDate(date);
  }

  @Get('user/:userId')
  @ApiOperation({ summary: "Get a user's attendance history" })
  async getUserAttendance(
    @Param('userId') userId: string,
    @Query('limit') limit?: number,
  ) {
    return this.attendanceService.getUserAttendance(userId, limit || 50);
  }

  // =====================
  // STATS
  // =====================

  @Get('stats')
  @ApiOperation({ summary: 'Get attendance statistics' })
  async getAttendanceStats() {
    return this.attendanceService.getAttendanceStats();
  }

  @Get('present-count')
  @ApiOperation({ summary: 'Get currently present count' })
  async getCurrentlyPresentCount() {
    const count = await this.attendanceService.getCurrentlyPresentCount();
    return { count };
  }

  // =====================
  // ADMIN OPERATIONS
  // =====================

  @Get('all')
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
  @ApiOperation({ summary: 'Delete an attendance record' })
  async deleteAttendance(@Param('id') attendanceId: string) {
    const result = await this.attendanceService.deleteAttendance(attendanceId);
    return { success: result };
  }
}
