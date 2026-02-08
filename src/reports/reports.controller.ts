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
import { ApiQuery, ApiParam, ApiTags, ApiOperation } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { ReportsService } from './reports.service';
import { PdfGeneratorService } from './pdf-generator.service';
import { PdfTemplateService } from './pdf-template.service';
import { ReportFilterDto } from './dto/reports.dto';
import { PdfReportFilterDto } from './dto/pdf-report.dto';
import { ClientReportFilterDto } from './dto/client-reports.dto';

@ApiTags('reports')
@Controller('reports')
@UseGuards(JwtAuthGuard, RolesGuard)
export class ReportsController {
  constructor(
    private readonly reportsService: ReportsService,
    private readonly pdfGeneratorService: PdfGeneratorService,
    private readonly pdfTemplateService: PdfTemplateService,
  ) {}

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

  @Get('download-pdf')
  @Roles('admin', 'branch_admin', 'manager')
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
    name: 'branchId',
    required: false,
    type: Number,
    description: 'Branch ID for filtering (admin only)',
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
    @Req() req: any,
    @Res() res: Response,
    @Query('branchId') queryBranchId?: string,
  ) {
    const gymId = req.user.gymId;
    const branchId = this.resolveBranchId(req, queryBranchId);

    const fullData = await this.reportsService.getFullReportData(
      gymId,
      filters,
      branchId,
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
  @Roles('admin', 'branch_admin', 'manager')
  @ApiQuery({
    name: 'branchId',
    required: false,
    type: Number,
    description: 'Branch ID for filtering (admin only)',
  })
  async getIncomeExpenseReport(
    @Query() filters: ReportFilterDto,
    @Req() req: any,
    @Query('branchId') queryBranchId?: string,
  ) {
    const gymId = req.user.gymId;
    const branchId = this.resolveBranchId(req, queryBranchId);
    return this.reportsService.getIncomeExpenseReport(gymId, filters, branchId);
  }

  @Get('membership-sales')
  @Roles('admin', 'branch_admin', 'manager')
  @ApiQuery({
    name: 'branchId',
    required: false,
    type: Number,
    description: 'Branch ID for filtering (admin only)',
  })
  async getMembershipSalesReport(
    @Query() filters: ReportFilterDto,
    @Req() req: any,
    @Query('branchId') queryBranchId?: string,
  ) {
    const gymId = req.user.gymId;
    const branchId = this.resolveBranchId(req, queryBranchId);
    return this.reportsService.getMembershipSalesReport(
      gymId,
      filters,
      branchId,
    );
  }

  @Get('payment-dues')
  @Roles('admin', 'branch_admin', 'manager')
  @ApiQuery({
    name: 'branchId',
    required: false,
    type: Number,
    description: 'Branch ID for filtering (admin only)',
  })
  async getPaymentDuesReport(
    @Req() req: any,
    @Query('branchId') queryBranchId?: string,
  ) {
    const gymId = req.user.gymId;
    const branchId = this.resolveBranchId(req, queryBranchId);
    return this.reportsService.getPaymentDuesReport(gymId, branchId);
  }

  // ============================================
  // TRAINER CLIENT REPORTS
  // ============================================

  @Get('trainer/clients/summary')
  @Roles('trainer', 'admin', 'manager')
  @ApiOperation({ summary: "Get summary of all trainer's clients" })
  @ApiQuery({
    name: 'branchId',
    required: false,
    type: Number,
    description: 'Branch ID for filtering',
  })
  async getTrainerClientsSummary(
    @Req() req: any,
    @Query('branchId') queryBranchId?: string,
  ) {
    const gymId = req.user.gymId;
    const trainerId = req.user.id;
    const branchId = this.resolveBranchId(req, queryBranchId);
    return this.reportsService.getTrainerClientsSummary(
      trainerId,
      gymId,
      branchId,
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
  @ApiQuery({
    name: 'branchId',
    required: false,
    type: Number,
    description: 'Branch ID for filtering',
  })
  async getClientProgressReport(
    @Param('clientId', ParseIntPipe) clientId: number,
    @Query() filters: ClientReportFilterDto,
    @Req() req: any,
    @Query('branchId') queryBranchId?: string,
  ) {
    const gymId = req.user.gymId;
    const trainerId = req.user.id;
    const branchId = this.resolveBranchId(req, queryBranchId);
    return this.reportsService.getClientProgressReport(
      trainerId,
      clientId,
      gymId,
      filters,
      branchId,
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
  @ApiQuery({
    name: 'branchId',
    required: false,
    type: Number,
    description: 'Branch ID for filtering',
  })
  async getClientAttendanceReport(
    @Param('clientId', ParseIntPipe) clientId: number,
    @Query() filters: ClientReportFilterDto,
    @Req() req: any,
    @Query('branchId') queryBranchId?: string,
  ) {
    const gymId = req.user.gymId;
    const trainerId = req.user.id;
    const branchId = this.resolveBranchId(req, queryBranchId);
    return this.reportsService.getClientAttendanceReport(
      trainerId,
      clientId,
      gymId,
      filters,
      branchId,
    );
  }
}
