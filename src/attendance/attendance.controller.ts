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
import { ApiTags, ApiOperation, ApiBearerAuth, ApiHeader, ApiQuery } from '@nestjs/swagger';
import { AttendanceService } from './attendance.service';
import { MarkAttendanceDto, CheckOutDto } from './dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { AuthenticatedUser } from '../auth/strategies/jwt.strategy';

interface AuthenticatedRequest extends Request {
  user: AuthenticatedUser;
}

@ApiTags('attendance')
@Controller('attendance')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class AttendanceController {
  constructor(private readonly attendanceService: AttendanceService) {}

  @Get('search/:code')
  @ApiOperation({ summary: 'Search user by attendance code' })
  async searchUserByCode(@Request() req: AuthenticatedRequest, @Param('code') code: string) {
    const user = await this.attendanceService.searchUserByCode(code, req.user.gymId);
    if (!user) {
      return null;
    }
    return user;
  }

  @Post('mark')
  @UseGuards(RolesGuard)
  @Roles('superadmin', 'admin', 'manager', 'trainer')
  @ApiOperation({ summary: 'Mark attendance (check-in) for a user at a gym' })
  async markAttendance(@Body() body: MarkAttendanceDto, @Request() req: AuthenticatedRequest) {
    const gymId = req.user.gymId;

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
    @Request() req: AuthenticatedRequest,
    @Param('id') attendanceId: string,
    @Body() body?: CheckOutDto,
  ) {
    return this.attendanceService.checkOut(
      parseInt(attendanceId),
      req.user.gymId,
      body?.staffId,
    );
  }

  @Get('me')
  @ApiOperation({ summary: 'Get current user attendance history' })
  async getMyAttendance(
    @Request() req: AuthenticatedRequest,
    @Query('limit') limit?: number,
  ) {
    return this.attendanceService.getUserAttendance(req.user.userId, req.user.gymId, limit || 50);
  }

  @Get('today')
  @UseGuards(RolesGuard)
  @Roles('superadmin', 'admin', 'manager', 'trainer')
  @ApiOperation({ summary: "Get today's attendance records" })
  async getTodayAttendance(@Request() req: AuthenticatedRequest) {
    return this.attendanceService.getTodayAttendance(req.user.gymId);
  }

  @Get('date/:date')
  @UseGuards(RolesGuard)
  @Roles('superadmin', 'admin', 'manager', 'trainer')
  @ApiOperation({ summary: 'Get attendance records for a specific date' })
  async getAttendanceByDate(
    @Param('date') date: string,
    @Request() req: AuthenticatedRequest,
  ) {
    return this.attendanceService.getAttendanceByDate(date, req.user.gymId);
  }

  @Get('user')
  @UseGuards(RolesGuard)
  @Roles('superadmin', 'admin', 'manager', 'trainer')
  @ApiOperation({ summary: "Get a user's attendance history" })
  @ApiHeader({ name: 'x-user-id', required: true, description: 'Target user ID' })
  async getUserAttendance(
    @Headers('x-user-id') userId: string,
    @Request() req: AuthenticatedRequest,
    @Query('limit') limit?: number,
  ) {
    if (!userId) throw new BadRequestException('x-user-id header is required');
    return this.attendanceService.getUserAttendance(parseInt(userId), req.user.gymId, limit || 50);
  }

  @Get('stats')
  @UseGuards(RolesGuard)
  @Roles('superadmin', 'admin', 'manager', 'trainer')
  @ApiOperation({ summary: 'Get attendance statistics' })
  async getAttendanceStats(@Request() req: AuthenticatedRequest) {
    return this.attendanceService.getAttendanceStats(req.user.gymId);
  }

  @Get('present-count')
  @UseGuards(RolesGuard)
  @Roles('superadmin', 'admin', 'manager', 'trainer')
  @ApiOperation({ summary: 'Get currently present count' })
  async getCurrentlyPresentCount(@Request() req: AuthenticatedRequest) {
    const count = await this.attendanceService.getCurrentlyPresentCount(req.user.gymId);
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
    @Request() req: AuthenticatedRequest,
    @Query('page') page?: number,
    @Query('limit') limit?: number,
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
  ) {
    return this.attendanceService.getAllAttendance(
      req.user.gymId,
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
  async deleteAttendance(@Request() req: AuthenticatedRequest, @Param('id') attendanceId: string) {
    const result = await this.attendanceService.deleteAttendance(parseInt(attendanceId), req.user.gymId);
    return { success: result };
  }
}
