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
  BadRequestException,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiHeader, ApiQuery } from '@nestjs/swagger';
import { AttendanceService } from './attendance.service';
import { MarkAttendanceDto, CheckOutDto } from './dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles, GymId, UserId } from '../auth/decorators';

@ApiTags('attendance')
@Controller('attendance')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class AttendanceController {
  constructor(private readonly attendanceService: AttendanceService) {}

  @Get('search/:code')
  @ApiOperation({ summary: 'Search user by attendance code' })
  async searchUserByCode(@GymId() gymId: number, @Param('code') code: string) {
    const user = await this.attendanceService.searchUserByCode(code, gymId);
    if (!user) {
      return null;
    }
    return user;
  }

  @Post('mark')
  @UseGuards(RolesGuard)
  @Roles('superadmin', 'admin', 'manager', 'trainer')
  @ApiOperation({ summary: 'Mark attendance (check-in) for a user at a gym' })
  async markAttendance(@Body() body: MarkAttendanceDto, @GymId() gymId: number) {
    const user = await this.attendanceService.searchUserByCode(body.code, gymId);
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

  @Patch('checkout/:id')
  @UseGuards(RolesGuard)
  @Roles('superadmin', 'admin', 'manager', 'trainer')
  @ApiOperation({ summary: 'Check out a user' })
  async checkOut(
    @GymId() gymId: number,
    @Param('id') attendanceId: string,
    @Body() body?: CheckOutDto,
  ) {
    return this.attendanceService.checkOut(
      parseInt(attendanceId),
      gymId,
      body?.staffId,
    );
  }

  @Get('me')
  @ApiOperation({ summary: 'Get current user attendance history' })
  async getMyAttendance(
    @UserId() userId: number,
    @GymId() gymId: number,
    @Query('limit') limit?: number,
  ) {
    return this.attendanceService.getUserAttendance(userId, gymId, limit || 50);
  }

  @Get('today')
  @UseGuards(RolesGuard)
  @Roles('superadmin', 'admin', 'manager', 'trainer')
  @ApiOperation({ summary: "Get today's attendance records" })
  async getTodayAttendance(@GymId() gymId: number) {
    return this.attendanceService.getTodayAttendance(gymId);
  }

  @Get('date/:date')
  @UseGuards(RolesGuard)
  @Roles('superadmin', 'admin', 'manager', 'trainer')
  @ApiOperation({ summary: 'Get attendance records for a specific date' })
  async getAttendanceByDate(
    @Param('date') date: string,
    @GymId() gymId: number,
  ) {
    return this.attendanceService.getAttendanceByDate(date, gymId);
  }

  @Get('user')
  @UseGuards(RolesGuard)
  @Roles('superadmin', 'admin', 'manager', 'trainer')
  @ApiOperation({ summary: "Get a user's attendance history" })
  @ApiHeader({ name: 'x-user-id', required: true, description: 'Target user ID' })
  async getUserAttendance(
    @Headers('x-user-id') userId: string,
    @GymId() gymId: number,
    @Query('limit') limit?: number,
  ) {
    if (!userId) throw new BadRequestException('x-user-id header is required');
    return this.attendanceService.getUserAttendance(parseInt(userId), gymId, limit || 50);
  }

  @Get('stats')
  @UseGuards(RolesGuard)
  @Roles('superadmin', 'admin', 'manager', 'trainer')
  @ApiOperation({ summary: 'Get attendance statistics' })
  async getAttendanceStats(@GymId() gymId: number) {
    return this.attendanceService.getAttendanceStats(gymId);
  }

  @Get('present-count')
  @UseGuards(RolesGuard)
  @Roles('superadmin', 'admin', 'manager', 'trainer')
  @ApiOperation({ summary: 'Get currently present count' })
  async getCurrentlyPresentCount(@GymId() gymId: number) {
    const count = await this.attendanceService.getCurrentlyPresentCount(gymId);
    return { count };
  }

  @Get('all')
  @UseGuards(RolesGuard)
  @Roles('superadmin', 'admin', 'manager')
  @ApiOperation({ summary: 'Get all attendance records with pagination' })
  @ApiQuery({ name: 'page', required: false })
  @ApiQuery({ name: 'limit', required: false })
  @ApiQuery({ name: 'startDate', required: false })
  @ApiQuery({ name: 'endDate', required: false })
  async getAllAttendance(
    @GymId() gymId: number,
    @Query('page') page?: number,
    @Query('limit') limit?: number,
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
  ) {
    return this.attendanceService.getAllAttendance(
      gymId,
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
  async deleteAttendance(@GymId() gymId: number, @Param('id') attendanceId: string) {
    const result = await this.attendanceService.deleteAttendance(parseInt(attendanceId), gymId);
    return { success: result };
  }
}
