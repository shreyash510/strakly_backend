import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { RabbitMqService } from '../rabbitmq/rabbitmq.service';
import { DashboardService } from './dashboard.service';
import { DashboardCacheService } from './dashboard-cache.service';

@Injectable()
export class DashboardConsumer implements OnModuleInit {
  private readonly logger = new Logger(DashboardConsumer.name);

  constructor(
    private readonly rabbitMqService: RabbitMqService,
    private readonly dashboardService: DashboardService,
    private readonly dashboardCacheService: DashboardCacheService,
  ) {}

  async onModuleInit(): Promise<void> {
    if (!this.rabbitMqService.isConnected()) {
      this.logger.warn(
        'RabbitMQ not connected - dashboard consumer not started',
      );
      return;
    }
    await this.rabbitMqService.consume(
      'dashboard.recalculate',
      this.handleRecalculate.bind(this),
    );
  }

  private async handleRecalculate(
    message: Record<string, any>,
  ): Promise<void> {
    const { gymId } = message;
    if (!gymId) {
      this.logger.warn('Received recalculate message without gymId');
      return;
    }

    this.logger.debug(`Recalculating dashboard for gym ${gymId}`);

    try {
      // Invalidate all branch cache entries for this gym
      this.dashboardCacheService.invalidate(gymId);

      // Recompute for branchId=null (all branches view)
      const stats = await this.dashboardService.computeAdminDashboard(
        gymId,
        null,
      );
      this.dashboardCacheService.set(gymId, null, stats);

      this.logger.debug(`Dashboard cache updated for gym ${gymId}`);
    } catch (error) {
      this.logger.error(
        `Failed to recalculate dashboard for gym ${gymId}: ${error.message}`,
      );
    }
  }
}
