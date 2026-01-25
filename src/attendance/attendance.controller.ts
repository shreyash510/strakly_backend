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
  Request,
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

  private resolveGymId(req: any, queryGymId?: string): number {
    if (req.user.role === 'superadmin') {
      if (!queryGymId) {
        throw new BadRequestException('gymId query parameter is required for superadmin');
      }
      return parseInt(queryGymId);
    }
    if (!req.user.gymId) {
      throw new BadRequestException('Gym context is required');
    }
    return req.user.gymId;
  }

  @Get('search/:code')
  @ApiOperation({ summary: 'Search user by attendance code' })
  @ApiQuery({ name: 'gymId', required: false, type: Number, description: 'Gym ID (required for superadmin)' })
  async searchUserByCode(@Request() req: any, @Param('code') code: string, @Query('gymId') queryGymId?: string) {
    const gymId = this.resolveGymId(req, queryGymId);
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
  @ApiQuery({ name: 'gymId', required: false, type: Number, description: 'Gym ID (required for superadmin)' })
  async markAttendance(@Request() req: any, @Body() body: MarkAttendanceDto, @Query('gymId') queryGymId?: string) {
    const gymId = this.resolveGymId(req, queryGymId);
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
  @ApiQuery({ name: 'gymId', required: false, type: Number, description: 'Gym ID (required for superadmin)' })
  async checkOut(
    @Request() req: any,
    @Param('id') attendanceId: string,
    @Body() body?: CheckOutDto,
    @Query('gymId') queryGymId?: string,
  ) {
    const gymId = this.resolveGymId(req, queryGymId);
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
  @ApiQuery({ name: 'gymId', required: false, type: Number, description: 'Gym ID (required for superadmin)' })
  async getTodayAttendance(@Request() req: any, @Query('gymId') queryGymId?: string) {
    const gymId = this.resolveGymId(req, queryGymId);
    return this.attendanceService.getTodayAttendance(gymId);
  }

  @Get('date/:date')
  @UseGuards(RolesGuard)
  @Roles('superadmin', 'admin', 'manager', 'trainer')
  @ApiOperation({ summary: 'Get attendance records for a specific date' })
  @ApiQuery({ name: 'gymId', required: false, type: Number, description: 'Gym ID (required for superadmin)' })
  async getAttendanceByDate(
    @Request() req: any,
    @Param('date') date: string,
    @Query('gymId') queryGymId?: string,
  ) {
    const gymId = this.resolveGymId(req, queryGymId);
    return this.attendanceService.getAttendanceByDate(date, gymId);
  }

  @Get('user')
  @UseGuards(RolesGuard)
  @Roles('superadmin', 'admin', 'manager', 'trainer')
  @ApiOperation({ summary: "Get a user's attendance history" })
  @ApiHeader({ name: 'x-user-id', required: true, description: 'Target user ID' })
  @ApiQuery({ name: 'gymId', required: false, type: Number, description: 'Gym ID (required for superadmin)' })
  async getUserAttendance(
    @Request() req: any,
    @Headers('x-user-id') userId: string,
    @Query('limit') limit?: number,
    @Query('gymId') queryGymId?: string,
  ) {
    if (!userId) throw new BadRequestException('x-user-id header is required');
    const gymId = this.resolveGymId(req, queryGymId);
    return this.attendanceService.getUserAttendance(parseInt(userId), gymId, limit || 50);
  }

  @Get('stats')
  @UseGuards(RolesGuard)
  @Roles('superadmin', 'admin', 'manager', 'trainer')
  @ApiOperation({ summary: 'Get attendance statistics' })
  @ApiQuery({ name: 'gymId', required: false, type: Number, description: 'Gym ID (required for superadmin)' })
  async getAttendanceStats(@Request() req: any, @Query('gymId') queryGymId?: string) {
    const gymId = this.resolveGymId(req, queryGymId);
    return this.attendanceService.getAttendanceStats(gymId);
  }

  @Get('present-count')
  @UseGuards(RolesGuard)
  @Roles('superadmin', 'admin', 'manager', 'trainer')
  @ApiOperation({ summary: 'Get currently present count' })
  @ApiQuery({ name: 'gymId', required: false, type: Number, description: 'Gym ID (required for superadmin)' })
  async getCurrentlyPresentCount(@Request() req: any, @Query('gymId') queryGymId?: string) {
    const gymId = this.resolveGymId(req, queryGymId);
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
  @ApiQuery({ name: 'gymId', required: false, type: Number, description: 'Gym ID (required for superadmin)' })
  async getAllAttendance(
    @Request() req: any,
    @Query('page') page?: number,
    @Query('limit') limit?: number,
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
    @Query('gymId') queryGymId?: string,
  ) {
    const gymId = this.resolveGymId(req, queryGymId);
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
  @ApiQuery({ name: 'gymId', required: false, type: Number, description: 'Gym ID (required for superadmin)' })
  async deleteAttendance(@Request() req: any, @Param('id') attendanceId: string, @Query('gymId') queryGymId?: string) {
    const gymId = this.resolveGymId(req, queryGymId);
    const result = await this.attendanceService.deleteAttendance(parseInt(attendanceId), gymId);
    return { success: result };
  }
}
