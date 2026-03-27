import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { PrismaService } from '../database/prisma.service';
import { TenantService } from '../tenant/tenant.service';

/**
 * Membership Scheduler
 * Runs daily to:
 * 1. Expire memberships past their end date
 * 2. Update client status from 'active' to 'expired' when they have no active membership
 */
@Injectable()
export class MembershipsScheduler {
  private readonly logger = new Logger(MembershipsScheduler.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly tenantService: TenantService,
  ) {}

  /**
   * Run every day at 00:05 AM — expire memberships and update client statuses
   */
  @Cron('5 0 * * *')
  async handleExpiredMemberships(): Promise<void> {
    this.logger.log('Running membership expiry check...');

    try {
      // Get all active gyms
      const gyms = await this.prisma.gym.findMany({
        where: { isActive: true },
        select: { id: true, name: true },
      });

      let totalExpired = 0;
      let totalUsersUpdated = 0;

      for (const gym of gyms) {
        try {
          const result = await this.tenantService.executeInTenant(
            gym.id,
            async (client) => {
              // 1. Expire memberships that are past their end date
              const expiredResult = await client.query(
                `UPDATE memberships
                 SET status = 'expired', updated_at = NOW()
                 WHERE status = 'active'
                 AND end_date < NOW()
                 AND (is_deleted = FALSE OR is_deleted IS NULL)
                 AND (freeze_start_date IS NULL OR freeze_end_date < NOW())`,
              );
              const expiredCount = expiredResult.rowCount || 0;

              // 2. Activate pending memberships whose start date has arrived
              await client.query(
                `UPDATE memberships
                 SET status = 'active', updated_at = NOW()
                 WHERE status = 'pending'
                 AND start_date <= NOW()
                 AND end_date >= NOW()
                 AND (is_deleted = FALSE OR is_deleted IS NULL)`,
              );

              // 3. Update client status — reactivate clients with newly active memberships
              await client.query(
                `UPDATE users
                 SET status = 'active', updated_at = NOW()
                 WHERE role = 'client'
                 AND status = 'expired'
                 AND (is_deleted = FALSE OR is_deleted IS NULL)
                 AND id IN (
                   SELECT DISTINCT user_id FROM memberships
                   WHERE status = 'active'
                   AND start_date <= NOW()
                   AND end_date >= NOW()
                   AND (is_deleted = FALSE OR is_deleted IS NULL)
                 )`,
              );

              // 4. Update client status to 'expired' if they have NO active or pending membership
              const usersResult = await client.query(
                `UPDATE users
                 SET status = 'expired', updated_at = NOW()
                 WHERE role = 'client'
                 AND status = 'active'
                 AND (is_deleted = FALSE OR is_deleted IS NULL)
                 AND id NOT IN (
                   SELECT DISTINCT user_id FROM memberships
                   WHERE status IN ('active', 'pending')
                   AND end_date >= NOW()
                   AND (is_deleted = FALSE OR is_deleted IS NULL)
                 )`,
              );
              const usersUpdated = usersResult.rowCount || 0;

              return { expiredCount, usersUpdated };
            },
          );

          totalExpired += result.expiredCount;
          totalUsersUpdated += result.usersUpdated;

          if (result.expiredCount > 0 || result.usersUpdated > 0) {
            this.logger.log(
              `Gym "${gym.name}" (${gym.id}): ${result.expiredCount} memberships expired, ${result.usersUpdated} clients moved to expired`,
            );
          }
        } catch (error) {
          const msg = error instanceof Error ? error.message : String(error);
          this.logger.error(`Failed to process gym ${gym.id}: ${msg}`);
        }
      }

      this.logger.log(
        `Membership expiry check complete: ${totalExpired} memberships expired, ${totalUsersUpdated} clients updated across ${gyms.length} gyms`,
      );
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      this.logger.error(`Membership expiry scheduler failed: ${msg}`);
    }
  }
}
