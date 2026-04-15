import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PrismaService } from '../database/prisma.service';
import { TenantService } from '../tenant/tenant.service';
import { NotificationsService } from './notifications.service';
import { NotificationType, NotificationPriority } from './notification-types';
import { CreateNotificationDto } from './dto';

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
  // @Cron(CronExpression.EVERY_DAY_AT_9AM) // DISABLED — heavy job, call manually if needed
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

    // Collect all notifications across all day-thresholds, then bulk insert once
    const allNotifications: CreateNotificationDto[] = [];

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
            `SELECT m.id, m.user_id, m.end_date, p.name as plan_name
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
          const planName = membership.plan_name || 'Membership';
          const endDate = new Date(membership.end_date);
          allNotifications.push({
            userId: membership.user_id,
            type: NotificationType.MEMBERSHIP_EXPIRY,
            title: 'Membership Expiring Soon',
            message: `Your ${planName} membership expires in ${days} day${days > 1 ? 's' : ''}. Renew now to continue your fitness journey!`,
            data: {
              entityType: 'membership',
              daysRemaining: days,
              endDate: endDate.toISOString(),
              membershipId: membership.id,
              userId: membership.user_id,
            },
            actionUrl: '/my-subscription',
            priority:
              days === 1
                ? NotificationPriority.URGENT
                : NotificationPriority.HIGH,
          });
        }
      }
    }

    // Single bulk insert for all collected notifications
    if (allNotifications.length > 0) {
      await this.notificationsService.createMany(allNotifications, gymId);
    }

    return allNotifications.length;
  }

  /**
   * Run every day at 11:30 PM to auto-renew subscriptions before midnight expiry check.
   * Finds subscriptions with autoRenew=true that are about to expire and extends them.
   */
  @Cron('0 30 23 * * *')
  async handleAutoRenewals() {
    this.logger.log('Running auto-renewal check...');

    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);

    const subscriptionsToRenew =
      await this.prisma.saasGymSubscription.findMany({
        where: {
          autoRenew: true,
          status: { in: ['active', 'trial'] },
          endDate: { lte: tomorrow },
        },
        include: { plan: true, gym: { select: { id: true, name: true } } },
      });

    for (const sub of subscriptionsToRenew) {
      try {
        const durationMonths = sub.plan?.durationMonths || 1;
        const newEndDate = new Date(sub.endDate);
        newEndDate.setMonth(newEndDate.getMonth() + durationMonths);

        await this.prisma.saasGymSubscription.update({
          where: { id: sub.id },
          data: {
            startDate: sub.endDate,
            endDate: newEndDate,
          },
        });

        this.logger.log(
          `Auto-renewed subscription ${sub.id} for gym "${sub.gym.name}" until ${newEndDate.toISOString()}`,
        );
      } catch (error) {
        this.logger.error(
          `Failed to auto-renew subscription ${sub.id}: ${error.message}`,
        );
      }
    }

    this.logger.log(
      `Auto-renewal check complete. Renewed ${subscriptionsToRenew.length} subscriptions.`,
    );
  }

  /**
   * Run every day at 10:00 AM to check for expiring gym subscriptions
   * Notifies superadmins about gyms whose subscriptions expire in 14, 7, 3, or 1 day(s)
   * Also notifies gym admins about subscriptions that have expired today
   */
  // @Cron(CronExpression.EVERY_DAY_AT_10AM) // DISABLED — heavy job, call manually if needed
  async handleGymSubscriptionExpiryNotifications() {
    this.logger.log('Starting gym subscription expiry notification job...');

    try {
      const daysToCheck = [14, 7, 3, 1];
      let totalNotificationsSent = 0;

      const today = new Date();
      today.setHours(0, 0, 0, 0);

      // Batch-fetch all gym_subscription_expiry notifications created today for dedup
      const alreadyNotifiedToday =
        await this.prisma.systemNotification.findMany({
          where: {
            type: 'gym_subscription_expiry',
            createdAt: { gte: today },
          },
          select: { data: true },
        });
      const alreadyNotifiedGymIds = new Set(
        alreadyNotifiedToday
          .map((n) => (n.data as any)?.gymId)
          .filter(Boolean),
      );

      // Collect all superadmin notification payloads
      const superadminPayloads: Array<{
        type: string;
        title: string;
        message: string;
        data: Record<string, any>;
        actionUrl: string;
        priority: string;
      }> = [];

      for (const days of daysToCheck) {
        const targetDate = new Date();
        targetDate.setDate(targetDate.getDate() + days);

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
          if (!alreadyNotifiedGymIds.has(subscription.gymId)) {
            superadminPayloads.push({
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
            // Prevent duplicate for same gym across different day-thresholds
            alreadyNotifiedGymIds.add(subscription.gymId);
          }
        }
      }

      // Bulk-notify superadmins: fetch once, build all rows, single createMany
      if (superadminPayloads.length > 0) {
        const superadmins = await this.prisma.systemUser.findMany({
          where: { isActive: true },
          select: { id: true },
        });

        const defaultExpiry = new Date();
        defaultExpiry.setDate(defaultExpiry.getDate() + 15);

        const rows = superadminPayloads.flatMap((payload) =>
          superadmins.map((admin) => ({
            userId: admin.id,
            type: payload.type,
            title: payload.title,
            message: payload.message,
            data: payload.data || undefined,
            actionUrl: payload.actionUrl || null,
            priority: payload.priority || 'normal',
            expiresAt: defaultExpiry,
          })),
        );

        await this.prisma.systemNotification.createMany({ data: rows });
        totalNotificationsSent += superadminPayloads.length;
      }

      // Also notify gym admins about subscriptions that expired today
      const expiredNotificationsSent =
        await this.notifyGymAdminsAboutExpiredSubscriptions();
      totalNotificationsSent += expiredNotificationsSent;

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
   * Find subscriptions that expired today (or yesterday) and notify the gym's admin users
   */
  private async notifyGymAdminsAboutExpiredSubscriptions(): Promise<number> {
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    yesterday.setHours(0, 0, 0, 0);

    const now = new Date();
    const endOfToday = new Date(now);
    endOfToday.setHours(23, 59, 59, 999);

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    // Find subscriptions that expired between yesterday start and now
    const expiredSubscriptions =
      await this.prisma.saasGymSubscription.findMany({
        where: {
          status: 'expired',
          endDate: {
            gte: yesterday,
            lte: endOfToday,
          },
        },
        include: {
          gym: true,
          plan: true,
        },
      });

    if (expiredSubscriptions.length === 0) {
      return 0;
    }

    // Batch-fetch all admin xrefs for all affected gyms in one query
    const gymIds = expiredSubscriptions.map((s) => s.gymId);
    const allAdminXrefs = await this.prisma.userGymXref.findMany({
      where: {
        gymId: { in: gymIds },
        role: 'admin',
        isActive: true,
      },
      select: { userId: true, gymId: true },
    });

    // Batch-fetch all subscription_expired_gym_admin notifications created today for dedup
    const alreadyNotifiedToday =
      await this.prisma.systemNotification.findMany({
        where: {
          type: 'subscription_expired_gym_admin',
          createdAt: { gte: today },
        },
        select: { userId: true, data: true },
      });
    // Build a Set of "userId:gymId" keys for fast dedup lookup
    const notifiedKeys = new Set(
      alreadyNotifiedToday.map(
        (n) => `${n.userId}:${(n.data as any)?.gymId}`,
      ),
    );

    // Group admin xrefs by gymId for quick lookup
    const adminsByGym = new Map<number, number[]>();
    for (const xref of allAdminXrefs) {
      const list = adminsByGym.get(xref.gymId) || [];
      list.push(xref.userId);
      adminsByGym.set(xref.gymId, list);
    }

    // Collect all notification rows to insert
    const rows: Array<{
      userId: number;
      type: string;
      title: string;
      message: string;
      data: any;
      actionUrl: string;
      priority: string;
    }> = [];

    for (const subscription of expiredSubscriptions) {
      const admins = adminsByGym.get(subscription.gymId) || [];
      for (const userId of admins) {
        const key = `${userId}:${subscription.gymId}`;
        if (!notifiedKeys.has(key)) {
          rows.push({
            userId,
            type: 'subscription_expired_gym_admin',
            title: 'Subscription Expired',
            message: `Your gym "${subscription.gym.name}" subscription (${subscription.plan.name}) has expired. Please renew to continue using the platform.`,
            data: {
              gymId: subscription.gymId,
              gymName: subscription.gym.name,
              planName: subscription.plan.name,
              endDate: subscription.endDate.toISOString(),
            },
            actionUrl: `/gym/${subscription.gymId}/subscription`,
            priority: 'urgent',
          });
          notifiedKeys.add(key);
        }
      }
    }

    // Single bulk insert
    if (rows.length > 0) {
      await this.prisma.systemNotification.createMany({ data: rows });
      this.logger.log(
        `Bulk-notified ${rows.length} gym admin(s) about expired subscriptions.`,
      );
    }

    return rows.length;
  }

  /**
   * Run every day at 2:00 AM to clean up old notifications
   * Deletes all notifications older than 15 days
   */
  // @Cron(CronExpression.EVERY_DAY_AT_2AM) // DISABLED — heavy job, call manually if needed
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
