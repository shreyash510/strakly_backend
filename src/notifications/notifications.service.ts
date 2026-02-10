import { Injectable, Logger, Inject, forwardRef } from '@nestjs/common';
import { TenantService } from '../tenant/tenant.service';
import { PrismaService } from '../database/prisma.service';
import { SqlValue } from '../common/types';
import {
  CreateNotificationDto,
  CreateBulkNotificationDto,
  NotificationQueryDto,
} from './dto';
import {
  Notification,
  NotificationType,
  NotificationPriority,
  NotificationData,
} from './notification-types';
import { NotificationsGateway } from './notifications.gateway';

// Superadmin notification types
export enum SystemNotificationType {
  NEW_GYM = 'new_gym',
  GYM_SUBSCRIPTION_EXPIRY = 'gym_subscription_expiry',
  SUPPORT_TICKET = 'support_ticket',
  SYSTEM_ALERT = 'system_alert',
  NEW_CONTACT_REQUEST = 'new_contact_request',
}

@Injectable()
export class NotificationsService {
  private readonly logger = new Logger(NotificationsService.name);

  constructor(
    private readonly tenantService: TenantService,
    private readonly prisma: PrismaService,
    @Inject(forwardRef(() => NotificationsGateway))
    private readonly gateway: NotificationsGateway,
  ) {}

  /**
   * Create a single notification
   */
  async create(
    dto: CreateNotificationDto,
    gymId: number,
  ): Promise<Notification> {
    const notification = await this.tenantService.executeInTenant(
      gymId,
      async (client) => {
        const result = await client.query(
          `
        INSERT INTO notifications
        (branch_id, user_id, type, title, message, data, action_url, priority, expires_at, created_by)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
        RETURNING *
      `,
          [
            dto.branchId || null,
            dto.userId,
            dto.type,
            dto.title,
            dto.message,
            dto.data ? JSON.stringify(dto.data) : null,
            dto.actionUrl || null,
            dto.priority || NotificationPriority.NORMAL,
            dto.expiresAt || null,
            dto.createdBy || null,
          ],
        );

        return this.mapToNotification(result.rows[0]);
      },
    );

    // Emit real-time notification via WebSocket
    try {
      this.gateway.emitToUser(gymId, dto.userId, notification);
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : String(error);
      this.logger.warn(`Failed to emit real-time notification: ${msg}`);
    }

    return notification;
  }

  /**
   * Create notifications for multiple users
   */
  async createBulk(
    dto: CreateBulkNotificationDto,
    gymId: number,
  ): Promise<number> {
    if (!dto.userIds || dto.userIds.length === 0) {
      return 0;
    }

    const notifications = await this.tenantService.executeInTenant(
      gymId,
      async (client) => {
        const values: SqlValue[] = [];
        const placeholders: string[] = [];
        let paramIndex = 1;

        for (const userId of dto.userIds) {
          placeholders.push(
            `($${paramIndex++}, $${paramIndex++}, $${paramIndex++}, $${paramIndex++}, $${paramIndex++}, $${paramIndex++}, $${paramIndex++}, $${paramIndex++}, $${paramIndex++}, $${paramIndex++})`,
          );
          values.push(
            dto.branchId || null,
            userId,
            dto.type,
            dto.title,
            dto.message,
            dto.data ? JSON.stringify(dto.data) : null,
            dto.actionUrl || null,
            dto.priority || NotificationPriority.NORMAL,
            dto.expiresAt || null,
            dto.createdBy || null,
          );
        }

        const result = await client.query(
          `
        INSERT INTO notifications
        (branch_id, user_id, type, title, message, data, action_url, priority, expires_at, created_by)
        VALUES ${placeholders.join(', ')}
        RETURNING *
      `,
          values,
        );

        return result.rows.map((row: Record<string, any>) => this.mapToNotification(row));
      },
    );

    // Emit real-time notifications via WebSocket
    try {
      notifications.forEach((notification: Notification) => {
        this.gateway.emitToUser(gymId, notification.userId, notification);
      });
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : String(error);
      this.logger.warn(
        `Failed to emit bulk real-time notifications: ${msg}`,
      );
    }

    return notifications.length;
  }

  /**
   * Get notifications for a user with pagination
   */
  async findAll(
    userId: number,
    gymId: number,
    branchId: number | null,
    query: NotificationQueryDto,
  ): Promise<{ data: Notification[]; pagination: Record<string, number> }> {
    return this.tenantService.executeInTenant(gymId, async (client) => {
      const page = query.page || 1;
      const limit = Math.min(query.limit || 20, 50);
      const offset = (page - 1) * limit;

      const conditions: string[] = ['user_id = $1'];
      const params: SqlValue[] = [userId];
      let paramIndex = 2;

      // Branch filter - if user has branch restriction
      if (branchId !== null) {
        conditions.push(`(branch_id IS NULL OR branch_id = $${paramIndex})`);
        params.push(branchId);
        paramIndex++;
      }

      // Type filter
      if (query.type) {
        conditions.push(`type = $${paramIndex}`);
        params.push(query.type);
        paramIndex++;
      }

      // Unread only filter
      if (query.unreadOnly) {
        conditions.push('is_read = FALSE');
      }

      // Exclude expired notifications
      conditions.push('(expires_at IS NULL OR expires_at > NOW())');

      const whereClause = conditions.join(' AND ');

      // Get total count and notifications in parallel
      const [countResult, notificationsResult] = await Promise.all([
        client.query(
          `SELECT COUNT(*) FROM notifications WHERE ${whereClause}`,
          params,
        ),
        client.query(
          `
          SELECT * FROM notifications
          WHERE ${whereClause}
          ORDER BY created_at DESC
          LIMIT $${paramIndex} OFFSET $${paramIndex + 1}
        `,
          [...params, limit, offset],
        ),
      ]);

      const total = parseInt(countResult.rows[0].count, 10);
      const notifications = notificationsResult.rows.map((row) =>
        this.mapToNotification(row),
      );

      return {
        data: notifications,
        pagination: {
          page,
          limit,
          total,
          totalPages: Math.ceil(total / limit),
        },
      };
    });
  }

  /**
   * Get unread notification count for a user
   */
  async getUnreadCount(
    userId: number,
    gymId: number,
    branchId: number | null,
  ): Promise<number> {
    return this.tenantService.executeInTenant(gymId, async (client) => {
      let query = `
        SELECT COUNT(*) FROM notifications
        WHERE user_id = $1 AND is_read = FALSE
        AND (expires_at IS NULL OR expires_at > NOW())
      `;
      const params: SqlValue[] = [userId];

      if (branchId !== null) {
        query += ` AND (branch_id IS NULL OR branch_id = $2)`;
        params.push(branchId);
      }

      const result = await client.query(query, params);
      return parseInt(result.rows[0].count, 10);
    });
  }

  /**
   * Mark a notification as read
   */
  async markAsRead(
    id: number,
    userId: number,
    gymId: number,
  ): Promise<Notification | null> {
    return this.tenantService.executeInTenant(gymId, async (client) => {
      const result = await client.query(
        `
        UPDATE notifications
        SET is_read = TRUE, read_at = NOW()
        WHERE id = $1 AND user_id = $2
        RETURNING *
      `,
        [id, userId],
      );

      if (result.rows.length === 0) {
        return null;
      }

      return this.mapToNotification(result.rows[0]);
    });
  }

  /**
   * Mark all notifications as read for a user
   */
  async markAllAsRead(
    userId: number,
    gymId: number,
    branchId: number | null,
  ): Promise<number> {
    return this.tenantService.executeInTenant(gymId, async (client) => {
      let query = `
        UPDATE notifications
        SET is_read = TRUE, read_at = NOW()
        WHERE user_id = $1 AND is_read = FALSE
      `;
      const params: SqlValue[] = [userId];

      if (branchId !== null) {
        query += ` AND (branch_id IS NULL OR branch_id = $2)`;
        params.push(branchId);
      }

      const result = await client.query(query, params);
      return result.rowCount || 0;
    });
  }

  /**
   * Delete a notification
   */
  async delete(id: number, userId: number, gymId: number): Promise<boolean> {
    return this.tenantService.executeInTenant(gymId, async (client) => {
      const result = await client.query(
        `DELETE FROM notifications WHERE id = $1 AND user_id = $2`,
        [id, userId],
      );

      return (result.rowCount || 0) > 0;
    });
  }

  /**
   * Delete old notifications (cleanup job)
   */
  async deleteOldNotifications(
    gymId: number,
    daysOld: number,
  ): Promise<number> {
    return this.tenantService.executeInTenant(gymId, async (client) => {
      const result = await client.query(
        `
        DELETE FROM notifications
        WHERE created_at < NOW() - INTERVAL '${daysOld} days'
        AND is_read = TRUE
      `,
        [],
      );

      return result.rowCount || 0;
    });
  }

  /**
   * Trigger notification for membership expiry
   */
  async notifyMembershipExpiry(
    userId: number,
    gymId: number,
    branchId: number | null,
    membershipData: { planName: string; endDate: Date; daysRemaining: number; membershipId?: number },
  ): Promise<void> {
    try {
      await this.create(
        {
          userId,
          branchId,
          type: NotificationType.MEMBERSHIP_EXPIRY,
          title: 'Membership Expiring Soon',
          message: `Your ${membershipData.planName} membership expires in ${membershipData.daysRemaining} day${membershipData.daysRemaining > 1 ? 's' : ''}. Renew now to continue your fitness journey!`,
          data: {
            entityType: 'membership',
            daysRemaining: membershipData.daysRemaining,
            endDate: membershipData.endDate.toISOString(),
            membershipId: membershipData.membershipId,
            userId,
          },
          actionUrl: '/my-subscription',
          priority:
            membershipData.daysRemaining === 1
              ? NotificationPriority.URGENT
              : NotificationPriority.HIGH,
        },
        gymId,
      );
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : String(error);
      this.logger.error(
        `Failed to create membership expiry notification: ${msg}`,
      );
    }
  }

  /**
   * Trigger notification for membership renewed
   */
  async notifyMembershipRenewed(
    userId: number,
    gymId: number,
    branchId: number | null,
    membershipData: { planName: string; endDate: Date; membershipId?: number },
  ): Promise<void> {
    try {
      await this.create(
        {
          userId,
          branchId,
          type: NotificationType.MEMBERSHIP_RENEWED,
          title: 'Membership Activated',
          message: `Your ${membershipData.planName} membership is now active until ${membershipData.endDate.toLocaleDateString()}.`,
          data: {
            entityType: 'membership',
            endDate: membershipData.endDate.toISOString(),
            membershipId: membershipData.membershipId,
            userId,
          },
          actionUrl: '/my-subscription',
          priority: NotificationPriority.NORMAL,
        },
        gymId,
      );
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : String(error);
      this.logger.error(
        `Failed to create membership renewed notification: ${msg}`,
      );
    }
  }

  /**
   * Trigger notification for trainer assignment
   */
  async notifyTrainerAssigned(
    clientUserId: number,
    gymId: number,
    branchId: number | null,
    trainerData: { trainerId: number; trainerName: string },
  ): Promise<void> {
    try {
      await this.create(
        {
          userId: clientUserId,
          branchId,
          type: NotificationType.TRAINER_ASSIGNED,
          title: 'Trainer Assigned',
          message: `${trainerData.trainerName} has been assigned as your trainer.`,
          data: {
            entityType: 'trainer',
            entityId: trainerData.trainerId,
          },
          actionUrl: '/my-trainer',
          priority: NotificationPriority.NORMAL,
        },
        gymId,
      );
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : String(error);
      this.logger.error(
        `Failed to create trainer assigned notification: ${msg}`,
      );
    }
  }

  /**
   * Trigger notification for trainer unassignment
   */
  async notifyTrainerUnassigned(
    clientUserId: number,
    gymId: number,
    branchId: number | null,
    trainerData: { trainerId: number; trainerName: string },
  ): Promise<void> {
    try {
      await this.create(
        {
          userId: clientUserId,
          branchId,
          type: NotificationType.TRAINER_UNASSIGNED,
          title: 'Trainer Changed',
          message: `${trainerData.trainerName} is no longer your assigned trainer.`,
          data: {
            entityType: 'trainer',
            entityId: trainerData.trainerId,
          },
          priority: NotificationPriority.NORMAL,
        },
        gymId,
      );
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : String(error);
      this.logger.error(
        `Failed to create trainer unassigned notification: ${msg}`,
      );
    }
  }

  /**
   * Trigger notification for new announcement
   */
  async notifyNewAnnouncement(
    userIds: number[],
    gymId: number,
    branchId: number | null,
    announcementData: {
      announcementId: number;
      title: string;
      priority?: string;
    },
  ): Promise<void> {
    try {
      await this.createBulk(
        {
          userIds,
          branchId,
          type: NotificationType.NEW_ANNOUNCEMENT,
          title: 'New Announcement',
          message: announcementData.title,
          data: {
            entityType: 'announcement',
            entityId: announcementData.announcementId,
          },
          actionUrl: `/announcements/${announcementData.announcementId}`,
          priority:
            announcementData.priority === 'urgent'
              ? NotificationPriority.URGENT
              : NotificationPriority.NORMAL,
        },
        gymId,
      );
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : String(error);
      this.logger.error(
        `Failed to create announcement notification: ${msg}`,
      );
    }
  }

  // ============================================
  // SUPERADMIN NOTIFICATIONS (main schema)
  // ============================================

  /**
   * Create a notification for a superadmin
   */
  async createSystemNotification(data: {
    userId: number;
    type: string;
    title: string;
    message: string;
    data?: Record<string, any>;
    actionUrl?: string;
    priority?: string;
  }): Promise<Record<string, any>> {
    try {
      const notification = await this.prisma.systemNotification.create({
        data: {
          userId: data.userId,
          type: data.type,
          title: data.title,
          message: data.message,
          data: data.data || undefined,
          actionUrl: data.actionUrl || null,
          priority: data.priority || 'normal',
        },
      });

      // Emit real-time notification to superadmin
      try {
        this.gateway.emitToSuperadmin(data.userId, {
          id: notification.id,
          branchId: null,
          userId: notification.userId,
          type: notification.type as NotificationType,
          title: notification.title,
          message: notification.message,
          data: notification.data as NotificationData | null,
          isRead: notification.isRead,
          readAt: notification.readAt,
          actionUrl: notification.actionUrl,
          priority: notification.priority as NotificationPriority,
          expiresAt: null,
          createdAt: notification.createdAt,
          createdBy: null,
        });
      } catch (error: unknown) {
        const msg = error instanceof Error ? error.message : String(error);
        this.logger.warn(
          `Failed to emit real-time system notification: ${msg}`,
        );
      }

      return notification;
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : String(error);
      this.logger.error(
        `Failed to create system notification: ${msg}`,
      );
      throw error;
    }
  }

  /**
   * Create notifications for all superadmins
   */
  async notifyAllSuperadmins(data: {
    type: string;
    title: string;
    message: string;
    data?: Record<string, any>;
    actionUrl?: string;
    priority?: string;
  }): Promise<number> {
    try {
      const superadmins = await this.prisma.systemUser.findMany({
        where: { isActive: true },
        select: { id: true },
      });

      const notifications = superadmins.map((admin) => ({
        userId: admin.id,
        type: data.type,
        title: data.title,
        message: data.message,
        data: data.data || undefined,
        actionUrl: data.actionUrl || null,
        priority: data.priority || 'normal',
      }));

      const result = await this.prisma.systemNotification.createMany({
        data: notifications,
      });

      // Emit real-time notifications to all superadmins
      try {
        this.gateway.emitToAllSuperadmins({
          id: 0,
          branchId: null,
          userId: 0,
          type: data.type as NotificationType,
          title: data.title,
          message: data.message,
          data: (data.data ?? null) as NotificationData | null,
          actionUrl: data.actionUrl ?? null,
          priority: (data.priority || 'normal') as NotificationPriority,
          isRead: false,
          readAt: null,
          expiresAt: null,
          createdAt: new Date(),
          createdBy: null,
        });
      } catch (error: unknown) {
        const msg = error instanceof Error ? error.message : String(error);
        this.logger.warn(
          `Failed to emit real-time notifications to superadmins: ${msg}`,
        );
      }

      return result.count;
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : String(error);
      this.logger.error(`Failed to notify superadmins: ${msg}`);
      return 0;
    }
  }

  /**
   * Get notifications for a superadmin with pagination
   */
  async findAllSystemNotifications(
    userId: number,
    query: NotificationQueryDto,
  ): Promise<{ data: Record<string, any>[]; pagination: Record<string, number> }> {
    const page = query.page || 1;
    const limit = Math.min(query.limit || 20, 50);
    const skip = (page - 1) * limit;

    const where: Record<string, any> = {
      userId,
      ...(query.unreadOnly && { isRead: false }),
      ...(query.type && { type: query.type }),
      OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }],
    };

    const [notifications, total] = await Promise.all([
      this.prisma.systemNotification.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
      }),
      this.prisma.systemNotification.count({ where }),
    ]);

    return {
      data: notifications.map((n) => ({
        id: n.id,
        userId: n.userId,
        type: n.type,
        title: n.title,
        message: n.message,
        data: n.data,
        isRead: n.isRead,
        readAt: n.readAt,
        actionUrl: n.actionUrl,
        priority: n.priority,
        createdAt: n.createdAt,
      })),
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  /**
   * Get unread count for a superadmin
   */
  async getSystemUnreadCount(userId: number): Promise<number> {
    return this.prisma.systemNotification.count({
      where: {
        userId,
        isRead: false,
        OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }],
      },
    });
  }

  /**
   * Mark a system notification as read
   */
  async markSystemNotificationAsRead(id: number, userId: number): Promise<Record<string, any> | null> {
    const notification = await this.prisma.systemNotification.updateMany({
      where: { id, userId },
      data: { isRead: true, readAt: new Date() },
    });

    if (notification.count === 0) {
      return null;
    }

    return this.prisma.systemNotification.findUnique({ where: { id } });
  }

  /**
   * Mark all system notifications as read for a superadmin
   */
  async markAllSystemNotificationsAsRead(userId: number): Promise<number> {
    const result = await this.prisma.systemNotification.updateMany({
      where: { userId, isRead: false },
      data: { isRead: true, readAt: new Date() },
    });
    return result.count;
  }

  /**
   * Delete a system notification
   */
  async deleteSystemNotification(id: number, userId: number): Promise<boolean> {
    const result = await this.prisma.systemNotification.deleteMany({
      where: { id, userId },
    });
    return result.count > 0;
  }

  /**
   * Delete old system notifications (cleanup)
   */
  async deleteOldSystemNotifications(daysOld: number): Promise<number> {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - daysOld);

    const result = await this.prisma.systemNotification.deleteMany({
      where: {
        createdAt: { lt: cutoffDate },
        isRead: true,
      },
    });
    return result.count;
  }

  /**
   * Notify superadmins about new gym registration
   */
  async notifyNewGymRegistration(gymData: {
    gymId: number;
    gymName: string;
    ownerName: string;
  }): Promise<void> {
    await this.notifyAllSuperadmins({
      type: SystemNotificationType.NEW_GYM,
      title: 'New Gym Registered',
      message: `${gymData.gymName} has been registered by ${gymData.ownerName}.`,
      data: { gymId: gymData.gymId },
      actionUrl: `/superadmin/gyms/${gymData.gymId}`,
      priority: 'normal',
    });
  }

  /**
   * Notify superadmins about new support ticket
   */
  async notifySupportTicketCreated(ticketData: {
    ticketId: number;
    ticketNumber: string;
    subject: string;
    priority: string;
  }): Promise<void> {
    await this.notifyAllSuperadmins({
      type: SystemNotificationType.SUPPORT_TICKET,
      title: 'New Support Ticket',
      message: `Ticket #${ticketData.ticketNumber}: ${ticketData.subject}`,
      data: { ticketId: ticketData.ticketId },
      actionUrl: `/superadmin/support/${ticketData.ticketId}`,
      priority: ticketData.priority === 'high' ? 'high' : 'normal',
    });
  }

  /**
   * Notify superadmins about new contact request
   */
  async notifyNewContactRequest(requestData: {
    requestId: number;
    requestNumber: string;
    name: string;
  }): Promise<void> {
    await this.notifyAllSuperadmins({
      type: SystemNotificationType.NEW_CONTACT_REQUEST,
      title: 'New Contact Request',
      message: `New inquiry from ${requestData.name}`,
      data: { requestId: requestData.requestId },
      actionUrl: `/superadmin/contact-requests/${requestData.requestId}`,
      priority: 'normal',
    });
  }

  /**
   * Notify user when their support ticket is resolved
   */
  async notifySupportTicketResolved(
    userId: number,
    gymId: number,
    ticketData: {
      ticketId: number;
      ticketNumber: string;
      subject: string;
    },
  ): Promise<void> {
    try {
      await this.create(
        {
          userId,
          branchId: null,
          type: NotificationType.SUPPORT_TICKET_RESOLVED,
          title: 'Support Ticket Resolved',
          message: `Your support ticket #${ticketData.ticketNumber} has been resolved.`,
          data: {
            entityType: 'support_ticket',
            entityId: ticketData.ticketId,
          },
          actionUrl: '/support',
          priority: NotificationPriority.NORMAL,
        },
        gymId,
      );
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : String(error);
      this.logger.error(
        `Failed to create support ticket resolved notification: ${msg}`,
      );
    }
  }

  /**
   * Map database row to Notification interface
   */
  private mapToNotification(row: Record<string, any>): Notification {
    return {
      id: row.id,
      branchId: row.branch_id,
      userId: row.user_id,
      type: row.type as NotificationType,
      title: row.title,
      message: row.message,
      data: row.data,
      isRead: row.is_read,
      readAt: row.read_at,
      actionUrl: row.action_url,
      priority: row.priority as NotificationPriority,
      expiresAt: row.expires_at,
      createdAt: row.created_at,
      createdBy: row.created_by,
    };
  }
}
