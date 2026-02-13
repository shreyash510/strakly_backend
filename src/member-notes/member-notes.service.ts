import { Injectable, NotFoundException } from '@nestjs/common';
import { TenantService } from '../tenant/tenant.service';
import {
  CreateMemberNoteDto,
  UpdateMemberNoteDto,
  MemberNoteFiltersDto,
} from './dto/member-note.dto';
import { SqlValue } from '../common/types';

@Injectable()
export class MemberNotesService {
  constructor(private readonly tenantService: TenantService) {}

  private formatNote(n: Record<string, any>) {
    return {
      id: n.id,
      branchId: n.branch_id,
      userId: n.user_id,
      noteType: n.note_type,
      content: n.content,
      isPinned: n.is_pinned,
      visibility: n.visibility,
      createdBy: n.created_by,
      createdByName: n.created_by_name,
      createdAt: n.created_at,
      updatedAt: n.updated_at,
    };
  }

  async findAll(
    gymId: number,
    branchId: number | null = null,
    filters: MemberNoteFiltersDto = {},
  ) {
    const page = filters.page || 1;
    const limit = filters.limit || 50;
    const skip = (page - 1) * limit;

    return this.tenantService.executeInTenant(gymId, async (client) => {
      const conditions: string[] = ['n.is_deleted = FALSE'];
      const values: SqlValue[] = [];
      let paramIndex = 1;

      if (filters.userId) {
        conditions.push(`n.user_id = $${paramIndex++}`);
        values.push(filters.userId);
      }

      if (branchId !== null) {
        conditions.push(`(n.branch_id = $${paramIndex++} OR n.branch_id IS NULL)`);
        values.push(branchId);
      }

      if (filters.noteType) {
        conditions.push(`n.note_type = $${paramIndex++}`);
        values.push(filters.noteType);
      }

      const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

      const countResult = await client.query(
        `SELECT COUNT(*) FROM member_notes n ${whereClause}`,
        values,
      );
      const total = parseInt(countResult.rows[0].count);

      const result = await client.query(
        `SELECT n.*, u.name as created_by_name
         FROM member_notes n
         LEFT JOIN users u ON u.id = n.created_by
         ${whereClause}
         ORDER BY n.is_pinned DESC, n.created_at DESC
         LIMIT $${paramIndex++} OFFSET $${paramIndex++}`,
        [...values, limit, skip],
      );

      return {
        data: result.rows.map((n) => this.formatNote(n)),
        total,
        page,
        limit,
      };
    });
  }

  async findOne(id: number, gymId: number) {
    const note = await this.tenantService.executeInTenant(gymId, async (client) => {
      const result = await client.query(
        `SELECT n.*, u.name as created_by_name
         FROM member_notes n
         LEFT JOIN users u ON u.id = n.created_by
         WHERE n.id = $1 AND n.is_deleted = FALSE`,
        [id],
      );
      return result.rows[0];
    });

    if (!note) {
      throw new NotFoundException(`Note #${id} not found`);
    }

    return this.formatNote(note);
  }

  async create(
    dto: CreateMemberNoteDto,
    gymId: number,
    branchId: number | null,
    createdBy: number,
  ) {
    const note = await this.tenantService.executeInTenant(gymId, async (client) => {
      const result = await client.query(
        `INSERT INTO member_notes (branch_id, user_id, note_type, content, visibility, created_by, created_at, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6, NOW(), NOW())
         RETURNING *`,
        [
          branchId,
          dto.userId,
          dto.noteType || 'general',
          dto.content,
          dto.visibility || 'all',
          createdBy,
        ],
      );
      return result.rows[0];
    });

    return this.formatNote(note);
  }

  async update(id: number, gymId: number, dto: UpdateMemberNoteDto) {
    await this.findOne(id, gymId);

    const updates: string[] = [];
    const values: SqlValue[] = [];
    let paramIndex = 1;

    if (dto.content !== undefined) {
      updates.push(`content = $${paramIndex++}`);
      values.push(dto.content);
    }
    if (dto.noteType !== undefined) {
      updates.push(`note_type = $${paramIndex++}`);
      values.push(dto.noteType);
    }
    if (dto.visibility !== undefined) {
      updates.push(`visibility = $${paramIndex++}`);
      values.push(dto.visibility);
    }

    if (updates.length === 0) return this.findOne(id, gymId);

    updates.push(`updated_at = NOW()`);
    values.push(id);

    await this.tenantService.executeInTenant(gymId, async (client) => {
      await client.query(
        `UPDATE member_notes SET ${updates.join(', ')} WHERE id = $${paramIndex}`,
        values,
      );
    });

    return this.findOne(id, gymId);
  }

  async togglePin(id: number, gymId: number) {
    const note = await this.findOne(id, gymId);

    await this.tenantService.executeInTenant(gymId, async (client) => {
      await client.query(
        `UPDATE member_notes SET is_pinned = $1, updated_at = NOW() WHERE id = $2`,
        [!note.isPinned, id],
      );
    });

    return this.findOne(id, gymId);
  }

  async remove(id: number, gymId: number, deletedBy: number) {
    await this.findOne(id, gymId);

    await this.tenantService.executeInTenant(gymId, async (client) => {
      await client.query(
        `UPDATE member_notes SET is_deleted = TRUE, deleted_at = NOW() WHERE id = $1`,
        [id],
      );
    });

    return { message: 'Note deleted successfully' };
  }
}
