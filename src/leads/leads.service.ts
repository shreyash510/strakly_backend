import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { TenantService } from '../tenant/tenant.service';
import {
  CreateLeadDto,
  UpdateLeadDto,
  UpdateStageDto,
  CreateLeadActivityDto,
  LeadFiltersDto,
  LeadStatsFiltersDto,
} from './dto/lead.dto';
import { SqlValue } from '../common/types';

@Injectable()
export class LeadsService {
  constructor(private readonly tenantService: TenantService) {}

  private formatLead(row: Record<string, any>) {
    return {
      id: row.id,
      branchId: row.branch_id,
      name: row.name,
      email: row.email,
      phone: row.phone,
      leadSource: row.lead_source,
      pipelineStage: row.pipeline_stage,
      assignedTo: row.assigned_to,
      assignedToName: row.assigned_to_name,
      score: row.score,
      inquiryDate: row.inquiry_date,
      expectedCloseDate: row.expected_close_date,
      dealValue: row.deal_value,
      notes: row.notes,
      winLossReason: row.win_loss_reason,
      convertedUserId: row.converted_user_id,
      stageEnteredAt: row.stage_entered_at,
      isDeleted: row.is_deleted,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }

  private formatActivity(row: Record<string, any>) {
    return {
      id: row.id,
      leadId: row.lead_id,
      type: row.type,
      notes: row.notes,
      scheduledAt: row.scheduled_at,
      completedAt: row.completed_at,
      performedBy: row.performed_by,
      performedByName: row.performed_by_name,
      createdAt: row.created_at,
    };
  }

  async findAll(
    gymId: number,
    branchId: number | null = null,
    filters: LeadFiltersDto = {},
  ) {
    const page = filters.page || 1;
    const limit = filters.limit || 15;
    const skip = (page - 1) * limit;

    return this.tenantService.executeInTenant(gymId, async (client) => {
      const conditions: string[] = ['l.is_deleted = FALSE'];
      const values: SqlValue[] = [];
      let paramIndex = 1;

      if (branchId !== null) {
        conditions.push(`l.branch_id = $${paramIndex++}`);
        values.push(branchId);
      }

      if (filters.pipelineStage) {
        conditions.push(`l.pipeline_stage = $${paramIndex++}`);
        values.push(filters.pipelineStage);
      }

      if (filters.score) {
        conditions.push(`l.score = $${paramIndex++}`);
        values.push(filters.score);
      }

      if (filters.assignedTo) {
        conditions.push(`l.assigned_to = $${paramIndex++}`);
        values.push(filters.assignedTo);
      }

      if (filters.search) {
        conditions.push(
          `(l.name ILIKE $${paramIndex} OR l.email ILIKE $${paramIndex} OR l.phone ILIKE $${paramIndex})`,
        );
        values.push(`%${filters.search}%`);
        paramIndex++;
      }

      const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

      const countResult = await client.query(
        `SELECT COUNT(*) FROM leads l ${whereClause}`,
        values,
      );
      const total = parseInt(countResult.rows[0].count);

      const result = await client.query(
        `SELECT l.*, u.name as assigned_to_name
         FROM leads l
         LEFT JOIN users u ON u.id = l.assigned_to
         ${whereClause}
         ORDER BY l.updated_at DESC
         LIMIT $${paramIndex++} OFFSET $${paramIndex++}`,
        [...values, limit, skip],
      );

      return {
        data: result.rows.map((row) => this.formatLead(row)),
        total,
        page,
        limit,
      };
    });
  }

  async findOne(id: number, gymId: number) {
    const lead = await this.tenantService.executeInTenant(gymId, async (client) => {
      const result = await client.query(
        `SELECT l.*, u.name as assigned_to_name
         FROM leads l
         LEFT JOIN users u ON u.id = l.assigned_to
         WHERE l.id = $1 AND l.is_deleted = FALSE`,
        [id],
      );
      return result.rows[0];
    });

    if (!lead) {
      throw new NotFoundException(`Lead #${id} not found`);
    }

    return this.formatLead(lead);
  }

  async create(gymId: number, branchId: number | null, dto: CreateLeadDto, createdBy?: number) {
    const lead = await this.tenantService.executeInTenant(gymId, async (client) => {
      const initialStage = dto.pipelineStage || 'new';
      const result = await client.query(
        `INSERT INTO leads (
           branch_id, name, email, phone, lead_source,
           pipeline_stage, assigned_to, score,
           inquiry_date, expected_close_date, deal_value, notes,
           stage_entered_at, created_at, updated_at
         )
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, NOW(), NOW(), NOW())
         RETURNING *`,
        [
          branchId,
          dto.name,
          dto.email || null,
          dto.phone || null,
          dto.leadSource || null,
          initialStage,
          dto.assignedTo || null,
          dto.score || 'warm',
          dto.inquiryDate || null,
          dto.expectedCloseDate || null,
          dto.dealValue || null,
          dto.notes || null,
        ],
      );
      const row = result.rows[0];

      // Record initial stage history
      await client.query(
        `INSERT INTO lead_stage_history (lead_id, from_stage, to_stage, changed_by, changed_at)
         VALUES ($1, NULL, $2, $3, NOW())`,
        [row.id, initialStage, createdBy || null],
      );

      return row;
    });

    return this.formatLead(lead);
  }

  async update(id: number, gymId: number, dto: UpdateLeadDto, changedBy?: number) {
    const existingLead = await this.findOne(id, gymId);

    const updates: string[] = [];
    const values: SqlValue[] = [];
    let paramIndex = 1;

    if (dto.name !== undefined) {
      updates.push(`name = $${paramIndex++}`);
      values.push(dto.name);
    }
    if (dto.email !== undefined) {
      updates.push(`email = $${paramIndex++}`);
      values.push(dto.email);
    }
    if (dto.phone !== undefined) {
      updates.push(`phone = $${paramIndex++}`);
      values.push(dto.phone);
    }
    if (dto.leadSource !== undefined) {
      updates.push(`lead_source = $${paramIndex++}`);
      values.push(dto.leadSource);
    }
    if (dto.pipelineStage !== undefined) {
      updates.push(`pipeline_stage = $${paramIndex++}`);
      values.push(dto.pipelineStage);
      // Track stage change
      if (dto.pipelineStage !== existingLead.pipelineStage) {
        updates.push(`stage_entered_at = NOW()`);
      }
    }
    if (dto.assignedTo !== undefined) {
      updates.push(`assigned_to = $${paramIndex++}`);
      values.push(dto.assignedTo);
    }
    if (dto.score !== undefined) {
      updates.push(`score = $${paramIndex++}`);
      values.push(dto.score);
    }
    if (dto.inquiryDate !== undefined) {
      updates.push(`inquiry_date = $${paramIndex++}`);
      values.push(dto.inquiryDate);
    }
    if (dto.expectedCloseDate !== undefined) {
      updates.push(`expected_close_date = $${paramIndex++}`);
      values.push(dto.expectedCloseDate);
    }
    if (dto.dealValue !== undefined) {
      updates.push(`deal_value = $${paramIndex++}`);
      values.push(dto.dealValue);
    }
    if (dto.notes !== undefined) {
      updates.push(`notes = $${paramIndex++}`);
      values.push(dto.notes);
    }
    if (dto.winLossReason !== undefined) {
      updates.push(`win_loss_reason = $${paramIndex++}`);
      values.push(dto.winLossReason);
    }

    if (updates.length === 0) return this.findOne(id, gymId);

    updates.push(`updated_at = NOW()`);
    values.push(id);

    await this.tenantService.executeInTenant(gymId, async (client) => {
      await client.query(
        `UPDATE leads SET ${updates.join(', ')} WHERE id = $${paramIndex}`,
        values,
      );

      // Insert stage history if stage changed
      if (dto.pipelineStage && dto.pipelineStage !== existingLead.pipelineStage) {
        await client.query(
          `INSERT INTO lead_stage_history (lead_id, from_stage, to_stage, changed_by, changed_at)
           VALUES ($1, $2, $3, $4, NOW())`,
          [id, existingLead.pipelineStage, dto.pipelineStage, changedBy || null],
        );
      }
    });

    return this.findOne(id, gymId);
  }

  async updateStage(id: number, gymId: number, dto: UpdateStageDto, changedBy?: number) {
    const existingLead = await this.findOne(id, gymId);

    return this.tenantService.executeInTenant(gymId, async (client) => {
      const updates: string[] = [
        'pipeline_stage = $1',
        'stage_entered_at = NOW()',
        'updated_at = NOW()',
      ];
      const values: SqlValue[] = [dto.stage];
      let paramIndex = 2;

      if ((dto.stage === 'won' || dto.stage === 'lost') && dto.winLossReason) {
        updates.push(`win_loss_reason = $${paramIndex++}`);
        values.push(dto.winLossReason);
      }

      values.push(id);

      await client.query(
        `UPDATE leads SET ${updates.join(', ')} WHERE id = $${paramIndex}`,
        values,
      );

      // Record stage history
      await client.query(
        `INSERT INTO lead_stage_history (lead_id, from_stage, to_stage, changed_by, changed_at)
         VALUES ($1, $2, $3, $4, NOW())`,
        [id, existingLead.pipelineStage, dto.stage, changedBy || null],
      );

      const result = await client.query(
        `SELECT l.*, u.name as assigned_to_name
         FROM leads l
         LEFT JOIN users u ON u.id = l.assigned_to
         WHERE l.id = $1 AND l.is_deleted = FALSE`,
        [id],
      );

      return this.formatLead(result.rows[0]);
    });
  }

  async convertToUser(
    id: number,
    gymId: number,
    branchId: number | null,
    convertedByUserId: number,
  ) {
    const lead = await this.findOne(id, gymId);

    if (lead.convertedUserId) {
      throw new BadRequestException(`Lead #${id} has already been converted to a user`);
    }

    return this.tenantService.executeInTenant(gymId, async (client) => {
      // Insert a new user from the lead data
      const userResult = await client.query(
        `INSERT INTO users (name, email, phone, role, status, lead_source, branch_id, created_at, updated_at)
         VALUES ($1, $2, $3, 'client', 'onboarding', $4, $5, NOW(), NOW())
         RETURNING *`,
        [
          lead.name,
          lead.email || null,
          lead.phone || null,
          lead.leadSource || null,
          branchId,
        ],
      );
      const user = userResult.rows[0];

      // Update lead: mark as converted and won
      await client.query(
        `UPDATE leads SET converted_user_id = $1, pipeline_stage = 'won', updated_at = NOW() WHERE id = $2`,
        [user.id, id],
      );

      const updatedLeadResult = await client.query(
        `SELECT l.*, u.name as assigned_to_name
         FROM leads l
         LEFT JOIN users u ON u.id = l.assigned_to
         WHERE l.id = $1`,
        [id],
      );

      return {
        lead: this.formatLead(updatedLeadResult.rows[0]),
        user: {
          id: user.id,
          name: user.name,
          email: user.email,
          phone: user.phone,
          role: user.role,
          status: user.status,
        },
      };
    });
  }

  async softDelete(id: number, gymId: number) {
    await this.findOne(id, gymId);

    await this.tenantService.executeInTenant(gymId, async (client) => {
      await client.query(
        `UPDATE leads SET is_deleted = TRUE, updated_at = NOW() WHERE id = $1`,
        [id],
      );
    });

    return { message: 'Lead deleted successfully' };
  }

  async getStats(
    gymId: number,
    branchId: number | null = null,
    dateFilters: LeadStatsFiltersDto = {},
  ) {
    return this.tenantService.executeInTenant(gymId, async (client) => {
      const conditions: string[] = ['is_deleted = FALSE'];
      const values: SqlValue[] = [];
      let paramIndex = 1;

      if (branchId !== null) {
        conditions.push(`branch_id = $${paramIndex++}`);
        values.push(branchId);
      }
      if (dateFilters.dateFrom) {
        conditions.push(`created_at >= $${paramIndex++}`);
        values.push(dateFilters.dateFrom);
      }
      if (dateFilters.dateTo) {
        conditions.push(`created_at <= $${paramIndex++}`);
        values.push(dateFilters.dateTo);
      }

      const whereClause = conditions.join(' AND ');

      // Total leads
      const totalResult = await client.query(
        `SELECT COUNT(*) FROM leads WHERE ${whereClause}`,
        values,
      );
      const total = parseInt(totalResult.rows[0].count);

      // By stage
      const byStageResult = await client.query(
        `SELECT pipeline_stage, COUNT(*) as count
         FROM leads WHERE ${whereClause}
         GROUP BY pipeline_stage`,
        values,
      );
      const byStage: Record<string, number> = {};
      byStageResult.rows.forEach((row) => {
        byStage[row.pipeline_stage] = parseInt(row.count);
      });

      // By score
      const byScoreResult = await client.query(
        `SELECT score, COUNT(*) as count
         FROM leads WHERE ${whereClause}
         GROUP BY score`,
        values,
      );
      const byScore: Record<string, number> = {};
      byScoreResult.rows.forEach((row) => {
        byScore[row.score] = parseInt(row.count);
      });

      // Conversion rate: won / (won + lost)
      const won = byStage['won'] || 0;
      const lost = byStage['lost'] || 0;
      const conversionRate = won + lost > 0 ? Math.round((won / (won + lost)) * 10000) / 100 : 0;

      // By source
      const bySourceResult = await client.query(
        `SELECT COALESCE(lead_source, 'unknown') as source, COUNT(*) as count
         FROM leads WHERE ${whereClause}
         GROUP BY lead_source ORDER BY count DESC`,
        values,
      );
      const bySource = bySourceResult.rows.map((row) => ({
        source: row.source,
        count: parseInt(row.count),
      }));

      // Conversion by source
      const conversionBySourceResult = await client.query(
        `SELECT COALESCE(lead_source, 'unknown') as source,
                COUNT(*) as total,
                COUNT(*) FILTER (WHERE pipeline_stage = 'won') as won
         FROM leads WHERE ${whereClause}
         GROUP BY lead_source ORDER BY total DESC`,
        values,
      );
      const conversionBySource = conversionBySourceResult.rows.map((row) => ({
        source: row.source,
        total: parseInt(row.total),
        won: parseInt(row.won),
        rate: parseInt(row.total) > 0
          ? Math.round((parseInt(row.won) / parseInt(row.total)) * 10000) / 100
          : 0,
      }));

      // Conversion by staff
      const conversionByStaffResult = await client.query(
        `SELECT l.assigned_to, u.name as staff_name,
                COUNT(*) as total,
                COUNT(*) FILTER (WHERE l.pipeline_stage = 'won') as won
         FROM leads l
         LEFT JOIN users u ON u.id = l.assigned_to
         WHERE ${whereClause.replace(/(?<!\.)is_deleted/g, 'l.is_deleted').replace(/(?<!\.)branch_id/g, 'l.branch_id').replace(/(?<!\.)created_at/g, 'l.created_at')}
           AND l.assigned_to IS NOT NULL
         GROUP BY l.assigned_to, u.name ORDER BY total DESC`,
        values,
      );
      const conversionByStaff = conversionByStaffResult.rows.map((row) => ({
        staffId: row.assigned_to,
        staffName: row.staff_name || 'Unknown',
        total: parseInt(row.total),
        won: parseInt(row.won),
        rate: parseInt(row.total) > 0
          ? Math.round((parseInt(row.won) / parseInt(row.total)) * 10000) / 100
          : 0,
      }));

      // Average days in stage
      const avgDaysResult = await client.query(
        `SELECT pipeline_stage,
                AVG(EXTRACT(EPOCH FROM (NOW() - COALESCE(stage_entered_at, created_at))) / 86400) as avg_days
         FROM leads WHERE ${whereClause}
           AND pipeline_stage NOT IN ('won', 'lost')
         GROUP BY pipeline_stage`,
        values,
      );
      const avgDaysInStage: Record<string, number> = {};
      avgDaysResult.rows.forEach((row) => {
        avgDaysInStage[row.pipeline_stage] = Math.round(parseFloat(row.avg_days) * 10) / 10;
      });

      return {
        total,
        byStage,
        byScore,
        conversionRate,
        bySource,
        conversionBySource,
        conversionByStaff,
        avgDaysInStage,
      };
    });
  }

  async getSources(gymId: number) {
    return this.tenantService.executeInTenant(gymId, async (client) => {
      const result = await client.query(
        `SELECT * FROM lead_sources WHERE is_active = TRUE ORDER BY name`,
      );
      return result.rows;
    });
  }

  async createActivity(
    leadId: number,
    gymId: number,
    dto: CreateLeadActivityDto,
    performedBy: number,
  ) {
    await this.findOne(leadId, gymId);

    const activity = await this.tenantService.executeInTenant(gymId, async (client) => {
      const result = await client.query(
        `INSERT INTO lead_activities (lead_id, type, notes, scheduled_at, completed_at, performed_by, created_at)
         VALUES ($1, $2, $3, $4, $5, $6, NOW())
         RETURNING *`,
        [
          leadId,
          dto.type,
          dto.notes || null,
          dto.scheduledAt || null,
          dto.completedAt || null,
          performedBy,
        ],
      );
      return result.rows[0];
    });

    return this.formatActivity(activity);
  }

  async getStageHistory(leadId: number, gymId: number) {
    await this.findOne(leadId, gymId);

    return this.tenantService.executeInTenant(gymId, async (client) => {
      const result = await client.query(
        `SELECT h.*, u.name as changed_by_name
         FROM lead_stage_history h
         LEFT JOIN users u ON u.id = h.changed_by
         WHERE h.lead_id = $1
         ORDER BY h.changed_at DESC`,
        [leadId],
      );

      return result.rows.map((row) => ({
        id: row.id,
        leadId: row.lead_id,
        fromStage: row.from_stage,
        toStage: row.to_stage,
        changedBy: row.changed_by,
        changedByName: row.changed_by_name,
        changedAt: row.changed_at,
      }));
    });
  }

  async getActivities(leadId: number, gymId: number) {
    await this.findOne(leadId, gymId);

    return this.tenantService.executeInTenant(gymId, async (client) => {
      const result = await client.query(
        `SELECT la.*, u.name as performed_by_name
         FROM lead_activities la
         LEFT JOIN users u ON u.id = la.performed_by
         WHERE la.lead_id = $1
         ORDER BY la.created_at DESC`,
        [leadId],
      );

      return result.rows.map((row) => this.formatActivity(row));
    });
  }
}
