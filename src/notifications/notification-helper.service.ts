import { Injectable, Logger, Inject, forwardRef } from '@nestjs/common';
import { TenantService } from '../tenant/tenant.service';
import { PrismaService } from '../database/prisma.service';
import { NotificationsService } from './notifications.service';
import { NotificationType, NotificationPriority } from './notification-types';
import { SqlValue } from '../common/types';
import { ROLES } from '../common/constants';

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
  ) {}

  /**
   * Notify branch_admin/manager users in tenant schema AND admin (gym owner) users.
   * Admin users from public.users now have persistent notifications since the FK
   * constraint on notifications.user_id was removed.
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

      /* 2. Collect admin (gym owner) user IDs from public.users */
      const gymAdmins = await this.prisma.userGymXref.findMany({
        where: { gymId, role: ROLES.ADMIN, isActive: true },
        select: { userId: true },
      });

      const filteredAdminIds = (options?.excludeUserId
        ? gymAdmins.filter((a) => a.userId !== options.excludeUserId)
        : gymAdmins
      ).map((a) => a.userId);

      /* 3. Bulk-create notifications for all recipients (staff + admins) */
      const allUserIds = [...filteredStaffIds, ...filteredAdminIds];

      if (allUserIds.length > 0) {
        await this.notificationsService.createBulk(
          {
            userIds: allUserIds,
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
    } catch (error) {
      this.logger.error('Failed to send staff notifications', error);
    }
  }
}
