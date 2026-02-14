import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { TenantService } from '../tenant/tenant.service';
import { PrismaService } from '../database/prisma.service';

@Injectable()
export class GamificationScheduler {
  private readonly logger = new Logger(GamificationScheduler.name);

  constructor(
    private readonly tenantService: TenantService,
    private readonly prisma: PrismaService,
  ) {}

  /**
   * Daily at 3 AM:
   * 1. Mark broken streaks (last_activity_date < yesterday)
   * 2. Auto-complete ended challenges
   * 3. Rank active challenge participants by progress_pct
   */
  @Cron('0 3 * * *')
  async handleDailyGamificationTasks(): Promise<void> {
    this.logger.log('Starting daily gamification tasks...');

    try {
      const gyms = await this.prisma.gym.findMany({
        where: { isActive: true },
        select: { id: true },
      });

      for (const gym of gyms) {
        try {
          await this.processGymGamification(gym.id);
        } catch (error) {
          this.logger.error(
            `Failed gamification tasks for gym ${gym.id}: ${error instanceof Error ? error.message : String(error)}`,
          );
        }
      }

      this.logger.log('Daily gamification tasks completed');
    } catch (error) {
      this.logger.error(
        `Error in handleDailyGamificationTasks: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  private async processGymGamification(gymId: number): Promise<void> {
    await this.tenantService.executeInTenant(gymId, async (client) => {
      // 1. Mark broken streaks: if last_activity_date < yesterday, reset current_count to 0
      await client.query(
        `UPDATE streaks
         SET current_count = 0, updated_at = NOW()
         WHERE last_activity_date < CURRENT_DATE - INTERVAL '1 day'
           AND current_count > 0`,
      );

      // 2. Auto-complete ended challenges (end_date has passed and status is still 'active')
      await client.query(
        `UPDATE challenges
         SET status = 'completed', updated_at = NOW()
         WHERE status = 'active'
           AND end_date < CURRENT_DATE
           AND is_deleted = FALSE`,
      );

      // Also activate upcoming challenges whose start_date has arrived
      await client.query(
        `UPDATE challenges
         SET status = 'active', updated_at = NOW()
         WHERE status = 'upcoming'
           AND start_date <= CURRENT_DATE
           AND end_date >= CURRENT_DATE
           AND is_deleted = FALSE`,
      );

      // 3. Rank active challenge participants by progress_pct
      const activeChallenges = await client.query(
        `SELECT id FROM challenges WHERE status = 'active' AND is_deleted = FALSE`,
      );

      for (const challenge of activeChallenges.rows) {
        await client.query(
          `UPDATE challenge_participants cp
           SET rank = ranked.rn, updated_at = NOW()
           FROM (
             SELECT id, ROW_NUMBER() OVER (ORDER BY progress_pct DESC, joined_at ASC) AS rn
             FROM challenge_participants
             WHERE challenge_id = $1
           ) ranked
           WHERE cp.id = ranked.id`,
          [challenge.id],
        );
      }
    });
  }
}
