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
  Request,
  Res,
  ParseIntPipe,
  BadRequestException,
} from '@nestjs/common';
import type { Response } from 'express';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiQuery } from '@nestjs/swagger';
import { SalaryService } from './salary.service';
import { CreateSalaryDto, UpdateSalaryDto, PaySalaryDto } from './dto/salary.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { setPaginationHeaders } from '../common/pagination.util';

@ApiTags('salary')
@Controller('salary')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('superadmin', 'admin', 'branch_admin')
@ApiBearerAuth()
export class SalaryController {
  constructor(private readonly salaryService: SalaryService) {}

  private resolveGymId(req: any, queryGymId?: string): number {
    if (req.user.role === 'superadmin') {
      if (!queryGymId) {
        throw new BadRequestException('gymId query parameter is required for superadmin');
      }
      return parseInt(queryGymId);
    }
    return req.user.gymId;
  }

  private resolveBranchId(req: any, queryBranchId?: string): number | null {
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

  @Post()
  @ApiOperation({ summary: 'Create a new salary record' })
  @ApiQuery({ name: 'gymId', required: false, type: Number, description: 'Gym ID (required for superadmin)' })
  create(@Request() req: any, @Body() createSalaryDto: CreateSalaryDto, @Query('gymId') queryGymId?: string) {
    const gymId = this.resolveGymId(req, queryGymId);
    return this.salaryService.create(createSalaryDto, gymId, req.user.userId);
  }

  @Get()
  @ApiOperation({ summary: 'Get all salary records with optional filters and pagination' })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  @ApiQuery({ name: 'search', required: false, type: String })
  @ApiQuery({ name: 'staffId', required: false, type: Number })
  @ApiQuery({ name: 'month', required: false, type: Number })
  @ApiQuery({ name: 'year', required: false, type: Number })
  @ApiQuery({ name: 'paymentStatus', required: false, type: String })
  @ApiQuery({ name: 'noPagination', required: false, type: Boolean })
  @ApiQuery({ name: 'gymId', required: false, type: Number, description: 'Gym ID (required for superadmin)' })
  @ApiQuery({ name: 'branchId', required: false, type: Number, description: 'Branch ID for filtering (admin only)' })
  async findAll(
    @Request() req: any,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
    @Query('search') search?: string,
    @Query('staffId') staffId?: string,
    @Query('month') month?: string,
    @Query('year') year?: string,
    @Query('paymentStatus') paymentStatus?: string,
    @Query('noPagination') noPagination?: string,
    @Query('gymId') queryGymId?: string,
    @Query('branchId') queryBranchId?: string,
    @Res({ passthrough: true }) res?: Response,
  ) {
    const gymId = this.resolveGymId(req, queryGymId);
    const branchId = this.resolveBranchId(req, queryBranchId);
    const result = await this.salaryService.findAll(
      {
        page: page ? parseInt(page) : undefined,
        limit: limit ? parseInt(limit) : undefined,
        search,
        staffId: staffId ? parseInt(staffId) : undefined,
        month: month ? parseInt(month) : undefined,
        year: year ? parseInt(year) : undefined,
        paymentStatus,
        noPagination: noPagination === 'true',
        branchId,
      },
      gymId,
    );

    if (res && result.pagination) {
      setPaginationHeaders(res, result.pagination);
    }

    return result.data;
  }

  @Get('me')
  @Roles('superadmin', 'admin', 'trainer', 'manager')
  @ApiOperation({ summary: 'Get current user salary records' })
  @ApiQuery({ name: 'year', required: false, type: Number })
  async findMySalaries(
    @Request() req: any,
    @Query('year') year?: string,
  ) {
    return this.salaryService.findByStaffId(
      req.user.userId,
      req.user.gymId,
      year ? parseInt(year) : undefined,
    );
  }

  @Get('stats')
  @ApiOperation({ summary: 'Get salary statistics' })
  @ApiQuery({ name: 'gymId', required: false, type: Number, description: 'Gym ID (required for superadmin)' })
  @ApiQuery({ name: 'branchId', required: false, type: Number, description: 'Branch ID for filtering (admin only)' })
  getStats(@Request() req: any, @Query('gymId') queryGymId?: string, @Query('branchId') queryBranchId?: string) {
    const gymId = this.resolveGymId(req, queryGymId);
    const branchId = this.resolveBranchId(req, queryBranchId);
    return this.salaryService.getStats(gymId, branchId);
  }

  @Get('staff')
  @ApiOperation({ summary: 'Get staff list for salary management' })
  @ApiQuery({ name: 'gymId', required: false, type: Number, description: 'Gym ID (required for superadmin)' })
  @ApiQuery({ name: 'branchId', required: false, type: Number, description: 'Branch ID for filtering (admin only)' })
  getStaffList(@Request() req: any, @Query('gymId') queryGymId?: string, @Query('branchId') queryBranchId?: string) {
    const gymId = this.resolveGymId(req, queryGymId);
    const branchId = this.resolveBranchId(req, queryBranchId);
    return this.salaryService.getStaffList(gymId, branchId);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get a single salary record' })
  @ApiQuery({ name: 'gymId', required: false, type: Number, description: 'Gym ID (required for superadmin)' })
  findOne(@Request() req: any, @Param('id', ParseIntPipe) id: number, @Query('gymId') queryGymId?: string) {
    const gymId = this.resolveGymId(req, queryGymId);
    return this.salaryService.findOne(id, gymId);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update a salary record' })
  @ApiQuery({ name: 'gymId', required: false, type: Number, description: 'Gym ID (required for superadmin)' })
  update(
    @Request() req: any,
    @Param('id', ParseIntPipe) id: number,
    @Body() updateSalaryDto: UpdateSalaryDto,
    @Query('gymId') queryGymId?: string,
  ) {
    const gymId = this.resolveGymId(req, queryGymId);
    return this.salaryService.update(id, updateSalaryDto, gymId);
  }

  @Patch(':id/pay')
  @ApiOperation({ summary: 'Mark salary as paid' })
  @ApiQuery({ name: 'gymId', required: false, type: Number, description: 'Gym ID (required for superadmin)' })
  paySalary(
    @Request() req: any,
    @Param('id', ParseIntPipe) id: number,
    @Body() paySalaryDto: PaySalaryDto,
    @Query('gymId') queryGymId?: string,
  ) {
    const gymId = this.resolveGymId(req, queryGymId);
    return this.salaryService.paySalary(id, paySalaryDto, gymId, req.user.userId);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Delete a salary record' })
  @ApiQuery({ name: 'gymId', required: false, type: Number, description: 'Gym ID (required for superadmin)' })
  remove(@Request() req: any, @Param('id', ParseIntPipe) id: number, @Query('gymId') queryGymId?: string) {
    const gymId = this.resolveGymId(req, queryGymId);
    return this.salaryService.remove(id, gymId);
  }
}
