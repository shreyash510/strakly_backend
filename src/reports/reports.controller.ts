import { Controller, Get, Query, UseGuards, Req } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { ReportsService } from './reports.service';
import { ReportFilterDto } from './dto/reports.dto';

@Controller('reports')
@UseGuards(JwtAuthGuard, RolesGuard)
export class ReportsController {
  constructor(private readonly reportsService: ReportsService) {}

  @Get('income-expense')
  @Roles('admin', 'manager')
  async getIncomeExpenseReport(@Query() filters: ReportFilterDto, @Req() req: any) {
    const gymId = req.user.gymId;
    return this.reportsService.getIncomeExpenseReport(gymId, filters);
  }

  @Get('membership-sales')
  @Roles('admin', 'manager')
  async getMembershipSalesReport(@Query() filters: ReportFilterDto, @Req() req: any) {
    const gymId = req.user.gymId;
    return this.reportsService.getMembershipSalesReport(gymId, filters);
  }

  @Get('payment-dues')
  @Roles('admin', 'manager')
  async getPaymentDuesReport(@Req() req: any) {
    const gymId = req.user.gymId;
    return this.reportsService.getPaymentDuesReport(gymId);
  }
}
