import { Injectable, NotFoundException } from '@nestjs/common';
import { TenantService } from '../tenant/tenant.service';
import {
  CreateGoalDto,
  UpdateGoalDto,
  UpdateProgressDto,
  UpdateStatusDto,
  GoalFiltersDto,
  CreateMilestoneDto,
  UpdateMilestoneDto,
} from './dto/member-goal.dto';
import { SqlValue } from '../common/types';

@Injectable()
export class MemberGoalsService {
  constructor(private readonly tenantService: TenantService) {}

  private formatGoal(row: Record<string, any>) {
    return {
      id: row.id,
      branchId: row.branch_id,
      userId: row.user_id,
      goalType: row.goal_type,
      title: row.title,
      description: row.description,
      targetValue: row.target_value,
      currentValue: row.current_value,
      unit: row.unit,
      status: row.status,
      startDate: row.start_date,
      targetDate: row.target_date,
      achievedAt: row.achieved_at,
      createdBy: row.created_by,
      createdByName: row.created_by_name,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }

  async findByUser(
    gymId: number,
    branchId: number | null = null,
    filters: GoalFiltersDto = {},
  ) {
    const page = filters.page || 1;
    const limit = filters.limit || 50;
    const skip = (page - 1) * limit;

    return this.tenantService.executeInTenant(gymId, async (client) => {
      const conditions: string[] = ['g.is_deleted = FALSE'];
      const values: SqlValue[] = [];
      let paramIndex = 1;

      if (filters.userId) {
        conditions.push(`g.user_id = $${paramIndex++}`);
        values.push(filters.userId);
      }

      if (branchId !== null) {
        conditions.push(`(g.branch_id = $${paramIndex++} OR g.branch_id IS NULL)`);
        values.push(branchId);
      }

      if (filters.status) {
        conditions.push(`g.status = $${paramIndex++}`);
        values.push(filters.status);
      }

      const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

      const countResult = await client.query(
        `SELECT COUNT(*) FROM member_goals g ${whereClause}`,
        values,
      );
      const total = parseInt(countResult.rows[0].count);

      const result = await client.query(
        `SELECT g.*, u.name as created_by_name
         FROM member_goals g
         LEFT JOIN users u ON u.id = g.created_by
         ${whereClause}
         ORDER BY g.created_at DESC
         LIMIT $${paramIndex++} OFFSET $${paramIndex++}`,
        [...values, limit, skip],
      );

      return {
        data: result.rows.map((row) => this.formatGoal(row)),
        total,
        page,
        limit,
      };
    });
  }

  async findMyGoals(
    gymId: number,
    userId: number,
    branchId: number | null = null,
    filters: GoalFiltersDto = {},
  ) {
    return this.findByUser(gymId, branchId, { ...filters, userId });
  }

  async findOne(id: number, gymId: number) {
    const goal = await this.tenantService.executeInTenant(gymId, async (client) => {
      const result = await client.query(
        `SELECT g.*, u.name as created_by_name
         FROM member_goals g
         LEFT JOIN users u ON u.id = g.created_by
         WHERE g.id = $1 AND g.is_deleted = FALSE`,
        [id],
      );
      return result.rows[0];
    });

    if (!goal) {
      throw new NotFoundException(`Goal #${id} not found`);
    }

    return this.formatGoal(goal);
  }

  async create(
    dto: CreateGoalDto,
    gymId: number,
    branchId: number | null,
    createdBy: number,
  ) {
    const goal = await this.tenantService.executeInTenant(gymId, async (client) => {
      const result = await client.query(
        `INSERT INTO member_goals (branch_id, user_id, goal_type, title, description, target_value, current_value, unit, status, start_date, target_date, created_by, created_at, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, NOW(), NOW())
         RETURNING *`,
        [
          branchId,
          dto.userId,
          dto.goalType,
          dto.title,
          dto.description || null,
          dto.targetValue || null,
          0,
          dto.unit || null,
          'active',
          dto.startDate || null,
          dto.targetDate || null,
          createdBy,
        ],
      );
      return result.rows[0];
    });

    return this.formatGoal(goal);
  }

  async update(id: number, gymId: number, dto: UpdateGoalDto) {
    await this.findOne(id, gymId);

    const updates: string[] = [];
    const values: SqlValue[] = [];
    let paramIndex = 1;

    if (dto.goalType !== undefined) {
      updates.push(`goal_type = $${paramIndex++}`);
      values.push(dto.goalType);
    }
    if (dto.title !== undefined) {
      updates.push(`title = $${paramIndex++}`);
      values.push(dto.title);
    }
    if (dto.description !== undefined) {
      updates.push(`description = $${paramIndex++}`);
      values.push(dto.description);
    }
    if (dto.targetValue !== undefined) {
      updates.push(`target_value = $${paramIndex++}`);
      values.push(dto.targetValue);
    }
    if (dto.currentValue !== undefined) {
      updates.push(`current_value = $${paramIndex++}`);
      values.push(dto.currentValue);
    }
    if (dto.unit !== undefined) {
      updates.push(`unit = $${paramIndex++}`);
      values.push(dto.unit);
    }
    if (dto.startDate !== undefined) {
      updates.push(`start_date = $${paramIndex++}`);
      values.push(dto.startDate);
    }
    if (dto.targetDate !== undefined) {
      updates.push(`target_date = $${paramIndex++}`);
      values.push(dto.targetDate);
    }

    if (updates.length === 0) return this.findOne(id, gymId);

    updates.push(`updated_at = NOW()`);
    values.push(id);

    await this.tenantService.executeInTenant(gymId, async (client) => {
      await client.query(
        `UPDATE member_goals SET ${updates.join(', ')} WHERE id = $${paramIndex}`,
        values,
      );
    });

    return this.findOne(id, gymId);
  }

  async updateProgress(id: number, gymId: number, dto: UpdateProgressDto) {
    const goal = await this.findOne(id, gymId);

    await this.tenantService.executeInTenant(gymId, async (client) => {
      const targetValue = goal.targetValue;
      const isAchieved = targetValue && targetValue > 0 && dto.currentValue >= targetValue;

      if (isAchieved) {
        await client.query(
          `UPDATE member_goals SET current_value = $1, status = 'achieved', achieved_at = NOW(), updated_at = NOW() WHERE id = $2`,
          [dto.currentValue, id],
        );
      } else {
        await client.query(
          `UPDATE member_goals SET current_value = $1, updated_at = NOW() WHERE id = $2`,
          [dto.currentValue, id],
        );
      }
    });

    return this.findOne(id, gymId);
  }

  async updateStatus(id: number, gymId: number, dto: UpdateStatusDto) {
    await this.findOne(id, gymId);

    await this.tenantService.executeInTenant(gymId, async (client) => {
      if (dto.status === 'achieved') {
        await client.query(
          `UPDATE member_goals SET status = $1, achieved_at = NOW(), updated_at = NOW() WHERE id = $2`,
          [dto.status, id],
        );
      } else {
        await client.query(
          `UPDATE member_goals SET status = $1, achieved_at = NULL, updated_at = NOW() WHERE id = $2`,
          [dto.status, id],
        );
      }
    });

    return this.findOne(id, gymId);
  }

  async softDelete(id: number, gymId: number, deletedBy: number) {
    await this.findOne(id, gymId);

    await this.tenantService.executeInTenant(gymId, async (client) => {
      await client.query(
        `UPDATE member_goals SET is_deleted = TRUE, deleted_at = NOW() WHERE id = $1`,
        [id],
      );
    });

    return { message: 'Goal deleted successfully' };
  }

  // --- Milestones ---

  private formatMilestone(row: Record<string, any>) {
    return {
      id: row.id,
      goalId: row.goal_id,
      title: row.title,
      targetValue: row.target_value,
      currentValue: row.current_value,
      unit: row.unit,
      orderIndex: row.order_index,
      isCompleted: row.is_completed,
      completedAt: row.completed_at,
      targetDate: row.target_date,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }

  async getMilestones(goalId: number, gymId: number) {
    await this.findOne(goalId, gymId);

    return this.tenantService.executeInTenant(gymId, async (client) => {
      const result = await client.query(
        `SELECT * FROM goal_milestones WHERE goal_id = $1 ORDER BY order_index, id`,
        [goalId],
      );
      return result.rows.map((row) => this.formatMilestone(row));
    });
  }

  async createMilestone(goalId: number, gymId: number, dto: CreateMilestoneDto) {
    await this.findOne(goalId, gymId);

    const milestone = await this.tenantService.executeInTenant(gymId, async (client) => {
      const result = await client.query(
        `INSERT INTO goal_milestones (goal_id, title, target_value, unit, order_index, target_date, created_at, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6, NOW(), NOW())
         RETURNING *`,
        [
          goalId,
          dto.title,
          dto.targetValue || null,
          dto.unit || null,
          dto.orderIndex || 0,
          dto.targetDate || null,
        ],
      );
      return result.rows[0];
    });

    return this.formatMilestone(milestone);
  }

  async updateMilestone(milestoneId: number, gymId: number, dto: UpdateMilestoneDto) {
    return this.tenantService.executeInTenant(gymId, async (client) => {
      // Verify milestone exists
      const existing = await client.query(
        `SELECT m.*, g.id as goal_id FROM goal_milestones m
         JOIN member_goals g ON g.id = m.goal_id AND g.is_deleted = FALSE
         WHERE m.id = $1`,
        [milestoneId],
      );
      if (existing.rows.length === 0) {
        throw new NotFoundException(`Milestone #${milestoneId} not found`);
      }

      const updates: string[] = [];
      const values: SqlValue[] = [];
      let paramIndex = 1;

      if (dto.title !== undefined) {
        updates.push(`title = $${paramIndex++}`);
        values.push(dto.title);
      }
      if (dto.targetValue !== undefined) {
        updates.push(`target_value = $${paramIndex++}`);
        values.push(dto.targetValue);
      }
      if (dto.currentValue !== undefined) {
        updates.push(`current_value = $${paramIndex++}`);
        values.push(dto.currentValue);
      }
      if (dto.unit !== undefined) {
        updates.push(`unit = $${paramIndex++}`);
        values.push(dto.unit);
      }
      if (dto.orderIndex !== undefined) {
        updates.push(`order_index = $${paramIndex++}`);
        values.push(dto.orderIndex);
      }
      if (dto.targetDate !== undefined) {
        updates.push(`target_date = $${paramIndex++}`);
        values.push(dto.targetDate);
      }
      if (dto.isCompleted !== undefined) {
        updates.push(`is_completed = $${paramIndex++}`);
        values.push(dto.isCompleted);
        if (dto.isCompleted) {
          updates.push(`completed_at = NOW()`);
        } else {
          updates.push(`completed_at = NULL`);
        }
      }

      if (updates.length === 0) {
        return this.formatMilestone(existing.rows[0]);
      }

      updates.push(`updated_at = NOW()`);
      values.push(milestoneId);

      const result = await client.query(
        `UPDATE goal_milestones SET ${updates.join(', ')} WHERE id = $${paramIndex} RETURNING *`,
        values,
      );

      return this.formatMilestone(result.rows[0]);
    });
  }

  async deleteMilestone(milestoneId: number, gymId: number) {
    await this.tenantService.executeInTenant(gymId, async (client) => {
      const existing = await client.query(
        `SELECT m.id FROM goal_milestones m
         JOIN member_goals g ON g.id = m.goal_id AND g.is_deleted = FALSE
         WHERE m.id = $1`,
        [milestoneId],
      );
      if (existing.rows.length === 0) {
        throw new NotFoundException(`Milestone #${milestoneId} not found`);
      }

      await client.query(`DELETE FROM goal_milestones WHERE id = $1`, [milestoneId]);
    });

    return { message: 'Milestone deleted successfully' };
  }
}
