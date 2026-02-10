import { Injectable } from '@nestjs/common';
import { TenantService } from '../tenant/tenant.service';
import {
  CreateActivityLogDto,
  ActivityLogFiltersDto,
} from './dto/activity-log.dto';
import { SqlValue } from '../common/types';

export interface ActivityLogRecord {
  id: number;
  branchId: number | null;
  actorId: number;
  actorType: string;
  actorName: string | null;
  action: string;
  actionCategory: string | null;
  targetType: string | null;
  targetId: number | null;
  targetName: string | null;
  description: string | null;
  oldValues: Record<string, any> | null;
  newValues: Record<string, any> | null;
  metadata: Record<string, any> | null;
  ipAddress: string | null;
  userAgent: string | null;
  requestId: string | null;
  createdAt: Date;
}

@Injectable()
export class ActivityLogsService {
  constructor(private readonly tenantService: TenantService) {}

  private formatActivityLog(log: Record<string, any>): ActivityLogRecord {
    return {
      id: log.id,
      branchId: log.branch_id,
      actorId: log.actor_id,
      actorType: log.actor_type,
      actorName: log.actor_name,
      action: log.action,
      actionCategory: log.action_category,
      targetType: log.target_type,
      targetId: log.target_id,
      targetName: log.target_name,
      description: log.description,
      oldValues: log.old_values,
      newValues: log.new_values,
      metadata: log.metadata,
      ipAddress: log.ip_address,
      userAgent: log.user_agent,
      requestId: log.request_id,
      createdAt: log.created_at,
    };
  }

  /**
   * Find all activity logs with filters
   */
  async findAll(
    gymId: number,
    branchId: number | null = null,
    filters: ActivityLogFiltersDto = {},
  ) {
    const page = filters.page || 1;
    const limit = filters.limit || 20;
    const skip = (page - 1) * limit;

    const { logs, total } = await this.tenantService.executeInTenant(
      gymId,
      async (client) => {
        const conditions: string[] = [];
        const values: SqlValue[] = [];
        let paramIndex = 1;

        // Branch filtering
        if (branchId !== null) {
          conditions.push(`branch_id = $${paramIndex++}`);
          values.push(branchId);
        }

        if (filters.actorId) {
          conditions.push(`actor_id = $${paramIndex++}`);
          values.push(filters.actorId);
        }

        if (filters.actorType) {
          conditions.push(`actor_type = $${paramIndex++}`);
          values.push(filters.actorType);
        }

        if (filters.action) {
          conditions.push(`action = $${paramIndex++}`);
          values.push(filters.action);
        }

        if (filters.actionCategory) {
          conditions.push(`action_category = $${paramIndex++}`);
          values.push(filters.actionCategory);
        }

        if (filters.targetType) {
          conditions.push(`target_type = $${paramIndex++}`);
          values.push(filters.targetType);
        }

        if (filters.targetId) {
          conditions.push(`target_id = $${paramIndex++}`);
          values.push(filters.targetId);
        }

        if (filters.startDate) {
          conditions.push(`created_at >= $${paramIndex++}`);
          values.push(new Date(filters.startDate));
        }

        if (filters.endDate) {
          conditions.push(`created_at <= $${paramIndex++}`);
          values.push(new Date(filters.endDate));
        }

        const whereClause =
          conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

        const [logsResult, countResult] = await Promise.all([
          client.query(
            `SELECT * FROM activity_logs ${whereClause} ORDER BY created_at DESC LIMIT $${paramIndex++} OFFSET $${paramIndex}`,
            [...values, limit, skip],
          ),
          client.query(
            `SELECT COUNT(*) as count FROM activity_logs ${whereClause}`,
            values,
          ),
        ]);

        return {
          logs: logsResult.rows,
          total: parseInt(countResult.rows[0].count, 10),
        };
      },
    );

    return {
      data: logs.map((log: Record<string, any>) => this.formatActivityLog(log)),
      pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
    };
  }

  /**
   * Get activity logs for a specific target
   */
  async findByTarget(
    targetType: string,
    targetId: number,
    gymId: number,
    branchId: number | null = null,
  ): Promise<ActivityLogRecord[]> {
    const logs = await this.tenantService.executeInTenant(
      gymId,
      async (client) => {
        let query = `SELECT * FROM activity_logs WHERE target_type = $1 AND target_id = $2`;
        const values: SqlValue[] = [targetType, targetId];

        if (branchId !== null) {
          query += ` AND branch_id = $3`;
          values.push(branchId);
        }

        query += ` ORDER BY created_at DESC LIMIT 100`;

        const result = await client.query(query, values);
        return result.rows;
      },
    );

    return logs.map((log: Record<string, any>) => this.formatActivityLog(log));
  }

  /**
   * Get activity logs for a specific actor
   */
  async findByActor(
    actorId: number,
    actorType: string,
    gymId: number,
    limit = 50,
  ): Promise<ActivityLogRecord[]> {
    const logs = await this.tenantService.executeInTenant(
      gymId,
      async (client) => {
        const result = await client.query(
          `SELECT * FROM activity_logs WHERE actor_id = $1 AND actor_type = $2 ORDER BY created_at DESC LIMIT $3`,
          [actorId, actorType, limit],
        );
        return result.rows;
      },
    );

    return logs.map((log: Record<string, any>) => this.formatActivityLog(log));
  }

  /**
   * Log an activity
   */
  async log(
    dto: CreateActivityLogDto,
    gymId: number,
  ): Promise<ActivityLogRecord> {
    const log = await this.tenantService.executeInTenant(
      gymId,
      async (client) => {
        const result = await client.query(
          `INSERT INTO activity_logs (
          branch_id, actor_id, actor_type, actor_name,
          action, action_category, target_type, target_id, target_name,
          description, old_values, new_values, metadata,
          ip_address, user_agent, request_id, created_at
        ) VALUES (
          $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, NOW()
        ) RETURNING *`,
          [
            dto.branchId || null,
            dto.actorId,
            dto.actorType,
            dto.actorName || null,
            dto.action,
            dto.actionCategory || null,
            dto.targetType || null,
            dto.targetId || null,
            dto.targetName || null,
            dto.description || null,
            dto.oldValues ? JSON.stringify(dto.oldValues) : null,
            dto.newValues ? JSON.stringify(dto.newValues) : null,
            dto.metadata ? JSON.stringify(dto.metadata) : null,
            dto.ipAddress || null,
            dto.userAgent || null,
            dto.requestId || null,
          ],
        );
        return result.rows[0];
      },
    );

    return this.formatActivityLog(log);
  }

  /**
   * Log common actions with helper methods
   */
  async logUserCreated(
    gymId: number,
    branchId: number | null,
    actorId: number,
    actorType: string,
    actorName: string,
    userId: number,
    userName: string,
  ): Promise<ActivityLogRecord> {
    return this.log(
      {
        branchId: branchId || undefined,
        actorId,
        actorType,
        actorName,
        action: 'user.created',
        actionCategory: 'user',
        targetType: 'user',
        targetId: userId,
        targetName: userName,
        description: `Created user ${userName}`,
      },
      gymId,
    );
  }

  async logUserUpdated(
    gymId: number,
    branchId: number | null,
    actorId: number,
    actorType: string,
    actorName: string,
    userId: number,
    userName: string,
    changedFields: string[],
  ): Promise<ActivityLogRecord> {
    return this.log(
      {
        branchId: branchId || undefined,
        actorId,
        actorType,
        actorName,
        action: 'user.updated',
        actionCategory: 'user',
        targetType: 'user',
        targetId: userId,
        targetName: userName,
        description: `Updated user ${userName}: ${changedFields.join(', ')}`,
        metadata: { changedFields },
      },
      gymId,
    );
  }

  async logMembershipCreated(
    gymId: number,
    branchId: number | null,
    actorId: number,
    actorType: string,
    actorName: string,
    membershipId: number,
    userName: string,
    planName: string,
  ): Promise<ActivityLogRecord> {
    return this.log(
      {
        branchId: branchId || undefined,
        actorId,
        actorType,
        actorName,
        action: 'membership.created',
        actionCategory: 'membership',
        targetType: 'membership',
        targetId: membershipId,
        targetName: `${userName} - ${planName}`,
        description: `Created membership for ${userName} with plan ${planName}`,
      },
      gymId,
    );
  }

  async logAttendanceMarked(
    gymId: number,
    branchId: number | null,
    actorId: number,
    actorType: string,
    actorName: string,
    userId: number,
    userName: string,
  ): Promise<ActivityLogRecord> {
    return this.log(
      {
        branchId: branchId || undefined,
        actorId,
        actorType,
        actorName,
        action: 'attendance.checked_in',
        actionCategory: 'attendance',
        targetType: 'user',
        targetId: userId,
        targetName: userName,
        description: `Marked attendance for ${userName}`,
      },
      gymId,
    );
  }

  async logPaymentReceived(
    gymId: number,
    branchId: number | null,
    actorId: number,
    actorType: string,
    actorName: string,
    paymentId: number,
    amount: number,
    paymentType: string,
  ): Promise<ActivityLogRecord> {
    return this.log(
      {
        branchId: branchId || undefined,
        actorId,
        actorType,
        actorName,
        action: 'payment.received',
        actionCategory: 'payment',
        targetType: 'payment',
        targetId: paymentId,
        description: `Received ${paymentType} payment of ${amount}`,
        metadata: { amount, paymentType },
      },
      gymId,
    );
  }
}
