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
@Roles('admin')
@ApiBearerAuth()
export class SalaryController {
  constructor(private readonly salaryService: SalaryService) {}

  @Post()
  @ApiOperation({ summary: 'Create a new salary record' })
  create(@Request() req: any, @Body() createSalaryDto: CreateSalaryDto) {
    return this.salaryService.create(createSalaryDto, req.user.gymId, req.user.userId);
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
    @Res({ passthrough: true }) res?: Response,
  ) {
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
      },
      req.user.gymId,
    );

    if (res && result.pagination) {
      setPaginationHeaders(res, result.pagination);
    }

    return result.data;
  }

  @Get('stats')
  @ApiOperation({ summary: 'Get salary statistics' })
  getStats(@Request() req: any) {
    return this.salaryService.getStats(req.user.gymId);
  }

  @Get('staff')
  @ApiOperation({ summary: 'Get staff list for salary management' })
  getStaffList(@Request() req: any) {
    return this.salaryService.getStaffList(req.user.gymId);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get a single salary record' })
  findOne(@Request() req: any, @Param('id', ParseIntPipe) id: number) {
    return this.salaryService.findOne(id, req.user.gymId);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update a salary record' })
  update(
    @Request() req: any,
    @Param('id', ParseIntPipe) id: number,
    @Body() updateSalaryDto: UpdateSalaryDto,
  ) {
    return this.salaryService.update(id, updateSalaryDto, req.user.gymId);
  }

  @Patch(':id/pay')
  @ApiOperation({ summary: 'Mark salary as paid' })
  paySalary(
    @Request() req: any,
    @Param('id', ParseIntPipe) id: number,
    @Body() paySalaryDto: PaySalaryDto,
  ) {
    return this.salaryService.paySalary(id, paySalaryDto, req.user.gymId, req.user.userId);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Delete a salary record' })
  remove(@Request() req: any, @Param('id', ParseIntPipe) id: number) {
    return this.salaryService.remove(id, req.user.gymId);
  }
}
