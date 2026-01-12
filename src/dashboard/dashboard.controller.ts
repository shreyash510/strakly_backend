import { Controller, Get, UseGuards } from '@nestjs/common';
import { DashboardService } from './dashboard.service';
import { JwtAuthGuard } from '../auth/guards';
import { CurrentUser } from '../auth/decorators';

@Controller('dashboard')
@UseGuards(JwtAuthGuard)
export class DashboardController {
  constructor(private readonly dashboardService: DashboardService) {}

  // Get full dashboard data (stats + recent activity + streak summary)
  @Get()
  getDashboardData(@CurrentUser() user: any) {
    return this.dashboardService.getDashboardData(user.userId);
  }

  // Get only stats
  @Get('stats')
  getStats(@CurrentUser() user: any) {
    return this.dashboardService.getStats(user.userId);
  }

  // Get recent activity
  @Get('activity')
  getRecentActivity(@CurrentUser() user: any) {
    return this.dashboardService.getRecentActivity(user.userId);
  }

  // Get streak summary
  @Get('streaks')
  getStreakSummary(@CurrentUser() user: any) {
    return this.dashboardService.getStreakSummary(user.userId);
  }
}
