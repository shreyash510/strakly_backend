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
   * Every 10 minutes, refresh all currently cached gym dashboards.
   * Safety net: if RabbitMQ messages are lost, cached data stays fresh.
   */
  @Cron('*/10 * * * *')
  async refreshActiveCaches(): Promise<void> {
    const gymIds = this.dashboardCacheService.getAllGymIds();
    if (gymIds.length === 0) return;

    this.logger.debug(`Refreshing ${gymIds.length} cached dashboards`);

    for (const gymId of gymIds) {
      try {
        const stats = await this.dashboardService.computeAdminDashboard(gymId);
        this.dashboardCacheService.set(gymId, stats);
      } catch (error) {
        this.logger.error(
          `Failed to refresh cache for gym ${gymId}: ${error.message}`,
        );
      }
    }
  }
}
