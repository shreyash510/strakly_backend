import {
  Injectable,
  NotFoundException,
  ConflictException,
} from '@nestjs/common';
import { TenantService } from '../tenant/tenant.service';
import { CreateFacilityDto } from './dto/create-facility.dto';
import { UpdateFacilityDto } from './dto/update-facility.dto';

@Injectable()
export class FacilitiesService {
  constructor(private readonly tenantService: TenantService) {}

  private formatFacility(f: any) {
    return {
      id: f.id,
      branchId: f.branch_id,
      name: f.name,
      code: f.code,
      description: f.description,
      icon: f.icon,
      isActive: f.is_active,
      displayOrder: f.display_order,
      createdAt: f.created_at,
      updatedAt: f.updated_at,
    };
  }

  /**
   * Get all facilities for a gym
   * @param gymId - Gym ID
   * @param branchId - Branch ID (null = all branches for admin)
   * @param includeInactive - Include inactive facilities
   */
  async findAll(
    gymId: number,
    branchId: number | null = null,
    includeInactive = false,
  ) {
    return this.tenantService.executeInTenant(gymId, async (client) => {
      const conditions: string[] = [];
      const values: any[] = [];
      let paramIndex = 1;

      if (!includeInactive) {
        conditions.push('is_active = true');
      }

      // Branch filtering: null = admin (all branches), number = specific branch
      if (branchId !== null) {
        conditions.push(`(branch_id = $${paramIndex} OR branch_id IS NULL)`);
        values.push(branchId);
        paramIndex++;
      }

      const whereClause =
        conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
      const result = await client.query(
        `SELECT * FROM facilities ${whereClause} ORDER BY display_order ASC, name ASC`,
        values,
      );
      return result.rows.map((f: any) => this.formatFacility(f));
    });
  }

  /**
   * Get a single facility by ID
   */
  async findOne(id: number, gymId: number, branchId: number | null = null) {
    const facility = await this.tenantService.executeInTenant(
      gymId,
      async (client) => {
        let query = `SELECT * FROM facilities WHERE id = $1`;
        const values: any[] = [id];

        if (branchId !== null) {
          query += ` AND (branch_id = $2 OR branch_id IS NULL)`;
          values.push(branchId);
        }

        const result = await client.query(query, values);
        return result.rows[0];
      },
    );

    if (!facility) {
      throw new NotFoundException(`Facility with ID ${id} not found`);
    }

    return this.formatFacility(facility);
  }

  /**
   * Create a new facility
   */
  async create(
    dto: CreateFacilityDto,
    gymId: number,
    branchId: number | null = null,
  ) {
    // Check for duplicate code within the same branch
    const existing = await this.tenantService.executeInTenant(
      gymId,
      async (client) => {
        let query = `SELECT id FROM facilities WHERE code = $1`;
        const values: any[] = [dto.code];

        if (branchId !== null) {
          query += ` AND branch_id = $2`;
          values.push(branchId);
        } else {
          query += ` AND branch_id IS NULL`;
        }

        const result = await client.query(query, values);
        return result.rows[0];
      },
    );

    if (existing) {
      throw new ConflictException(
        `Facility with code ${dto.code} already exists`,
      );
    }

    const facility = await this.tenantService.executeInTenant(
      gymId,
      async (client) => {
        const result = await client.query(
          `INSERT INTO facilities (branch_id, name, code, description, icon, is_active, display_order, created_at, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, NOW(), NOW())
         RETURNING *`,
          [
            branchId,
            dto.name,
            dto.code,
            dto.description || null,
            dto.icon || null,
            dto.isActive !== undefined ? dto.isActive : true,
            dto.displayOrder || 0,
          ],
        );
        return result.rows[0];
      },
    );

    return this.formatFacility(facility);
  }

  /**
   * Update a facility
   */
  async update(id: number, gymId: number, dto: UpdateFacilityDto) {
    await this.findOne(id, gymId);

    // Check for duplicate code if code is being updated
    if (dto.code) {
      const existing = await this.tenantService.executeInTenant(
        gymId,
        async (client) => {
          const result = await client.query(
            `SELECT id FROM facilities WHERE code = $1 AND id != $2`,
            [dto.code, id],
          );
          return result.rows[0];
        },
      );

      if (existing) {
        throw new ConflictException(
          `Facility with code ${dto.code} already exists`,
        );
      }
    }

    const updates: string[] = [];
    const values: any[] = [];
    let paramIndex = 1;

    if (dto.name !== undefined) {
      updates.push(`name = $${paramIndex++}`);
      values.push(dto.name);
    }
    if (dto.code !== undefined) {
      updates.push(`code = $${paramIndex++}`);
      values.push(dto.code);
    }
    if (dto.description !== undefined) {
      updates.push(`description = $${paramIndex++}`);
      values.push(dto.description);
    }
    if (dto.icon !== undefined) {
      updates.push(`icon = $${paramIndex++}`);
      values.push(dto.icon);
    }
    if (dto.isActive !== undefined) {
      updates.push(`is_active = $${paramIndex++}`);
      values.push(dto.isActive);
    }
    if (dto.displayOrder !== undefined) {
      updates.push(`display_order = $${paramIndex++}`);
      values.push(dto.displayOrder);
    }

    if (updates.length === 0) {
      return this.findOne(id, gymId);
    }

    updates.push(`updated_at = NOW()`);
    values.push(id);

    const facility = await this.tenantService.executeInTenant(
      gymId,
      async (client) => {
        await client.query(
          `UPDATE facilities SET ${updates.join(', ')} WHERE id = $${paramIndex}`,
          values,
        );
        const result = await client.query(
          `SELECT * FROM facilities WHERE id = $1`,
          [id],
        );
        return result.rows[0];
      },
    );

    return this.formatFacility(facility);
  }

  /**
   * Delete a facility (soft delete by setting is_active = false)
   */
  async delete(id: number, gymId: number) {
    await this.findOne(id, gymId);

    await this.tenantService.executeInTenant(gymId, async (client) => {
      await client.query(
        `UPDATE facilities SET is_active = false, updated_at = NOW() WHERE id = $1`,
        [id],
      );
    });

    return { id, deleted: true };
  }
}
