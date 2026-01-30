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
      this.logger.error(`Membership expiry notification job failed: ${error.message}`);
    }
  }

  /**
   * Check expiring memberships for a specific gym
   * Returns the number of notifications sent
   */
  private async checkExpiringMemberships(gymId: number): Promise<number> {
    const now = new Date();
    const daysToCheck = [7, 3, 1]; // Notify at 7, 3, and 1 day(s) before expiry
    let notificationsSent = 0;

    for (const days of daysToCheck) {
      const targetDate = new Date(now);
      targetDate.setDate(targetDate.getDate() + days);

      // Set to start of day
      const startOfDay = new Date(targetDate);
      startOfDay.setHours(0, 0, 0, 0);

      // Set to end of day
      const endOfDay = new Date(targetDate);
      endOfDay.setHours(23, 59, 59, 999);

      const expiringMemberships = await this.tenantService.executeInTenant(
        gymId,
        async (client) => {
          const result = await client.query(
            `SELECT m.id, m.user_id, m.branch_id, m.end_date, p.name as plan_name
             FROM memberships m
             LEFT JOIN plans p ON p.id = m.plan_id
             WHERE m.status = 'active'
               AND m.end_date >= $1
               AND m.end_date <= $2`,
            [startOfDay, endOfDay],
          );
          return result.rows;
        },
      );

      for (const membership of expiringMemberships) {
        // Check if we already sent a notification for this expiry period
        const alreadyNotified = await this.hasExpiryNotification(
          gymId,
          membership.user_id,
          days,
        );

        if (!alreadyNotified) {
          await this.notificationsService.notifyMembershipExpiry(
            membership.user_id,
            gymId,
            membership.branch_id,
            {
              planName: membership.plan_name || 'Membership',
              endDate: new Date(membership.end_date),
              daysRemaining: days,
            },
          );
          notificationsSent++;
        }
      }
    }

    return notificationsSent;
  }

  /**
   * Check if a notification was already sent for this expiry period
   * Prevents duplicate notifications on the same day
   */
  private async hasExpiryNotification(
    gymId: number,
    userId: number,
    daysRemaining: number,
  ): Promise<boolean> {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const result = await this.tenantService.executeInTenant(gymId, async (client) => {
      const queryResult = await client.query(
        `SELECT id FROM notifications
         WHERE user_id = $1
           AND type = 'membership_expiry'
           AND created_at >= $2
           AND data->>'daysRemaining' = $3`,
        [userId, today, String(daysRemaining)],
      );
      return queryResult.rows.length > 0;
    });

    return result;
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

        const expiringSubscriptions = await this.prisma.saasGymSubscription.findMany({
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

          const alreadyNotified = await this.prisma.systemNotification.findFirst({
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
      this.logger.error(`Gym subscription expiry notification job failed: ${error.message}`);
    }
  }

  /**
   * Run every day at 2:00 AM to clean up old notifications
   * Deletes read notifications older than 30 days
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
          const deleted = await this.notificationsService.deleteOldNotifications(
            gym.id,
            30, // Delete notifications older than 30 days
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
        const systemDeleted = await this.notificationsService.deleteOldSystemNotifications(30);
        totalDeleted += systemDeleted;
        this.logger.log(`Deleted ${systemDeleted} old superadmin notifications.`);
      } catch (error) {
        this.logger.error(`Failed to clean up superadmin notifications: ${error.message}`);
      }

      this.logger.log(
        `Notification cleanup job completed. Deleted ${totalDeleted} old notifications total.`,
      );
    } catch (error) {
      this.logger.error(`Notification cleanup job failed: ${error.message}`);
    }
  }
}
