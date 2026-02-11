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
  ParseIntPipe,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiBearerAuth,
  ApiHeader,
  ApiQuery,
} from '@nestjs/swagger';
import { AttendanceService } from './attendance.service';
import {
  MarkAttendanceDto,
  CheckOutDto,
  AttendanceReportQueryDto,
} from './dto';
import type { AuthenticatedRequest } from '../common/types';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles, GymId, UserId } from '../auth/decorators';

@ApiTags('attendance')
@Controller('attendance')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class AttendanceController {
  constructor(private readonly attendanceService: AttendanceService) {}

  private resolveGymId(req: AuthenticatedRequest, queryGymId?: string): number {
    if (req.user.role === 'superadmin') {
      if (!queryGymId) {
        throw new BadRequestException(
          'gymId query parameter is required for superadmin',
        );
      }
      return parseInt(queryGymId);
    }
    if (!req.user.gymId) {
      throw new BadRequestException('Gym context is required');
    }
    return req.user.gymId;
  }

  private resolveBranchId(req: AuthenticatedRequest, queryBranchId?: string): number | null {
    // If user has a specific branch assigned, they can only see their branch
    if (req.user.branchId !== null && req.user.branchId !== undefined) {
      return req.user.branchId;
    }
    // User is admin with access to all branches - use query param if provided
    if (queryBranchId && queryBranchId !== 'all' && queryBranchId !== '') {
      return parseInt(queryBranchId);
    }
    return null; // all branches
  }

  @Get('search/:code')
  @ApiOperation({ summary: 'Search user by attendance code' })
  @ApiQuery({
    name: 'gymId',
    required: false,
    type: Number,
    description: 'Gym ID (required for superadmin)',
  })
  @ApiQuery({
    name: 'branchId',
    required: false,
    type: Number,
    description: 'Branch ID for filtering (admin only)',
  })
  async searchUserByCode(
    @Request() req: AuthenticatedRequest,
    @Param('code') code: string,
    @Query('gymId') queryGymId?: string,
    @Query('branchId') queryBranchId?: string,
  ) {
    const gymId = this.resolveGymId(req, queryGymId);
    const branchId = this.resolveBranchId(req, queryBranchId);
    const user = await this.attendanceService.searchUserByCode(
      code,
      gymId,
      branchId,
    );
    if (!user) {
      return null;
    }
    return user;
  }

  @Post('mark')
  @UseGuards(RolesGuard)
  @Roles('superadmin', 'admin', 'branch_admin', 'manager', 'trainer')
  @ApiOperation({ summary: 'Mark attendance (check-in) for a user at a gym' })
  @ApiQuery({
    name: 'gymId',
    required: false,
    type: Number,
    description: 'Gym ID (required for superadmin)',
  })
  @ApiQuery({
    name: 'branchId',
    required: false,
    type: Number,
    description: 'Branch ID for filtering (admin only)',
  })
  async markAttendance(
    @Request() req: AuthenticatedRequest,
    @Body() body: MarkAttendanceDto,
    @Query('gymId') queryGymId?: string,
    @Query('branchId') queryBranchId?: string,
  ) {
    // Use body values if provided, otherwise fall back to query params
    const gymIdParam = body.gymId?.toString() || queryGymId;
    const branchIdParam = body.branchId?.toString() || queryBranchId;

    const gymId = this.resolveGymId(req, gymIdParam);
    const branchId = this.resolveBranchId(req, branchIdParam);
    const user = await this.attendanceService.searchUserByCode(
      body.code,
      gymId,
      branchId,
    );
    if (!user) {
      throw new BadRequestException('Invalid attendance code');
    }

    return this.attendanceService.markAttendance(
      {
        id: user.id,
        name: user.name,
        email: user.email,
        avatar: user.avatar,
        attendanceCode: user.attendanceCode,
      },
      body.staffId,
      gymId,
      branchId,
      body.checkInMethod || 'code',
    );
  }

  @Patch('checkout/:id')
  @UseGuards(RolesGuard)
  @Roles('superadmin', 'admin', 'branch_admin', 'manager', 'trainer')
  @ApiOperation({ summary: 'Check out a user' })
  @ApiQuery({
    name: 'gymId',
    required: false,
    type: Number,
    description: 'Gym ID (required for superadmin)',
  })
  async checkOut(
    @Request() req: AuthenticatedRequest,
    @Param('id', ParseIntPipe) attendanceId: number,
    @Body() body?: CheckOutDto,
    @Query('gymId') queryGymId?: string,
  ) {
    const gymId = this.resolveGymId(req, queryGymId);
    return this.attendanceService.checkOut(attendanceId, gymId, body?.staffId);
  }

  @Get('me')
  @ApiOperation({ summary: 'Get current user attendance history' })
  @ApiQuery({
    name: 'page',
    required: false,
    type: Number,
    description: 'Page number',
  })
  @ApiQuery({
    name: 'limit',
    required: false,
    type: Number,
    description: 'Records per page',
  })
  async getMyAttendance(
    @UserId() userId: number,
    @GymId() gymId: number,
    @Query('page') page?: number,
    @Query('limit') limit?: number,
  ) {
    return this.attendanceService.getUserAttendance(userId, gymId, {
      page: page ? parseInt(String(page), 10) : 1,
      limit: limit ? parseInt(String(limit), 10) : 10,
    });
  }

  @Get('today')
  @UseGuards(RolesGuard)
  @Roles('superadmin', 'admin', 'branch_admin', 'manager', 'trainer')
  @ApiOperation({ summary: "Get today's attendance records" })
  @ApiQuery({
    name: 'gymId',
    required: false,
    type: Number,
    description: 'Gym ID (required for superadmin)',
  })
  @ApiQuery({
    name: 'branchId',
    required: false,
    type: Number,
    description: 'Branch ID for filtering (admin only)',
  })
  async getTodayAttendance(
    @Request() req: AuthenticatedRequest,
    @Query('gymId') queryGymId?: string,
    @Query('branchId') queryBranchId?: string,
  ) {
    const gymId = this.resolveGymId(req, queryGymId);
    const branchId = this.resolveBranchId(req, queryBranchId);
    return this.attendanceService.getTodayAttendance(gymId, branchId);
  }

  @Get('date/:date')
  @UseGuards(RolesGuard)
  @Roles('superadmin', 'admin', 'branch_admin', 'manager', 'trainer')
  @ApiOperation({ summary: 'Get attendance records for a specific date' })
  @ApiQuery({
    name: 'gymId',
    required: false,
    type: Number,
    description: 'Gym ID (required for superadmin)',
  })
  @ApiQuery({
    name: 'branchId',
    required: false,
    type: Number,
    description: 'Branch ID for filtering (admin only)',
  })
  async getAttendanceByDate(
    @Request() req: AuthenticatedRequest,
    @Param('date') date: string,
    @Query('gymId') queryGymId?: string,
    @Query('branchId') queryBranchId?: string,
  ) {
    const gymId = this.resolveGymId(req, queryGymId);
    const branchId = this.resolveBranchId(req, queryBranchId);
    return this.attendanceService.getAttendanceByDate(date, gymId, branchId);
  }

  @Get('user')
  @UseGuards(RolesGuard)
  @Roles('superadmin', 'admin', 'branch_admin', 'manager', 'trainer')
  @ApiOperation({ summary: "Get a user's attendance history" })
  @ApiHeader({
    name: 'x-user-id',
    required: true,
    description: 'Target user ID',
  })
  @ApiQuery({
    name: 'gymId',
    required: false,
    type: Number,
    description: 'Gym ID (required for superadmin)',
  })
  @ApiQuery({
    name: 'page',
    required: false,
    type: Number,
    description: 'Page number',
  })
  @ApiQuery({
    name: 'limit',
    required: false,
    type: Number,
    description: 'Records per page',
  })
  async getUserAttendance(
    @Request() req: AuthenticatedRequest,
    @Headers('x-user-id') userId: string,
    @Query('page') page?: number,
    @Query('limit') limit?: number,
    @Query('gymId') queryGymId?: string,
  ) {
    if (!userId) throw new BadRequestException('x-user-id header is required');
    const gymId = this.resolveGymId(req, queryGymId);
    return this.attendanceService.getUserAttendance(parseInt(userId), gymId, {
      page: page ? parseInt(String(page), 10) : 1,
      limit: limit ? parseInt(String(limit), 10) : 10,
    });
  }

  @Get('stats')
  @UseGuards(RolesGuard)
  @Roles('superadmin', 'admin', 'branch_admin', 'manager', 'trainer')
  @ApiOperation({ summary: 'Get attendance statistics' })
  @ApiQuery({
    name: 'gymId',
    required: false,
    type: Number,
    description: 'Gym ID (required for superadmin)',
  })
  @ApiQuery({
    name: 'branchId',
    required: false,
    type: Number,
    description: 'Branch ID for filtering (admin only)',
  })
  async getAttendanceStats(
    @Request() req: AuthenticatedRequest,
    @Query('gymId') queryGymId?: string,
    @Query('branchId') queryBranchId?: string,
  ) {
    const gymId = this.resolveGymId(req, queryGymId);
    const branchId = this.resolveBranchId(req, queryBranchId);
    return this.attendanceService.getAttendanceStats(gymId, branchId);
  }

  @Get('present-count')
  @UseGuards(RolesGuard)
  @Roles('superadmin', 'admin', 'branch_admin', 'manager', 'trainer')
  @ApiOperation({ summary: 'Get currently present count' })
  @ApiQuery({
    name: 'gymId',
    required: false,
    type: Number,
    description: 'Gym ID (required for superadmin)',
  })
  @ApiQuery({
    name: 'branchId',
    required: false,
    type: Number,
    description: 'Branch ID for filtering (admin only)',
  })
  async getCurrentlyPresentCount(
    @Request() req: AuthenticatedRequest,
    @Query('gymId') queryGymId?: string,
    @Query('branchId') queryBranchId?: string,
  ) {
    const gymId = this.resolveGymId(req, queryGymId);
    const branchId = this.resolveBranchId(req, queryBranchId);
    const count = await this.attendanceService.getCurrentlyPresentCount(
      gymId,
      branchId,
    );
    return { count };
  }

  @Get('reports')
  @UseGuards(RolesGuard)
  @Roles('superadmin', 'admin', 'branch_admin', 'manager')
  @ApiOperation({ summary: 'Get attendance reports with analytics data' })
  @ApiQuery({
    name: 'startDate',
    required: false,
    description: 'Start date (YYYY-MM-DD)',
  })
  @ApiQuery({
    name: 'endDate',
    required: false,
    description: 'End date (YYYY-MM-DD)',
  })
  @ApiQuery({
    name: 'gymId',
    required: false,
    type: Number,
    description: 'Gym ID (required for superadmin)',
  })
  @ApiQuery({
    name: 'branchId',
    required: false,
    type: Number,
    description: 'Branch ID for filtering',
  })
  async getReports(
    @Request() req: AuthenticatedRequest,
    @Query() query: AttendanceReportQueryDto,
  ) {
    const gymId = this.resolveGymId(req, query.gymId?.toString());
    const branchId = this.resolveBranchId(req, query.branchId?.toString());
    return this.attendanceService.getReports(
      gymId,
      branchId,
      query.startDate,
      query.endDate,
    );
  }

  @Get('all')
  @UseGuards(RolesGuard)
  @Roles('superadmin', 'admin', 'branch_admin', 'manager')
  @ApiOperation({ summary: 'Get all attendance records with pagination' })
  @ApiQuery({ name: 'page', required: false })
  @ApiQuery({ name: 'limit', required: false })
  @ApiQuery({ name: 'startDate', required: false })
  @ApiQuery({ name: 'endDate', required: false })
  @ApiQuery({
    name: 'gymId',
    required: false,
    type: Number,
    description: 'Gym ID (required for superadmin)',
  })
  @ApiQuery({
    name: 'branchId',
    required: false,
    type: Number,
    description: 'Branch ID for filtering (admin only)',
  })
  async getAllAttendance(
    @Request() req: AuthenticatedRequest,
    @Query('page') page?: number,
    @Query('limit') limit?: number,
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
    @Query('gymId') queryGymId?: string,
    @Query('branchId') queryBranchId?: string,
  ) {
    const gymId = this.resolveGymId(req, queryGymId);
    const branchId = this.resolveBranchId(req, queryBranchId);
    return this.attendanceService.getAllAttendance(
      gymId,
      branchId,
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
  @ApiQuery({
    name: 'gymId',
    required: false,
    type: Number,
    description: 'Gym ID (required for superadmin)',
  })
  async deleteAttendance(
    @Request() req: AuthenticatedRequest,
    @Param('id', ParseIntPipe) attendanceId: number,
    @Query('gymId') queryGymId?: string,
  ) {
    const gymId = this.resolveGymId(req, queryGymId);
    const result = await this.attendanceService.deleteAttendance(
      attendanceId,
      gymId,
    );
    return { success: result };
  }
}
