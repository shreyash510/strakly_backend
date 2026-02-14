import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { PrismaService } from '../database/prisma.service';
import { LoyaltyService } from './loyalty.service';

@Injectable()
export class LoyaltyScheduler {
  private readonly logger = new Logger(LoyaltyScheduler.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly loyaltyService: LoyaltyService,
  ) {}

  /**
   * Run every day at 4:00 AM
   * - Expire old loyalty points (where expires_at < NOW() and type='earn')
   * - Recalculate tier levels for users whose total_earned moved past a tier threshold
   */
  @Cron('0 4 * * *')
  async handleLoyaltyMaintenance() {
    this.logger.log('Starting daily loyalty maintenance job...');

    try {
      // Get all active gyms
      const gyms = await this.prisma.gym.findMany({
        where: { isActive: true },
        select: { id: true, name: true },
      });

      let totalExpired = 0;
      let totalTierUpdates = 0;

      for (const gym of gyms) {
        try {
          // Expire old points
          const expired = await this.loyaltyService.expireOldPoints(gym.id);
          totalExpired += expired;

          if (expired > 0) {
            this.logger.log(
              `Expired ${expired} points for gym ${gym.id} (${gym.name})`,
            );
          }

          // Recalculate tiers
          const tierUpdates = await this.loyaltyService.recalculateTiers(
            gym.id,
          );
          totalTierUpdates += tierUpdates;

          if (tierUpdates > 0) {
            this.logger.log(
              `Updated ${tierUpdates} tier assignments for gym ${gym.id} (${gym.name})`,
            );
          }
        } catch (error) {
          this.logger.error(
            `Failed loyalty maintenance for gym ${gym.id} (${gym.name}): ${error instanceof Error ? error.message : String(error)}`,
          );
        }
      }

      this.logger.log(
        `Loyalty maintenance completed. Expired ${totalExpired} points, updated ${totalTierUpdates} tiers across ${gyms.length} gyms.`,
      );
    } catch (error) {
      this.logger.error(
        `Loyalty maintenance job failed: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }
}
