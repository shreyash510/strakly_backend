import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PrismaService } from '../database/prisma.service';
import { TenantService } from '../tenant/tenant.service';
import { NotificationsService } from './notifications.service';

@Injectable()
export class NotificationsScheduler {
  private readonly logger = new Logger(NotificationsScheduler.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly tenantService: TenantService,
    private readonly notificationsService: NotificationsService,
  ) {}

  /**
   * Run every day at 9:00 AM to check for expiring memberships
   * Sends notifications to users whose memberships expire in 7, 3, or 1 days
   */
  @Cron(CronExpression.EVERY_DAY_AT_9AM)
  async handleMembershipExpiryNotifications() {
    this.logger.log('Starting membership expiry notification job...');

    try {
      // Get all active gyms
      const gyms = await this.prisma.gym.findMany({
        where: { isActive: true },
        select: { id: true, name: true },
      });

      let totalNotificationsSent = 0;

      for (const gym of gyms) {
        try {
          const notificationsSent = await this.checkExpiringMemberships(gym.id);
          totalNotificationsSent += notificationsSent;
        } catch (error) {
          this.logger.error(
            `Failed to check expiring memberships for gym ${gym.id} (${gym.name}): ${error.message}`,
          );
        }
      }

      this.logger.log(
        `Membership expiry notification job completed. Sent ${totalNotificationsSent} notifications.`,
      );
    } catch (error) {
      this.logger.error(
        `Membership expiry notification job failed: ${error.message}`,
      );
    }
  }

  /**
   * Check expiring memberships for a specific gym
   * Returns the number of notifications sent
   */
  private async checkExpiringMemberships(gymId: number): Promise<number> {
    const now = new Date();
    const today = new Date(now);
    today.setHours(0, 0, 0, 0);
    const daysToCheck = [7, 3, 1]; // Notify at 7, 3, and 1 day(s) before expiry
    let notificationsSent = 0;

    for (const days of daysToCheck) {
      const targetDate = new Date(now);
      targetDate.setDate(targetDate.getDate() + days);

      const startOfDay = new Date(targetDate);
      startOfDay.setHours(0, 0, 0, 0);

      const endOfDay = new Date(targetDate);
      endOfDay.setHours(23, 59, 59, 999);

      // Fetch expiring memberships AND already-notified user IDs in a single connection
      const { memberships, alreadyNotifiedUserIds } =
        await this.tenantService.executeInTenant(gymId, async (client) => {
          const membershipsResult = await client.query(
            `SELECT m.id, m.user_id, m.branch_id, m.end_date, p.name as plan_name
             FROM memberships m
             LEFT JOIN plans p ON p.id = m.plan_id
             WHERE m.status = 'active'
               AND m.end_date >= $1
               AND m.end_date <= $2`,
            [startOfDay, endOfDay],
          );

          // Batch dedup: get all user IDs already notified today for this day count
          const notifiedResult = await client.query(
            `SELECT DISTINCT user_id FROM notifications
             WHERE type = 'membership_expiry'
               AND created_at >= $1
               AND data->>'daysRemaining' = $2`,
            [today, String(days)],
          );

          const notifiedSet = new Set(
            notifiedResult.rows.map((r: any) => r.user_id as number),
          );
          return {
            memberships: membershipsResult.rows,
            alreadyNotifiedUserIds: notifiedSet,
          };
        });

      for (const membership of memberships) {
        if (!alreadyNotifiedUserIds.has(membership.user_id)) {
          await this.notificationsService.notifyMembershipExpiry(
            membership.user_id,
            gymId,
            membership.branch_id,
            {
              planName: membership.plan_name || 'Membership',
              endDate: new Date(membership.end_date),
              daysRemaining: days,
              membershipId: membership.id,
            },
          );
          notificationsSent++;
        }
      }
    }

    return notificationsSent;
  }

  /**
   * Run every day at 10:00 AM to check for expiring gym subscriptions
   * Notifies superadmins about gyms whose subscriptions expire in 14, 7, 3, or 1 day(s)
   */
  @Cron(CronExpression.EVERY_DAY_AT_10AM)
  async handleGymSubscriptionExpiryNotifications() {
    this.logger.log('Starting gym subscription expiry notification job...');

    try {
      const daysToCheck = [14, 7, 3, 1];
      let totalNotificationsSent = 0;

      for (const days of daysToCheck) {
        const targetDate = new Date();
        targetDate.setDate(targetDate.getDate() + days);

        // Set to start and end of day
        const startOfDay = new Date(targetDate);
        startOfDay.setHours(0, 0, 0, 0);

        const endOfDay = new Date(targetDate);
        endOfDay.setHours(23, 59, 59, 999);

        const expiringSubscriptions =
          await this.prisma.saasGymSubscription.findMany({
            where: {
              status: { in: ['active', 'trial'] },
              endDate: {
                gte: startOfDay,
                lte: endOfDay,
              },
            },
            include: {
              gym: true,
              plan: true,
            },
          });

        for (const subscription of expiringSubscriptions) {
          // Check if we already sent this notification today
          const today = new Date();
          today.setHours(0, 0, 0, 0);

          const alreadyNotified =
            await this.prisma.systemNotification.findFirst({
              where: {
                type: 'gym_subscription_expiry',
                createdAt: { gte: today },
                data: {
                  path: ['gymId'],
                  equals: subscription.gymId,
                },
              },
            });

          if (!alreadyNotified) {
            await this.notificationsService.notifyAllSuperadmins({
              type: 'gym_subscription_expiry',
              title: 'Gym Subscription Expiring',
              message: `${subscription.gym.name}'s ${subscription.plan.name} subscription expires in ${days} day${days > 1 ? 's' : ''}.`,
              data: {
                gymId: subscription.gymId,
                gymName: subscription.gym.name,
                planName: subscription.plan.name,
                daysRemaining: days,
                endDate: subscription.endDate.toISOString(),
              },
              actionUrl: `/superadmin/gyms/${subscription.gymId}`,
              priority: days <= 3 ? 'high' : 'normal',
            });
            totalNotificationsSent++;
          }
        }
      }

      this.logger.log(
        `Gym subscription expiry notification job completed. Sent ${totalNotificationsSent} notifications.`,
      );
    } catch (error) {
      this.logger.error(
        `Gym subscription expiry notification job failed: ${error.message}`,
      );
    }
  }

  /**
   * Run every day at 2:00 AM to clean up old notifications
   * Deletes all notifications older than 15 days
   */
  @Cron(CronExpression.EVERY_DAY_AT_2AM)
  async handleNotificationCleanup() {
    this.logger.log('Starting notification cleanup job...');

    try {
      const gyms = await this.prisma.gym.findMany({
        where: { isActive: true },
        select: { id: true },
      });

      let totalDeleted = 0;

      // Clean up tenant notifications
      for (const gym of gyms) {
        try {
          const deleted =
            await this.notificationsService.deleteOldNotifications(
              gym.id,
              15, // Delete all notifications older than 15 days
            );
          totalDeleted += deleted;
        } catch (error) {
          this.logger.error(
            `Failed to clean up notifications for gym ${gym.id}: ${error.message}`,
          );
        }
      }

      // Clean up superadmin notifications
      try {
        const systemDeleted =
          await this.notificationsService.deleteOldSystemNotifications(15);
        totalDeleted += systemDeleted;
        this.logger.log(
          `Deleted ${systemDeleted} old superadmin notifications.`,
        );
      } catch (error) {
        this.logger.error(
          `Failed to clean up superadmin notifications: ${error.message}`,
        );
      }

      this.logger.log(
        `Notification cleanup job completed. Deleted ${totalDeleted} old notifications total.`,
      );
    } catch (error) {
      this.logger.error(`Notification cleanup job failed: ${error.message}`);
    }
  }
}
