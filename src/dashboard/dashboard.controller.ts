import { Controller, Get, UseGuards, Req } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiResponse } from '@nestjs/swagger';
import { DashboardService } from './dashboard.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { SuperadminDashboardDto, AdminDashboardDto, MemberDashboardDto } from './dto/dashboard.dto';

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

  @Get('admin')
  @Roles('superadmin', 'admin')
  @ApiOperation({ summary: 'Get admin dashboard data for their gym(s)' })
  @ApiResponse({
    status: 200,
    description: 'Admin dashboard data retrieved successfully',
    type: AdminDashboardDto,
  })
  async getAdminDashboard(@Req() req: any): Promise<AdminDashboardDto> {
    const userId = req.user?.userId;
    const gymId = req.user?.gymId;
    return this.dashboardService.getAdminDashboard(Number(userId), Number(gymId));
  }

  @Get('client')
  @Roles('superadmin', 'admin', 'manager', 'trainer', 'client')
  @ApiOperation({ summary: 'Get client dashboard data' })
  @ApiResponse({
    status: 200,
    description: 'Client dashboard data retrieved successfully',
    type: MemberDashboardDto,
  })
  async getClientDashboard(@Req() req: any): Promise<MemberDashboardDto> {
    const userId = req.user?.userId;
    const gymId = req.user?.gymId;
    return this.dashboardService.getMemberDashboard(Number(userId), Number(gymId));
  }
}
