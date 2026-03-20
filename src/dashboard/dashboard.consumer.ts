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
      // Capture which branch variants are currently cached before invalidation
      const cachedEntries = this.dashboardCacheService
        .getAllKeys()
        .filter((entry) => entry.gymId === gymId);

      // Invalidate ALL branch cache entries for this gym
      this.dashboardCacheService.invalidate(gymId);

      // Determine which branchIds to recompute (always include null for all-branches view)
      const branchIds = new Set<number | null>([null]);
      for (const entry of cachedEntries) {
        branchIds.add(entry.branchId);
      }

      // Recompute and re-cache all branch variants
      for (const branchId of branchIds) {
        const stats = await this.dashboardService.computeAdminDashboard(gymId);
        this.dashboardCacheService.set(gymId, branchId, stats);
      }

      this.logger.debug(
        `Dashboard cache updated for gym ${gymId} (${branchIds.size} variant(s))`,
      );
    } catch (error) {
      this.logger.error(
        `Failed to recalculate dashboard for gym ${gymId}: ${error.message}`,
      );
    }
  }
}
