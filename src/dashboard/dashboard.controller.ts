import {
  Controller,
  Get,
  Headers,
  UnauthorizedException,
} from '@nestjs/common';
import { DashboardService } from './dashboard.service';

@Controller('dashboard')
export class DashboardController {
  constructor(private readonly dashboardService: DashboardService) {}

  private getUserId(authHeader: string): string {
    if (!authHeader) {
      throw new UnauthorizedException('User ID header is required');
    }
    return authHeader;
  }

  // Get full dashboard data (stats + recent activity + streak summary)
  @Get()
  getDashboardData(@Headers('x-user-id') userId: string) {
    return this.dashboardService.getDashboardData(this.getUserId(userId));
  }

  // Get only stats
  @Get('stats')
  getStats(@Headers('x-user-id') userId: string) {
    return this.dashboardService.getStats(this.getUserId(userId));
  }

  // Get recent activity
  @Get('activity')
  getRecentActivity(@Headers('x-user-id') userId: string) {
    return this.dashboardService.getRecentActivity(this.getUserId(userId));
  }

  // Get streak summary
  @Get('streaks')
  getStreakSummary(@Headers('x-user-id') userId: string) {
    return this.dashboardService.getStreakSummary(this.getUserId(userId));
  }
}
