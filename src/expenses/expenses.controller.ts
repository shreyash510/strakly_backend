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
import {
  ApiTags,
  ApiOperation,
  ApiBearerAuth,
  ApiQuery,
} from '@nestjs/swagger';
import { ExpensesService } from './expenses.service';
import {
  CreateExpenseDto,
  UpdateExpenseDto,
  CreateExpenseCategoryDto,
} from './dto/expense.dto';
import type { AuthenticatedRequest } from '../common/types';
import { resolveEffectiveBranchId } from '../common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { setPaginationHeaders } from '../common/pagination.util';

@ApiTags('expenses')
@Controller('expenses')
@UseGuards(JwtAuthGuard, RolesGuard)
@ApiBearerAuth()
export class ExpensesController {
  constructor(private readonly expensesService: ExpensesService) {}

  private resolveGymId(req: AuthenticatedRequest, queryGymId?: string): number {
    if (req.user.role === 'superadmin') {
      if (!queryGymId) {
        throw new BadRequestException(
          'gymId query parameter is required for superadmin',
        );
      }
      return parseInt(queryGymId);
    }
    return req.user.gymId!;
  }

  @Get()
  @Roles('superadmin', 'admin', 'manager')
  @ApiOperation({ summary: 'Get all expenses with optional filters and pagination' })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  @ApiQuery({ name: 'search', required: false, type: String })
  @ApiQuery({ name: 'categoryId', required: false, type: Number })
  @ApiQuery({ name: 'month', required: false, type: Number })
  @ApiQuery({ name: 'year', required: false, type: Number })
  @ApiQuery({ name: 'paymentMethod', required: false, type: String })
  @ApiQuery({ name: 'isRecurring', required: false, type: Boolean })
  @ApiQuery({ name: 'startDate', required: false, type: String, description: 'Filter from date (ISO string)' })
  @ApiQuery({ name: 'endDate', required: false, type: String, description: 'Filter to date (ISO string)' })
  @ApiQuery({ name: 'noPagination', required: false, type: Boolean })
  @ApiQuery({
    name: 'gymId',
    required: false,
    type: Number,
    description: 'Gym ID (required for superadmin)',
  })
  async findAll(
    @Request() req: AuthenticatedRequest,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
    @Query('search') search?: string,
    @Query('categoryId') categoryId?: string,
    @Query('month') month?: string,
    @Query('year') year?: string,
    @Query('paymentMethod') paymentMethod?: string,
    @Query('isRecurring') isRecurring?: string,
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
    @Query('noPagination') noPagination?: string,
    @Query('gymId') queryGymId?: string,
    @Query('branchId') branchId?: string,
    @Res({ passthrough: true }) res?: Response,
  ) {
    const gymId = this.resolveGymId(req, queryGymId);
    const result = await this.expensesService.findAll(
      gymId,
      {
        page: page ? parseInt(page) : undefined,
        limit: limit ? parseInt(limit) : undefined,
        search,
        category: categoryId ? parseInt(categoryId) : undefined,
        month: month ? parseInt(month) : undefined,
        year: year ? parseInt(year) : undefined,
        paymentMethod,
        isRecurring: isRecurring === 'true' ? true : isRecurring === 'false' ? false : undefined,
        startDate,
        endDate,
        noPagination: noPagination === 'true',
        branchId: resolveEffectiveBranchId(req.user, branchId),
      },
    );

    if (res && result.pagination) {
      setPaginationHeaders(res, result.pagination);
    }

    return result.data;
  }

  @Get('unified')
  @Roles('superadmin', 'admin', 'manager')
  @ApiOperation({ summary: 'Get unified expenses (expenses + salaries) with filters and pagination' })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  @ApiQuery({ name: 'search', required: false, type: String })
  @ApiQuery({ name: 'categoryId', required: false, type: Number })
  @ApiQuery({ name: 'categoryCode', required: false, type: String, description: 'Filter by category code (e.g. employee_salary)' })
  @ApiQuery({ name: 'month', required: false, type: Number })
  @ApiQuery({ name: 'year', required: false, type: Number })
  @ApiQuery({ name: 'paymentMethod', required: false, type: String })
  @ApiQuery({ name: 'isRecurring', required: false, type: Boolean })
  @ApiQuery({ name: 'startDate', required: false, type: String, description: 'Filter from date (ISO string)' })
  @ApiQuery({ name: 'endDate', required: false, type: String, description: 'Filter to date (ISO string)' })
  @ApiQuery({ name: 'noPagination', required: false, type: Boolean })
  @ApiQuery({
    name: 'gymId',
    required: false,
    type: Number,
    description: 'Gym ID (required for superadmin)',
  })
  async findAllUnified(
    @Request() req: AuthenticatedRequest,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
    @Query('search') search?: string,
    @Query('categoryId') categoryId?: string,
    @Query('categoryCode') categoryCode?: string,
    @Query('month') month?: string,
    @Query('year') year?: string,
    @Query('paymentMethod') paymentMethod?: string,
    @Query('isRecurring') isRecurring?: string,
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
    @Query('noPagination') noPagination?: string,
    @Query('gymId') queryGymId?: string,
    @Query('branchId') branchId?: string,
    @Res({ passthrough: true }) res?: Response,
  ) {
    const gymId = this.resolveGymId(req, queryGymId);
    const result = await this.expensesService.findAllUnified(
      gymId,
      {
        page: page ? parseInt(page) : undefined,
        limit: limit ? parseInt(limit) : undefined,
        search,
        category: categoryId ? parseInt(categoryId) : undefined,
        categoryCode,
        month: month ? parseInt(month) : undefined,
        year: year ? parseInt(year) : undefined,
        paymentMethod,
        isRecurring: isRecurring === 'true' ? true : isRecurring === 'false' ? false : undefined,
        startDate,
        endDate,
        noPagination: noPagination === 'true',
        branchId: resolveEffectiveBranchId(req.user, branchId),
      },
    );

    if (res && result.pagination) {
      setPaginationHeaders(res, result.pagination);
    }

    return result.data;
  }

  @Get('unified-stats')
  @Roles('superadmin', 'admin', 'manager')
  @ApiOperation({ summary: 'Get unified expense statistics (includes salaries)' })
  @ApiQuery({ name: 'year', required: false, type: Number })
  @ApiQuery({ name: 'month', required: false, type: Number })
  @ApiQuery({
    name: 'gymId',
    required: false,
    type: Number,
    description: 'Gym ID (required for superadmin)',
  })
  getUnifiedStats(
    @Request() req: AuthenticatedRequest,
    @Query('year') year?: string,
    @Query('month') month?: string,
    @Query('gymId') queryGymId?: string,
    @Query('branchId') branchId?: string,
  ) {
    const gymId = this.resolveGymId(req, queryGymId);
    return this.expensesService.getUnifiedStats(
      gymId,
      year ? parseInt(year) : undefined,
      month ? parseInt(month) : undefined,
      resolveEffectiveBranchId(req.user, branchId),
    );
  }

  @Get('stats')
  @Roles('superadmin', 'admin', 'manager')
  @ApiOperation({ summary: 'Get expense statistics' })
  @ApiQuery({ name: 'year', required: false, type: Number })
  @ApiQuery({ name: 'month', required: false, type: Number })
  @ApiQuery({
    name: 'gymId',
    required: false,
    type: Number,
    description: 'Gym ID (required for superadmin)',
  })
  getStats(
    @Request() req: AuthenticatedRequest,
    @Query('year') year?: string,
    @Query('month') month?: string,
    @Query('gymId') queryGymId?: string,
    @Query('branchId') branchId?: string,
  ) {
    const gymId = this.resolveGymId(req, queryGymId);
    return this.expensesService.getStats(
      gymId,
      year ? parseInt(year) : undefined,
      month ? parseInt(month) : undefined,
      resolveEffectiveBranchId(req.user, branchId),
    );
  }

  @Get('categories')
  @Roles('superadmin', 'admin', 'manager')
  @ApiOperation({ summary: 'Get expense categories' })
  @ApiQuery({
    name: 'gymId',
    required: false,
    type: Number,
    description: 'Gym ID (required for superadmin)',
  })
  getCategories(
    @Request() req: AuthenticatedRequest,
    @Query('gymId') queryGymId?: string,
  ) {
    const gymId = this.resolveGymId(req, queryGymId);
    return this.expensesService.getCategories(gymId);
  }

  @Post('categories')
  @Roles('admin')
  @ApiOperation({ summary: 'Create a custom expense category' })
  @ApiQuery({
    name: 'gymId',
    required: false,
    type: Number,
    description: 'Gym ID (required for superadmin)',
  })
  createCategory(
    @Request() req: AuthenticatedRequest,
    @Body() createCategoryDto: CreateExpenseCategoryDto,
    @Query('gymId') queryGymId?: string,
  ) {
    const gymId = this.resolveGymId(req, queryGymId);
    return this.expensesService.createCategory(createCategoryDto, gymId);
  }

  @Get(':id')
  @Roles('superadmin', 'admin', 'manager')
  @ApiOperation({ summary: 'Get a single expense' })
  @ApiQuery({
    name: 'gymId',
    required: false,
    type: Number,
    description: 'Gym ID (required for superadmin)',
  })
  findOne(
    @Param('id', ParseIntPipe) id: number,
    @Request() req: AuthenticatedRequest,
    @Query('gymId') queryGymId?: string,
  ) {
    const gymId = this.resolveGymId(req, queryGymId);
    return this.expensesService.findOne(id, gymId);
  }

  @Post()
  @Roles('admin', 'manager')
  @ApiOperation({ summary: 'Create a new expense' })
  @ApiQuery({
    name: 'gymId',
    required: false,
    type: Number,
    description: 'Gym ID (required for superadmin)',
  })
  create(
    @Request() req: AuthenticatedRequest,
    @Body() createExpenseDto: CreateExpenseDto,
    @Query('gymId') queryGymId?: string,
  ) {
    const gymId = this.resolveGymId(req, queryGymId);
    return this.expensesService.create(createExpenseDto, gymId, req.user.userId, resolveEffectiveBranchId(req.user, undefined));
  }

  @Patch(':id')
  @Roles('admin', 'manager')
  @ApiOperation({ summary: 'Update an expense' })
  @ApiQuery({
    name: 'gymId',
    required: false,
    type: Number,
    description: 'Gym ID (required for superadmin)',
  })
  update(
    @Param('id', ParseIntPipe) id: number,
    @Request() req: AuthenticatedRequest,
    @Body() updateExpenseDto: UpdateExpenseDto,
    @Query('gymId') queryGymId?: string,
  ) {
    const gymId = this.resolveGymId(req, queryGymId);
    return this.expensesService.update(id, gymId, updateExpenseDto);
  }

  @Delete(':id')
  @Roles('admin')
  @ApiOperation({ summary: 'Soft delete an expense' })
  @ApiQuery({
    name: 'gymId',
    required: false,
    type: Number,
    description: 'Gym ID (required for superadmin)',
  })
  remove(
    @Param('id', ParseIntPipe) id: number,
    @Request() req: AuthenticatedRequest,
    @Query('gymId') queryGymId?: string,
  ) {
    const gymId = this.resolveGymId(req, queryGymId);
    return this.expensesService.remove(id, gymId, req.user.userId);
  }
}
