import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { TenantService } from '../tenant/tenant.service';
import { PrismaService } from '../database/prisma.service';
import { EngagementService } from './engagement.service';

@Injectable()
export class EngagementScheduler {
  private readonly logger = new Logger(EngagementScheduler.name);

  constructor(
    private readonly tenantService: TenantService,
    private readonly prisma: PrismaService,
    private readonly engagementService: EngagementService,
  ) {}

  /**
   * Recalculate engagement scores for all members across all active gyms.
   * Runs daily at 2:00 AM.
   */
  @Cron('0 2 * * *')
  async recalculateAllScores(): Promise<void> {
    this.logger.log('Starting daily engagement score recalculation for all gyms...');

    try {
      // Query all active gyms from the public schema
      const gyms = await this.prisma.$queryRawUnsafe<Array<{ id: number; name: string }>>(
        `SELECT id, name FROM public.gyms WHERE status = 'active'`,
      );

      this.logger.log(`Found ${gyms.length} active gyms to process`);

      let totalCalculated = 0;
      let totalErrors = 0;

      for (const gym of gyms) {
        try {
          this.logger.debug(`Processing engagement scores for gym ${gym.id} (${gym.name})`);
          const result = await this.engagementService.calculateForAllMembers(gym.id);
          totalCalculated += result.calculated;
          totalErrors += result.errors;
          this.logger.debug(
            `Gym ${gym.id}: ${result.calculated} calculated, ${result.errors} errors out of ${result.totalMembers} members`,
          );
        } catch (error) {
          totalErrors++;
          this.logger.error(
            `Failed to process engagement scores for gym ${gym.id}: ${error instanceof Error ? error.message : String(error)}`,
          );
        }
      }

      this.logger.log(
        `Daily engagement score recalculation complete: ${totalCalculated} scores calculated, ${totalErrors} errors across ${gyms.length} gyms`,
      );
    } catch (error) {
      this.logger.error(
        `Failed to run daily engagement score recalculation: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }
}
