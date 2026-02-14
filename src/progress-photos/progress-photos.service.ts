import { Injectable, NotFoundException } from '@nestjs/common';
import { TenantService } from '../tenant/tenant.service';
import { UploadService } from '../upload/upload.service';
import {
  CreateProgressPhotoDto,
  UpdateProgressPhotoDto,
  PhotoFiltersDto,
} from './dto/progress-photo.dto';
import { SqlValue } from '../common/types';

@Injectable()
export class ProgressPhotosService {
  constructor(
    private readonly tenantService: TenantService,
    private readonly uploadService: UploadService,
  ) {}

  private formatPhoto(row: Record<string, any>) {
    return {
      id: row.id,
      userId: row.user_id,
      photoUrl: row.photo_url,
      thumbnailUrl: row.thumbnail_url,
      category: row.category,
      takenAt: row.taken_at,
      notes: row.notes,
      bodyMetricsId: row.body_metrics_id,
      visibility: row.visibility,
      fileSize: row.file_size,
      uploadedBy: row.uploaded_by,
      uploadedByName: row.uploaded_by_name,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }

  async upload(
    file: Express.Multer.File,
    gymId: number,
    dto: CreateProgressPhotoDto,
    uploadedBy: number,
  ) {
    const { url, thumbnailUrl, size } = await this.uploadService.uploadProgressPhoto(
      file,
      dto.userId,
    );

    const photo = await this.tenantService.executeInTenant(gymId, async (client) => {
      const result = await client.query(
        `INSERT INTO progress_photos
           (user_id, photo_url, thumbnail_url, category, taken_at, notes, body_metrics_id, visibility, file_size, uploaded_by, created_at, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, NOW(), NOW())
         RETURNING *`,
        [
          dto.userId,
          url,
          thumbnailUrl,
          dto.category || 'other',
          dto.takenAt || new Date().toISOString(),
          dto.notes || null,
          dto.bodyMetricsId || null,
          dto.visibility || 'all',
          size,
          uploadedBy,
        ],
      );
      return result.rows[0];
    });

    return this.formatPhoto(photo);
  }

  async findByUser(userId: number, gymId: number, filters: PhotoFiltersDto = {}, requesterId?: number, requesterRole?: string) {
    const page = filters.page || 1;
    const limit = filters.limit || 50;
    const skip = (page - 1) * limit;

    return this.tenantService.executeInTenant(gymId, async (client) => {
      const conditions: string[] = ['p.is_deleted = FALSE', 'p.user_id = $1'];
      const values: SqlValue[] = [userId];
      let paramIndex = 2;

      // Enforce visibility based on requester role
      if (requesterId && requesterRole) {
        if (requesterRole === 'client') {
          // Clients can only see their own photos
          conditions.push(`p.visibility IN ('all', 'self_only')`);
        } else if (requesterRole === 'trainer') {
          // Trainers can see 'all' and 'trainer_only', but not 'self_only' unless they are the owner
          if (requesterId !== userId) {
            conditions.push(`p.visibility IN ('all', 'trainer_only')`);
          }
        }
        // admin, branch_admin, manager see everything
      }

      if (filters.category) {
        conditions.push(`p.category = $${paramIndex++}`);
        values.push(filters.category);
      }

      const whereClause = conditions.join(' AND ');

      const countResult = await client.query(
        `SELECT COUNT(*) FROM progress_photos p WHERE ${whereClause}`,
        values,
      );
      const total = parseInt(countResult.rows[0].count);

      const result = await client.query(
        `SELECT p.*, u.name as uploaded_by_name
         FROM progress_photos p
         LEFT JOIN users u ON u.id = p.uploaded_by
         WHERE ${whereClause}
         ORDER BY p.taken_at DESC
         LIMIT $${paramIndex++} OFFSET $${paramIndex++}`,
        [...values, limit, skip],
      );

      return {
        data: result.rows.map((row) => this.formatPhoto(row)),
        total,
        page,
        limit,
      };
    });
  }

  async findMyPhotos(userId: number, gymId: number, filters: PhotoFiltersDto = {}) {
    return this.findByUser(userId, gymId, filters);
  }

  async findOne(id: number, gymId: number, requesterId?: number, requesterRole?: string) {
    const photo = await this.tenantService.executeInTenant(gymId, async (client) => {
      const result = await client.query(
        `SELECT p.*, u.name as uploaded_by_name
         FROM progress_photos p
         LEFT JOIN users u ON u.id = p.uploaded_by
         WHERE p.id = $1 AND p.is_deleted = FALSE`,
        [id],
      );
      return result.rows[0];
    });

    if (!photo) {
      throw new NotFoundException(`Progress photo #${id} not found`);
    }

    // Enforce visibility
    if (requesterId && requesterRole) {
      const isOwner = photo.user_id === requesterId;
      if (requesterRole === 'client' && !isOwner) {
        throw new NotFoundException(`Progress photo #${id} not found`);
      }
      if (requesterRole === 'trainer' && !isOwner && photo.visibility === 'self_only') {
        throw new NotFoundException(`Progress photo #${id} not found`);
      }
    }

    return this.formatPhoto(photo);
  }

  async update(id: number, gymId: number, dto: UpdateProgressPhotoDto) {
    await this.findOne(id, gymId);

    const updates: string[] = [];
    const values: SqlValue[] = [];
    let paramIndex = 1;

    if (dto.category !== undefined) {
      updates.push(`category = $${paramIndex++}`);
      values.push(dto.category);
    }
    if (dto.takenAt !== undefined) {
      updates.push(`taken_at = $${paramIndex++}`);
      values.push(dto.takenAt);
    }
    if (dto.notes !== undefined) {
      updates.push(`notes = $${paramIndex++}`);
      values.push(dto.notes);
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
        `UPDATE progress_photos SET ${updates.join(', ')} WHERE id = $${paramIndex}`,
        values,
      );
    });

    return this.findOne(id, gymId);
  }

  async softDelete(id: number, gymId: number) {
    await this.findOne(id, gymId);

    await this.tenantService.executeInTenant(gymId, async (client) => {
      await client.query(
        `UPDATE progress_photos SET is_deleted = TRUE, deleted_at = NOW() WHERE id = $1`,
        [id],
      );
    });

    return { message: 'Progress photo deleted successfully' };
  }
}
