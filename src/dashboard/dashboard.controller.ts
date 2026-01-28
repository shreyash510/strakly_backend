import { Controller, Get, UseGuards, Req, Query } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiResponse, ApiQuery } from '@nestjs/swagger';
import { DashboardService } from './dashboard.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { SuperadminDashboardDto, AdminDashboardDto, ClientDashboardDto } from './dto/dashboard.dto';

@ApiTags('dashboard')
@Controller('dashboard')
@UseGuards(JwtAuthGuard, RolesGuard)
@ApiBearerAuth()
export class DashboardController {
  constructor(private readonly dashboardService: DashboardService) {}

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

  @Get('admin')
  @Roles('superadmin', 'admin', 'manager')
  @ApiOperation({ summary: 'Get admin dashboard data for their gym(s)' })
  @ApiResponse({
    status: 200,
    description: 'Admin dashboard data retrieved successfully',
    type: AdminDashboardDto,
  })
  @ApiQuery({ name: 'branchId', required: false, type: Number, description: 'Branch ID for filtering (admin only)' })
  async getAdminDashboard(@Req() req: any, @Query('branchId') queryBranchId?: string): Promise<AdminDashboardDto> {
    const userId = req.user?.userId;
    const gymId = req.user?.gymId;
    const branchId = this.resolveBranchId(req, queryBranchId);
    return this.dashboardService.getAdminDashboard(Number(userId), Number(gymId), branchId);
  }

  @Get('client')
  @Roles('superadmin', 'admin', 'manager', 'trainer', 'client')
  @ApiOperation({ summary: 'Get client dashboard data' })
  @ApiResponse({
    status: 200,
    description: 'Client dashboard data retrieved successfully',
    type: ClientDashboardDto,
  })
  async getClientDashboard(@Req() req: any): Promise<ClientDashboardDto> {
    const userId = req.user?.userId;
    const gymId = req.user?.gymId;
    return this.dashboardService.getClientDashboard(Number(userId), Number(gymId));
  }
}
