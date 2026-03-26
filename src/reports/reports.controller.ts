import {
  Controller,
  Get,
  Query,
  UseGuards,
  Req,
  Res,
  Param,
  ParseIntPipe,
} from '@nestjs/common';
import type { Response } from 'express';
import { ApiQuery, ApiParam, ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { ReportsService } from './reports.service';
import { PdfGeneratorService } from './pdf-generator.service';
import { PdfTemplateService } from './pdf-template.service';
import { ReportFilterDto, DailySalesFilterDto } from './dto/reports.dto';
import { PdfReportFilterDto } from './dto/pdf-report.dto';
import { ClientReportFilterDto } from './dto/client-reports.dto';
import type { AuthenticatedRequest } from '../common/types';

@ApiTags('reports')
@ApiBearerAuth()
@Controller('reports')
@UseGuards(JwtAuthGuard, RolesGuard)
export class ReportsController {
  constructor(
    private readonly reportsService: ReportsService,
    private readonly pdfGeneratorService: PdfGeneratorService,
    private readonly pdfTemplateService: PdfTemplateService,
  ) {}

  @Get('download-pdf')
  @Roles('admin', 'manager')
  @ApiOperation({ summary: 'Download comprehensive PDF report' })
  @ApiQuery({
    name: 'year',
    required: false,
    type: Number,
    description: 'Filter by year',
  })
  @ApiQuery({
    name: 'month',
    required: false,
    type: Number,
    description: 'Filter by month (1-12)',
  })
  @ApiQuery({
    name: 'startDate',
    required: false,
    type: String,
    description: 'Start date for attendance range (YYYY-MM-DD)',
  })
  @ApiQuery({
    name: 'endDate',
    required: false,
    type: String,
    description: 'End date for attendance range (YYYY-MM-DD)',
  })
  async downloadPdfReport(
    @Query() filters: PdfReportFilterDto,
    @Req() req: AuthenticatedRequest,
    @Res() res: Response,
  ) {
    const gymId = req.user.gymId!;

    const fullData = await this.reportsService.getFullReportData(
      gymId,
      filters,
    );

    const html = this.pdfTemplateService.buildFullReportHtml(fullData);
    const pdfBuffer = await this.pdfGeneratorService.generatePdf(html);

    const year = fullData.period.year;
    const month = fullData.period.month
      ? String(fullData.period.month).padStart(2, '0')
      : 'full';
    const filename = `strakly-report-${year}-${month}.pdf`;

    res.set({
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="${filename}"`,
      'Content-Length': pdfBuffer.length.toString(),
    });
    res.end(pdfBuffer);
  }

  @Get('income-expense')
  @Roles('admin', 'manager')
  async getIncomeExpenseReport(
    @Query() filters: ReportFilterDto,
    @Req() req: AuthenticatedRequest,
  ) {
    const gymId = req.user.gymId!;
    return this.reportsService.getIncomeExpenseReport(gymId, filters);
  }

  @Get('membership-sales')
  @Roles('admin', 'manager')
  async getMembershipSalesReport(
    @Query() filters: ReportFilterDto,
    @Req() req: AuthenticatedRequest,
  ) {
    const gymId = req.user.gymId!;
    return this.reportsService.getMembershipSalesReport(
      gymId,
      filters,
    );
  }

  @Get('payment-dues')
  @Roles('admin', 'manager')
  async getPaymentDuesReport(
    @Req() req: AuthenticatedRequest,
  ) {
    const gymId = req.user.gymId!;
    return this.reportsService.getPaymentDuesReport(gymId);
  }

  @Get('daily-sales')
  @Roles('admin', 'manager')
  @ApiOperation({ summary: 'Get daily sales report (memberships + products + expenses)' })
  @ApiQuery({ name: 'date', required: false, type: String, description: 'Date (YYYY-MM-DD), defaults to today' })
  async getDailySalesReport(
    @Query() filters: DailySalesFilterDto,
    @Req() req: AuthenticatedRequest,
  ) {
    const gymId = req.user.gymId!;
    const date = filters.date || new Date().toISOString().slice(0, 10);
    return this.reportsService.getDailySalesReport(gymId, date);
  }

  @Get('deleted-transactions')
  @Roles('admin')
  @ApiOperation({ summary: 'Get deleted transactions (memberships + product sales)' })
  @ApiQuery({ name: 'month', required: false, type: Number, description: 'Month (1-12)' })
  @ApiQuery({ name: 'year', required: false, type: Number, description: 'Year' })
  async getDeletedTransactions(
    @Query() filters: ReportFilterDto,
    @Req() req: AuthenticatedRequest,
  ) {
    const gymId = req.user.gymId!;
    return this.reportsService.getDeletedTransactions(gymId, filters);
  }

  // ============================================
  // TRAINER CLIENT REPORTS
  // ============================================

  @Get('trainer/clients/summary')
  @Roles('trainer', 'admin', 'manager')
  @ApiOperation({ summary: "Get summary of all trainer's clients" })
  async getTrainerClientsSummary(
    @Req() req: AuthenticatedRequest,
  ) {
    const gymId = req.user.gymId!;
    const trainerId = req.user.userId;
    return this.reportsService.getTrainerClientsSummary(
      trainerId,
      gymId,
    );
  }

  @Get('trainer/clients/:clientId/progress')
  @Roles('trainer', 'admin', 'manager')
  @ApiOperation({ summary: 'Get progress report for a specific client' })
  @ApiParam({ name: 'clientId', type: Number, description: 'Client ID' })
  @ApiQuery({
    name: 'startDate',
    required: false,
    type: String,
    description: 'Start date (YYYY-MM-DD)',
  })
  @ApiQuery({
    name: 'endDate',
    required: false,
    type: String,
    description: 'End date (YYYY-MM-DD)',
  })
  async getClientProgressReport(
    @Param('clientId', ParseIntPipe) clientId: number,
    @Query() filters: ClientReportFilterDto,
    @Req() req: AuthenticatedRequest,
  ) {
    const gymId = req.user.gymId!;
    const trainerId = req.user.userId;
    return this.reportsService.getClientProgressReport(
      trainerId,
      clientId,
      gymId,
      filters,
    );
  }

  @Get('trainer/clients/:clientId/attendance')
  @Roles('trainer', 'admin', 'manager')
  @ApiOperation({ summary: 'Get attendance report for a specific client' })
  @ApiParam({ name: 'clientId', type: Number, description: 'Client ID' })
  @ApiQuery({
    name: 'startDate',
    required: false,
    type: String,
    description: 'Start date (YYYY-MM-DD)',
  })
  @ApiQuery({
    name: 'endDate',
    required: false,
    type: String,
    description: 'End date (YYYY-MM-DD)',
  })
  async getClientAttendanceReport(
    @Param('clientId', ParseIntPipe) clientId: number,
    @Query() filters: ClientReportFilterDto,
    @Req() req: AuthenticatedRequest,
  ) {
    const gymId = req.user.gymId!;
    const trainerId = req.user.userId;
    return this.reportsService.getClientAttendanceReport(
      trainerId,
      clientId,
      gymId,
      filters,
    );
  }
}
