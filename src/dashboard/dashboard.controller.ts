import { Controller, Get, UseGuards, Req, Query } from '@nestjs/common';
import { resolveEffectiveBranchId } from '../common';
import {
  ApiTags,
  ApiOperation,
  ApiBearerAuth,
  ApiResponse,
  ApiQuery,
} from '@nestjs/swagger';
import { DashboardService } from './dashboard.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import type { AuthenticatedRequest } from '../common/types';
import {
  SuperadminDashboardDto,
  AdminDashboardDto,
  ClientDashboardDto,
  PaginatedClientsDto,
} from './dto/dashboard.dto';

@ApiTags('dashboard')
@Controller('dashboard')
@UseGuards(JwtAuthGuard, RolesGuard)
@ApiBearerAuth()
export class DashboardController {
  constructor(private readonly dashboardService: DashboardService) {}

  @Get('superadmin')
  @Roles('superadmin')
  @ApiOperation({ summary: 'Get superadmin dashboard data' })
  @ApiResponse({
    status: 200,
    description: 'Dashboard data retrieved successfully',
    type: SuperadminDashboardDto,
  })
  async getSuperadminDashboard(): Promise<SuperadminDashboardDto> {
    return this.dashboardService.getSuperadminDashboard();
  }

  @Get('superadmin/gyms')
  @Roles('superadmin')
  @ApiOperation({ summary: 'Get paginated gyms for superadmin dashboard' })
  @ApiQuery({
    name: 'page',
    required: false,
    type: Number,
    description: 'Page number (default: 1)',
  })
  @ApiQuery({
    name: 'limit',
    required: false,
    type: Number,
    description: 'Items per page (default: 5)',
  })
  async getSuperadminGyms(
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    const pageNum = page ? parseInt(page, 10) : 1;
    const limitNum = limit ? parseInt(limit, 10) : 5;
    return this.dashboardService.getPaginatedGyms(pageNum, limitNum);
  }

  @Get('admin')
  @Roles('superadmin', 'admin', 'manager', 'cashier')
  @ApiOperation({ summary: 'Get admin dashboard data for their gym(s)' })
  @ApiResponse({
    status: 200,
    description: 'Admin dashboard data retrieved successfully',
    type: AdminDashboardDto,
  })
  @ApiQuery({ name: 'branchId', required: false, type: Number, description: 'Filter by branch ID' })
  async getAdminDashboard(
    @Req() req: AuthenticatedRequest,
    @Query('branchId') branchId?: string,
  ): Promise<AdminDashboardDto> {
    const userId = req.user?.userId;
    const gymId = req.user?.gymId;
    const parsedBranchId = resolveEffectiveBranchId(req.user, branchId);
    return this.dashboardService.getAdminDashboard(
      Number(userId),
      Number(gymId),
      parsedBranchId,
    );
  }

  @Get('client')
  @Roles('superadmin', 'admin', 'manager', 'trainer', 'client')
  @ApiOperation({ summary: 'Get client dashboard data' })
  @ApiResponse({
    status: 200,
    description: 'Client dashboard data retrieved successfully',
    type: ClientDashboardDto,
  })
  async getClientDashboard(
    @Req() req: AuthenticatedRequest,
  ): Promise<ClientDashboardDto> {
    const userId = req.user?.userId;
    const gymId = req.user?.gymId;
    return this.dashboardService.getClientDashboard(
      Number(userId),
      Number(gymId),
    );
  }

  @Get('admin/new-clients')
  @Roles('superadmin', 'admin', 'manager', 'cashier')
  @ApiOperation({ summary: 'Get paginated new clients (active status)' })
  @ApiResponse({
    status: 200,
    description: 'New clients retrieved successfully',
    type: PaginatedClientsDto,
  })
  @ApiQuery({
    name: 'page',
    required: false,
    type: Number,
    description: 'Page number (default: 1)',
  })
  @ApiQuery({
    name: 'limit',
    required: false,
    type: Number,
    description: 'Items per page (default: 5)',
  })
  @ApiQuery({ name: 'branchId', required: false, type: Number, description: 'Filter by branch ID' })
  async getNewClients(
    @Req() req: AuthenticatedRequest,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
    @Query('branchId') branchId?: string,
  ): Promise<PaginatedClientsDto> {
    const gymId = req.user?.gymId;
    const pageNum = page ? parseInt(page, 10) : 1;
    const limitNum = limit ? parseInt(limit, 10) : 5;
    const parsedBranchId = resolveEffectiveBranchId(req.user, branchId);
    return this.dashboardService.getNewClients(
      Number(gymId),
      pageNum,
      limitNum,
      parsedBranchId,
    );
  }

  @Get('admin/new-inquiries')
  @Roles('superadmin', 'admin', 'manager', 'cashier')
  @ApiOperation({
    summary: 'Get paginated new inquiries (onboarding/pending status)',
  })
  @ApiResponse({
    status: 200,
    description: 'New inquiries retrieved successfully',
    type: PaginatedClientsDto,
  })
  @ApiQuery({
    name: 'page',
    required: false,
    type: Number,
    description: 'Page number (default: 1)',
  })
  @ApiQuery({
    name: 'limit',
    required: false,
    type: Number,
    description: 'Items per page (default: 5)',
  })
  @ApiQuery({ name: 'branchId', required: false, type: Number, description: 'Filter by branch ID' })
  async getNewInquiries(
    @Req() req: AuthenticatedRequest,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
    @Query('branchId') branchId?: string,
  ): Promise<PaginatedClientsDto> {
    const gymId = req.user?.gymId;
    const pageNum = page ? parseInt(page, 10) : 1;
    const limitNum = limit ? parseInt(limit, 10) : 5;
    const parsedBranchId = resolveEffectiveBranchId(req.user, branchId);
    return this.dashboardService.getNewInquiries(
      Number(gymId),
      pageNum,
      limitNum,
      parsedBranchId,
    );
  }
}
