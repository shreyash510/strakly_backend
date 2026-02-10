import { Injectable, Logger, Inject, forwardRef } from '@nestjs/common';
import { TenantService } from '../tenant/tenant.service';
import { PrismaService } from '../database/prisma.service';
import { NotificationsService } from './notifications.service';
import { NotificationsGateway } from './notifications.gateway';
import { NotificationType, NotificationPriority } from './notification-types';
import { SqlValue } from '../common/types';

export interface NotifyStaffPayload {
  type: NotificationType;
  title: string;
  message: string;
  actionUrl?: string;
  data?: Record<string, any>;
}

export interface NotifyStaffOptions {
  /** User ID to exclude from notifications (e.g., the actor who triggered the event) */
  excludeUserId?: number;
}

@Injectable()
export class NotificationHelperService {
  private readonly logger = new Logger(NotificationHelperService.name);

  constructor(
    private readonly tenantService: TenantService,
    private readonly prisma: PrismaService,
    @Inject(forwardRef(() => NotificationsService))
    private readonly notificationsService: NotificationsService,
    @Inject(forwardRef(() => NotificationsGateway))
    private readonly notificationsGateway: NotificationsGateway,
  ) {}

  /**
   * Notify branch_admin/manager users in tenant schema AND admin (gym owner) users.
   * Handles the FK constraint issue where admin users from public.users can't be
   * persisted in tenant notifications — falls back to WebSocket-only for admins.
   */
  async notifyStaff(
    gymId: number,
    branchId: number | null,
    payload: NotifyStaffPayload,
    options?: NotifyStaffOptions,
  ): Promise<void> {
    try {
      /* 1. Notify branch_admin and manager users in tenant schema */
      const staffIds = await this.tenantService.executeInTenant(
        gymId,
        async (client) => {
          let query = `SELECT id FROM users WHERE role IN ('branch_admin', 'manager') AND status = 'active'`;
          const params: SqlValue[] = [];

          if (branchId) {
            params.push(branchId);
            query += ` AND (branch_id = $1 OR id IN (SELECT user_id FROM user_branch_xref WHERE branch_id = $1 AND is_active = true))`;
          }

          const result = await client.query(query, params);
          return result.rows.map((r: Record<string, any>) => r.id as number);
        },
      );

      const filteredStaffIds = options?.excludeUserId
        ? staffIds.filter((id) => id !== options.excludeUserId)
        : staffIds;

      if (filteredStaffIds.length > 0) {
        await this.notificationsService.createBulk(
          {
            userIds: filteredStaffIds,
            type: payload.type,
            title: payload.title,
            message: payload.message,
            priority: NotificationPriority.NORMAL,
            branchId: branchId || null,
            actionUrl: payload.actionUrl,
            data: payload.data,
          },
          gymId,
        );
      }

      /* 2. Notify admin (gym owner) users from public.users */
      const gymAdmins = await this.prisma.userGymXref.findMany({
        where: { gymId, role: 'admin', isActive: true },
        select: { userId: true },
      });

      const filteredAdmins = options?.excludeUserId
        ? gymAdmins.filter((a) => a.userId !== options.excludeUserId)
        : gymAdmins;

      for (const admin of filteredAdmins) {
        try {
          await this.notificationsService.create(
            {
              userId: admin.userId,
              type: payload.type,
              title: payload.title,
              message: payload.message,
              priority: NotificationPriority.NORMAL,
              branchId: branchId || null,
              actionUrl: payload.actionUrl,
              data: payload.data,
            },
            gymId,
          );
        } catch {
          /* FK constraint fails since admin userId is from public.users.
             Send real-time WebSocket notification instead. */
          this.notificationsGateway.emitToUser(gymId, admin.userId, {
            id: 0,
            userId: admin.userId,
            branchId: branchId || null,
            type: payload.type,
            title: payload.title,
            message: payload.message,
            data: payload.data || null,
            isRead: false,
            readAt: null,
            actionUrl: payload.actionUrl || null,
            priority: NotificationPriority.NORMAL,
            expiresAt: null,
            createdAt: new Date(),
            createdBy: null,
          });
        }
      }
    } catch (error) {
      this.logger.error('Failed to send staff notifications', error);
    }
  }
}
