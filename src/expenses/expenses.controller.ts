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
  ApproveExpenseDto,
  RejectExpenseDto,
  MarkExpensePaidDto,
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
  @ApiQuery({ name: 'approvalStatus', required: false, type: String })
  @ApiQuery({ name: 'staffId', required: false, type: Number })
  @ApiQuery({ name: 'month', required: false, type: Number })
  @ApiQuery({ name: 'year', required: false, type: Number })
  @ApiQuery({ name: 'paymentMethod', required: false, type: String })
  @ApiQuery({ name: 'isRecurring', required: false, type: Boolean })
  @ApiQuery({ name: 'startDate', required: false, type: String })
  @ApiQuery({ name: 'endDate', required: false, type: String })
  @ApiQuery({ name: 'noPagination', required: false, type: Boolean })
  @ApiQuery({ name: 'gymId', required: false, type: Number })
  async findAll(
    @Request() req: AuthenticatedRequest,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
    @Query('search') search?: string,
    @Query('categoryId') categoryId?: string,
    @Query('approvalStatus') approvalStatus?: string,
    @Query('staffId') staffId?: string,
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
        approvalStatus,
        staffId: staffId ? parseInt(staffId) : undefined,
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
  @ApiQuery({ name: 'categoryCode', required: false, type: String })
  @ApiQuery({ name: 'approvalStatus', required: false, type: String })
  @ApiQuery({ name: 'staffId', required: false, type: Number })
  @ApiQuery({ name: 'month', required: false, type: Number })
  @ApiQuery({ name: 'year', required: false, type: Number })
  @ApiQuery({ name: 'paymentMethod', required: false, type: String })
  @ApiQuery({ name: 'isRecurring', required: false, type: Boolean })
  @ApiQuery({ name: 'startDate', required: false, type: String })
  @ApiQuery({ name: 'endDate', required: false, type: String })
  @ApiQuery({ name: 'noPagination', required: false, type: Boolean })
  @ApiQuery({ name: 'gymId', required: false, type: Number })
  async findAllUnified(
    @Request() req: AuthenticatedRequest,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
    @Query('search') search?: string,
    @Query('categoryId') categoryId?: string,
    @Query('categoryCode') categoryCode?: string,
    @Query('approvalStatus') approvalStatus?: string,
    @Query('staffId') staffId?: string,
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
        approvalStatus,
        staffId: staffId ? parseInt(staffId) : undefined,
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
  createCategory(
    @Request() req: AuthenticatedRequest,
    @Body() createCategoryDto: CreateExpenseCategoryDto,
    @Query('gymId') queryGymId?: string,
  ) {
    const gymId = this.resolveGymId(req, queryGymId);
    return this.expensesService.createCategory(createCategoryDto, gymId);
  }

  @Get('staff')
  @Roles('superadmin', 'admin', 'manager')
  @ApiOperation({ summary: 'Staff members selectable for expense assignment (manager, trainer). Supports search-as-you-type.' })
  @ApiQuery({ name: 'search', required: false, type: String })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  listStaff(
    @Request() req: AuthenticatedRequest,
    @Query('search') search?: string,
    @Query('limit') limit?: string,
    @Query('gymId') queryGymId?: string,
  ) {
    const gymId = this.resolveGymId(req, queryGymId);
    return this.expensesService.listStaff(gymId, {
      search,
      limit: limit ? parseInt(limit) : undefined,
    });
  }

  @Get('pending')
  @Roles('superadmin', 'admin', 'manager')
  @ApiOperation({ summary: 'Approval queue — expenses awaiting approval' })
  getPending(
    @Request() req: AuthenticatedRequest,
    @Query('gymId') queryGymId?: string,
    @Query('branchId') branchId?: string,
  ) {
    const gymId = this.resolveGymId(req, queryGymId);
    return this.expensesService.findPending(
      gymId,
      resolveEffectiveBranchId(req.user, branchId),
    );
  }

  @Get('staff/:staffId')
  @Roles('superadmin', 'admin', 'manager')
  @ApiOperation({ summary: 'All expenses for a given staff member (transparency view)' })
  getByStaff(
    @Request() req: AuthenticatedRequest,
    @Param('staffId', ParseIntPipe) staffId: number,
    @Query('gymId') queryGymId?: string,
  ) {
    const gymId = this.resolveGymId(req, queryGymId);
    return this.expensesService.findByStaff(gymId, staffId);
  }

  @Get(':id')
  @Roles('superadmin', 'admin', 'manager')
  @ApiOperation({ summary: 'Get a single expense' })
  findOne(
    @Param('id', ParseIntPipe) id: number,
    @Request() req: AuthenticatedRequest,
    @Query('gymId') queryGymId?: string,
  ) {
    const gymId = this.resolveGymId(req, queryGymId);
    return this.expensesService.findOne(id, gymId);
  }

  @Get(':id/history')
  @Roles('superadmin', 'admin', 'manager')
  @ApiOperation({ summary: 'Approval + edit history for an expense' })
  getHistory(
    @Param('id', ParseIntPipe) id: number,
    @Request() req: AuthenticatedRequest,
    @Query('gymId') queryGymId?: string,
  ) {
    const gymId = this.resolveGymId(req, queryGymId);
    return this.expensesService.getHistory(id, gymId);
  }

  @Post()
  @Roles('admin', 'manager')
  @ApiOperation({ summary: 'Create a new expense (enters approval queue)' })
  create(
    @Request() req: AuthenticatedRequest,
    @Body() createExpenseDto: CreateExpenseDto,
    @Query('gymId') queryGymId?: string,
  ) {
    const gymId = this.resolveGymId(req, queryGymId);
    return this.expensesService.create(
      createExpenseDto,
      gymId,
      req.user.userId,
      resolveEffectiveBranchId(req.user, undefined),
      req.user.role,
    );
  }

  @Patch(':id')
  @Roles('admin', 'manager')
  @ApiOperation({ summary: 'Update an expense (edits to approved send it back for re-approval)' })
  update(
    @Param('id', ParseIntPipe) id: number,
    @Request() req: AuthenticatedRequest,
    @Body() updateExpenseDto: UpdateExpenseDto,
    @Query('gymId') queryGymId?: string,
  ) {
    const gymId = this.resolveGymId(req, queryGymId);
    return this.expensesService.update(id, gymId, updateExpenseDto, req.user.userId);
  }

  @Post(':id/approve')
  @Roles('admin')
  @ApiOperation({ summary: 'Approve a pending expense' })
  approve(
    @Param('id', ParseIntPipe) id: number,
    @Request() req: AuthenticatedRequest,
    @Body() dto: ApproveExpenseDto,
    @Query('gymId') queryGymId?: string,
  ) {
    const gymId = this.resolveGymId(req, queryGymId);
    return this.expensesService.approve(id, gymId, dto, req.user.userId);
  }

  @Post(':id/reject')
  @Roles('admin')
  @ApiOperation({ summary: 'Reject a pending expense' })
  reject(
    @Param('id', ParseIntPipe) id: number,
    @Request() req: AuthenticatedRequest,
    @Body() dto: RejectExpenseDto,
    @Query('gymId') queryGymId?: string,
  ) {
    const gymId = this.resolveGymId(req, queryGymId);
    return this.expensesService.reject(id, gymId, dto, req.user.userId);
  }

  @Post(':id/mark-paid')
  @Roles('admin', 'manager')
  @ApiOperation({ summary: 'Record payment on an approved expense' })
  markPaid(
    @Param('id', ParseIntPipe) id: number,
    @Request() req: AuthenticatedRequest,
    @Body() dto: MarkExpensePaidDto,
    @Query('gymId') queryGymId?: string,
  ) {
    const gymId = this.resolveGymId(req, queryGymId);
    return this.expensesService.markPaid(id, gymId, dto, req.user.userId);
  }

  @Delete(':id')
  @Roles('admin')
  @ApiOperation({ summary: 'Soft delete an expense' })
  remove(
    @Param('id', ParseIntPipe) id: number,
    @Request() req: AuthenticatedRequest,
    @Query('gymId') queryGymId?: string,
  ) {
    const gymId = this.resolveGymId(req, queryGymId);
    return this.expensesService.remove(id, gymId, req.user.userId);
  }
}
