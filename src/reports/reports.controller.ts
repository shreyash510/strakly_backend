import { Controller, Get, Query, UseGuards, Req } from '@nestjs/common';
import { ApiQuery } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { ReportsService } from './reports.service';
import { ReportFilterDto } from './dto/reports.dto';

@Controller('reports')
@UseGuards(JwtAuthGuard, RolesGuard)
export class ReportsController {
  constructor(private readonly reportsService: ReportsService) {}

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

  @Get('income-expense')
  @Roles('admin', 'manager')
  @ApiQuery({ name: 'branchId', required: false, type: Number, description: 'Branch ID for filtering (admin only)' })
  async getIncomeExpenseReport(@Query() filters: ReportFilterDto, @Req() req: any, @Query('branchId') queryBranchId?: string) {
    const gymId = req.user.gymId;
    const branchId = this.resolveBranchId(req, queryBranchId);
    return this.reportsService.getIncomeExpenseReport(gymId, filters, branchId);
  }

  @Get('membership-sales')
  @Roles('admin', 'manager')
  @ApiQuery({ name: 'branchId', required: false, type: Number, description: 'Branch ID for filtering (admin only)' })
  async getMembershipSalesReport(@Query() filters: ReportFilterDto, @Req() req: any, @Query('branchId') queryBranchId?: string) {
    const gymId = req.user.gymId;
    const branchId = this.resolveBranchId(req, queryBranchId);
    return this.reportsService.getMembershipSalesReport(gymId, filters, branchId);
  }

  @Get('payment-dues')
  @Roles('admin', 'manager')
  @ApiQuery({ name: 'branchId', required: false, type: Number, description: 'Branch ID for filtering (admin only)' })
  async getPaymentDuesReport(@Req() req: any, @Query('branchId') queryBranchId?: string) {
    const gymId = req.user.gymId;
    const branchId = this.resolveBranchId(req, queryBranchId);
    return this.reportsService.getPaymentDuesReport(gymId, branchId);
  }
}
