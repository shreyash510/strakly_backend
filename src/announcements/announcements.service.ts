import { Injectable, NotFoundException } from '@nestjs/common';
import { TenantService } from '../tenant/tenant.service';
import {
  CreateAnnouncementDto,
  UpdateAnnouncementDto,
  AnnouncementFiltersDto,
} from './dto/announcement.dto';
import { SqlValue } from '../common/types';

export interface AnnouncementRecord {
  id: number;
  branchId: number | null;
  title: string;
  content: string;
  type: string;
  priority: string;
  targetAudience: string;
  targetUserIds: number[] | null;
  startDate: Date;
  endDate: Date | null;
  isPinned: boolean;
  displayOnDashboard: boolean;
  displayOnMobile: boolean;
  attachments: Array<{ name: string; url: string; type: string }> | null;
  createdBy: number;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

@Injectable()
export class AnnouncementsService {
  constructor(private readonly tenantService: TenantService) {}

  private formatAnnouncement(a: Record<string, any>): AnnouncementRecord {
    return {
      id: a.id,
      branchId: a.branch_id,
      title: a.title,
      content: a.content,
      type: a.type,
      priority: a.priority,
      targetAudience: a.target_audience,
      targetUserIds: a.target_user_ids,
      startDate: a.start_date,
      endDate: a.end_date,
      isPinned: a.is_pinned,
      displayOnDashboard: a.display_on_dashboard,
      displayOnMobile: a.display_on_mobile,
      attachments: a.attachments,
      createdBy: a.created_by,
      isActive: a.is_active,
      createdAt: a.created_at,
      updatedAt: a.updated_at,
    };
  }

  /**
   * Find all announcements with filters
   */
  async findAll(
    gymId: number,
    branchId: number | null = null,
    filters: AnnouncementFiltersDto = {},
  ) {
    const page = filters.page || 1;
    const limit = filters.limit || 10;
    const skip = (page - 1) * limit;

    const { announcements, total } = await this.tenantService.executeInTenant(
      gymId,
      async (client) => {
        const conditions: string[] = [
          '(is_deleted = FALSE OR is_deleted IS NULL)',
        ];
        const values: SqlValue[] = [];
        let paramIndex = 1;

        // Branch filtering
        if (branchId !== null) {
          conditions.push(`(branch_id = $${paramIndex} OR branch_id IS NULL)`);
          values.push(branchId);
          paramIndex++;
        }

        if (filters.type) {
          conditions.push(`type = $${paramIndex++}`);
          values.push(filters.type);
        }

        if (filters.priority) {
          conditions.push(`priority = $${paramIndex++}`);
          values.push(filters.priority);
        }

        if (filters.isPinned !== undefined) {
          conditions.push(`is_pinned = $${paramIndex++}`);
          values.push(filters.isPinned);
        }

        if (filters.activeOnly) {
          conditions.push(`is_active = true`);
          conditions.push(`(start_date <= NOW() OR start_date IS NULL)`);
          conditions.push(`(end_date >= NOW() OR end_date IS NULL)`);
        }

        const whereClause =
          conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

        const [announcementsResult, countResult] = await Promise.all([
          client.query(
            `SELECT * FROM announcements ${whereClause}
           ORDER BY is_pinned DESC, priority DESC, created_at DESC
           LIMIT $${paramIndex++} OFFSET $${paramIndex}`,
            [...values, limit, skip],
          ),
          client.query(
            `SELECT COUNT(*) as count FROM announcements ${whereClause}`,
            values,
          ),
        ]);

        return {
          announcements: announcementsResult.rows,
          total: parseInt(countResult.rows[0].count, 10),
        };
      },
    );

    return {
      data: announcements.map((a: Record<string, any>) => this.formatAnnouncement(a)),
      pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
    };
  }

  /**
   * Get active announcements for display (dashboard, mobile)
   */
  async getActive(
    gymId: number,
    branchId: number | null = null,
    platform: 'dashboard' | 'mobile' = 'dashboard',
  ): Promise<AnnouncementRecord[]> {
    const announcements = await this.tenantService.executeInTenant(
      gymId,
      async (client) => {
        const platformFilter =
          platform === 'dashboard'
            ? 'display_on_dashboard = true'
            : 'display_on_mobile = true';

        let query = `
        SELECT * FROM announcements
        WHERE is_active = true
          AND (is_deleted = FALSE OR is_deleted IS NULL)
          AND (start_date <= NOW() OR start_date IS NULL)
          AND (end_date >= NOW() OR end_date IS NULL)
          AND ${platformFilter}
      `;
        const values: SqlValue[] = [];

        // Branch filtering
        if (branchId !== null) {
          query += ` AND (branch_id = $1 OR branch_id IS NULL)`;
          values.push(branchId);
        }

        query += ` ORDER BY is_pinned DESC, priority DESC, created_at DESC LIMIT 20`;

        const result = await client.query(query, values);
        return result.rows;
      },
    );

    return announcements.map((a: Record<string, any>) => this.formatAnnouncement(a));
  }

  /**
   * Find a single announcement by ID
   */
  async findOne(
    id: number,
    gymId: number,
    branchId: number | null = null,
  ): Promise<AnnouncementRecord> {
    const announcement = await this.tenantService.executeInTenant(
      gymId,
      async (client) => {
        let query = `SELECT * FROM announcements WHERE id = $1 AND (is_deleted = FALSE OR is_deleted IS NULL)`;
        const values: SqlValue[] = [id];

        if (branchId !== null) {
          query += ` AND (branch_id = $2 OR branch_id IS NULL)`;
          values.push(branchId);
        }

        const result = await client.query(query, values);
        return result.rows[0];
      },
    );

    if (!announcement) {
      throw new NotFoundException(`Announcement with ID ${id} not found`);
    }

    return this.formatAnnouncement(announcement);
  }

  /**
   * Create a new announcement
   */
  async create(
    dto: CreateAnnouncementDto,
    gymId: number,
    createdBy: number,
  ): Promise<AnnouncementRecord> {
    const announcement = await this.tenantService.executeInTenant(
      gymId,
      async (client) => {
        const result = await client.query(
          `INSERT INTO announcements (
          branch_id, title, content, type, priority,
          target_audience, target_user_ids,
          start_date, end_date, is_pinned, display_on_dashboard, display_on_mobile,
          attachments, created_by, is_active, created_at, updated_at
        ) VALUES (
          $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, true, NOW(), NOW()
        ) RETURNING *`,
          [
            dto.branchId || null,
            dto.title,
            dto.content,
            dto.type || 'general',
            dto.priority || 'normal',
            dto.targetAudience || 'all',
            dto.targetUserIds || null,
            dto.startDate ? new Date(dto.startDate) : new Date(),
            dto.endDate ? new Date(dto.endDate) : null,
            dto.isPinned || false,
            dto.displayOnDashboard !== false,
            dto.displayOnMobile !== false,
            dto.attachments ? JSON.stringify(dto.attachments) : null,
            createdBy,
          ],
        );
        return result.rows[0];
      },
    );

    return this.formatAnnouncement(announcement);
  }

  /**
   * Update an announcement
   */
  async update(
    id: number,
    gymId: number,
    dto: UpdateAnnouncementDto,
  ): Promise<AnnouncementRecord> {
    await this.findOne(id, gymId);

    const updates: string[] = [];
    const values: SqlValue[] = [];
    let paramIndex = 1;

    if (dto.title) {
      updates.push(`title = $${paramIndex++}`);
      values.push(dto.title);
    }
    if (dto.content) {
      updates.push(`content = $${paramIndex++}`);
      values.push(dto.content);
    }
    if (dto.type) {
      updates.push(`type = $${paramIndex++}`);
      values.push(dto.type);
    }
    if (dto.priority) {
      updates.push(`priority = $${paramIndex++}`);
      values.push(dto.priority);
    }
    if (dto.targetAudience) {
      updates.push(`target_audience = $${paramIndex++}`);
      values.push(dto.targetAudience);
    }
    if (dto.targetUserIds !== undefined) {
      updates.push(`target_user_ids = $${paramIndex++}`);
      values.push(dto.targetUserIds);
    }
    if (dto.startDate) {
      updates.push(`start_date = $${paramIndex++}`);
      values.push(new Date(dto.startDate));
    }
    if (dto.endDate !== undefined) {
      updates.push(`end_date = $${paramIndex++}`);
      values.push(dto.endDate ? new Date(dto.endDate) : null);
    }
    if (dto.isPinned !== undefined) {
      updates.push(`is_pinned = $${paramIndex++}`);
      values.push(dto.isPinned);
    }
    if (dto.displayOnDashboard !== undefined) {
      updates.push(`display_on_dashboard = $${paramIndex++}`);
      values.push(dto.displayOnDashboard);
    }
    if (dto.displayOnMobile !== undefined) {
      updates.push(`display_on_mobile = $${paramIndex++}`);
      values.push(dto.displayOnMobile);
    }
    if (dto.isActive !== undefined) {
      updates.push(`is_active = $${paramIndex++}`);
      values.push(dto.isActive);
    }
    if (dto.attachments !== undefined) {
      updates.push(`attachments = $${paramIndex++}`);
      values.push(dto.attachments ? JSON.stringify(dto.attachments) : null);
    }

    updates.push(`updated_at = NOW()`);
    values.push(id);

    if (updates.length > 1) {
      await this.tenantService.executeInTenant(gymId, async (client) => {
        await client.query(
          `UPDATE announcements SET ${updates.join(', ')} WHERE id = $${paramIndex}`,
          values,
        );
      });
    }

    return this.findOne(id, gymId);
  }

  /**
   * Delete an announcement (soft delete)
   */
  async delete(
    id: number,
    gymId: number,
    deletedById?: number,
  ): Promise<{ id: number; deleted: boolean }> {
    await this.findOne(id, gymId);

    await this.tenantService.executeInTenant(gymId, async (client) => {
      await client.query(
        `UPDATE announcements SET is_deleted = TRUE, deleted_at = NOW(), deleted_by = $2, is_active = FALSE, updated_at = NOW() WHERE id = $1`,
        [id, deletedById || null],
      );
    });

    return { id, deleted: true };
  }

  /**
   * Toggle pin status
   */
  async togglePin(id: number, gymId: number): Promise<AnnouncementRecord> {
    const announcement = await this.findOne(id, gymId);

    await this.tenantService.executeInTenant(gymId, async (client) => {
      await client.query(
        `UPDATE announcements SET is_pinned = NOT is_pinned, updated_at = NOW() WHERE id = $1`,
        [id],
      );
    });

    return this.findOne(id, gymId);
  }
}
