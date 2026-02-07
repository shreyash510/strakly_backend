import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { DashboardService } from './dashboard.service';
import { DashboardCacheService } from './dashboard-cache.service';

@Injectable()
export class DashboardScheduler {
  private readonly logger = new Logger(DashboardScheduler.name);

  constructor(
    private readonly dashboardService: DashboardService,
    private readonly dashboardCacheService: DashboardCacheService,
  ) {}

  /**
   * Every 5 minutes, refresh all currently cached gym dashboards.
   * Safety net: if RabbitMQ messages are lost, cached data stays fresh.
   */
  @Cron('*/10 * * * *')
  async refreshActiveCaches(): Promise<void> {
    const keys = this.dashboardCacheService.getAllKeys();
    if (keys.length === 0) return;

    this.logger.debug(`Refreshing ${keys.length} cached dashboards`);

    for (const { gymId, branchId } of keys) {
      try {
        const stats = await this.dashboardService.computeAdminDashboard(
          gymId,
          branchId,
        );
        this.dashboardCacheService.set(gymId, branchId, stats);
      } catch (error) {
        this.logger.error(
          `Failed to refresh cache for gym ${gymId}, branch ${branchId}: ${error.message}`,
        );
      }
    }
  }
}
