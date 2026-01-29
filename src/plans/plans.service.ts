import { Injectable, NotFoundException, ConflictException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';
import { TenantService } from '../tenant/tenant.service';
import { CreatePlanDto, UpdatePlanDto } from './dto/plan.dto';

@Injectable()
export class PlansService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tenantService: TenantService,
  ) {}

  /**
   * Get all plans for a gym
   * @param gymId - Gym ID
   * @param branchId - Branch ID (null = all branches for admin)
   * @param includeInactive - Include inactive plans
   */
  async findAll(gymId: number, branchId: number | null = null, includeInactive = false) {
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

      const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
      const result = await client.query(
        `SELECT * FROM plans ${whereClause} ORDER BY display_order ASC`,
        values
      );
      return result.rows.map((p: any) => this.formatPlan(p));
    });
  }

  /**
   * Get featured plans
   * @param gymId - Gym ID
   * @param branchId - Branch ID (null = all branches for admin)
   */
  async findFeatured(gymId: number, branchId: number | null = null) {
    return this.tenantService.executeInTenant(gymId, async (client) => {
      const conditions: string[] = ['is_active = true', 'is_featured = true'];
      const values: any[] = [];
      let paramIndex = 1;

      if (branchId !== null) {
        conditions.push(`(branch_id = $${paramIndex} OR branch_id IS NULL)`);
        values.push(branchId);
      }

      const result = await client.query(
        `SELECT * FROM plans WHERE ${conditions.join(' AND ')} ORDER BY display_order ASC`,
        values
      );
      return result.rows.map((p: any) => this.formatPlan(p));
    });
  }

  private formatPlan(p: any) {
    return {
      id: p.id,
      branchId: p.branch_id,
      code: p.code,
      name: p.name,
      description: p.description,
      durationValue: p.duration_value,
      durationType: p.duration_type,
      price: p.price,
      currency: p.currency,
      features: p.features,
      displayOrder: p.display_order,
      isFeatured: p.is_featured,
      isActive: p.is_active,
      createdAt: p.created_at,
      updatedAt: p.updated_at,
    };
  }

  async findOne(id: number, gymId: number, branchId: number | null = null) {
    const plan = await this.tenantService.executeInTenant(gymId, async (client) => {
      let query = `SELECT * FROM plans WHERE id = $1`;
      const values: any[] = [id];

      // Branch filtering for non-admin users
      if (branchId !== null) {
        query += ` AND (branch_id = $2 OR branch_id IS NULL)`;
        values.push(branchId);
      }

      const result = await client.query(query, values);
      return result.rows[0];
    });

    if (!plan) {
      throw new NotFoundException(`Plan with ID ${id} not found`);
    }

    return this.formatPlan(plan);
  }

  async findByCode(code: string, gymId: number, branchId: number | null = null) {
    const plan = await this.tenantService.executeInTenant(gymId, async (client) => {
      let query = `SELECT * FROM plans WHERE code = $1`;
      const values: any[] = [code];

      if (branchId !== null) {
        query += ` AND (branch_id = $2 OR branch_id IS NULL)`;
        values.push(branchId);
      }

      const result = await client.query(query, values);
      return result.rows[0];
    });

    if (!plan) {
      throw new NotFoundException(`Plan with code ${code} not found`);
    }

    return this.formatPlan(plan);
  }

  /**
   * Create a new plan
   * @param dto - Plan data
   * @param gymId - Gym ID
   * @param branchId - Branch ID (null = available to all branches)
   */
  async create(dto: CreatePlanDto, gymId: number, branchId: number | null = null) {
    const existing = await this.tenantService.executeInTenant(gymId, async (client) => {
      const result = await client.query(`SELECT id FROM plans WHERE code = $1`, [dto.code]);
      return result.rows[0];
    });

    if (existing) {
      throw new ConflictException(`Plan with code ${dto.code} already exists`);
    }

    const plan = await this.tenantService.executeInTenant(gymId, async (client) => {
      const result = await client.query(
        `INSERT INTO plans (branch_id, code, name, description, duration_value, duration_type, price, currency, features, display_order, is_featured, is_active, created_at, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, true, NOW(), NOW())
         RETURNING *`,
        [
          branchId,
          dto.code,
          dto.name,
          dto.description || null,
          dto.durationValue,
          dto.durationType,
          dto.price,
          dto.currency || 'INR',
          JSON.stringify(dto.features || []),
          dto.displayOrder || 0,
          dto.isFeatured || false,
        ]
      );
      return result.rows[0];
    });

    return this.formatPlan(plan);
  }

  async update(id: number, gymId: number, dto: UpdatePlanDto) {
    await this.findOne(id, gymId);

    const updates: string[] = [];
    const values: any[] = [];
    let paramIndex = 1;

    if (dto.name) { updates.push(`name = $${paramIndex++}`); values.push(dto.name); }
    if (dto.description !== undefined) { updates.push(`description = $${paramIndex++}`); values.push(dto.description); }
    if (dto.durationValue) { updates.push(`duration_value = $${paramIndex++}`); values.push(dto.durationValue); }
    if (dto.durationType) { updates.push(`duration_type = $${paramIndex++}`); values.push(dto.durationType); }
    if (dto.price !== undefined) { updates.push(`price = $${paramIndex++}`); values.push(dto.price); }
    if (dto.currency) { updates.push(`currency = $${paramIndex++}`); values.push(dto.currency); }
    if (dto.features) { updates.push(`features = $${paramIndex++}`); values.push(JSON.stringify(dto.features)); }
    if (dto.displayOrder !== undefined) { updates.push(`display_order = $${paramIndex++}`); values.push(dto.displayOrder); }
    if (dto.isFeatured !== undefined) { updates.push(`is_featured = $${paramIndex++}`); values.push(dto.isFeatured); }
    if (dto.isActive !== undefined) { updates.push(`is_active = $${paramIndex++}`); values.push(dto.isActive); }

    updates.push(`updated_at = NOW()`);
    values.push(id);

    const plan = await this.tenantService.executeInTenant(gymId, async (client) => {
      await client.query(
        `UPDATE plans SET ${updates.join(', ')} WHERE id = $${paramIndex}`,
        values
      );
      const result = await client.query(`SELECT * FROM plans WHERE id = $1`, [id]);
      return result.rows[0];
    });

    return this.formatPlan(plan);
  }

  async delete(id: number, gymId: number) {
    await this.findOne(id, gymId);

    const activeMemberships = await this.tenantService.executeInTenant(gymId, async (client) => {
      const result = await client.query(
        `SELECT COUNT(*) as count FROM memberships WHERE plan_id = $1 AND status IN ('active', 'pending')`,
        [id]
      );
      return parseInt(result.rows[0].count, 10);
    });

    if (activeMemberships > 0) {
      throw new BadRequestException(
        `Cannot delete plan. ${activeMemberships} active membership(s) are using this plan.`,
      );
    }

    // Soft delete
    await this.tenantService.executeInTenant(gymId, async (client) => {
      await client.query(`UPDATE plans SET is_active = false, updated_at = NOW() WHERE id = $1`, [id]);
    });

    return { id, deleted: true };
  }

  async calculatePriceWithOffer(planId: number, gymId: number, branchId: number | null = null, offerCode?: string) {
    const plan = await this.findOne(planId, gymId, branchId);

    let discount = 0;
    let validOffer: any = null;

    if (offerCode) {
      const offer = await this.tenantService.executeInTenant(gymId, async (client) => {
        let query = `SELECT * FROM offers WHERE code = $1 AND is_active = true AND start_date <= NOW() AND end_date >= NOW()`;
        const values: any[] = [offerCode];

        // Branch filtering for offers
        if (branchId !== null) {
          query += ` AND (branch_id = $2 OR branch_id IS NULL)`;
          values.push(branchId);
        }

        const result = await client.query(query, values);
        return result.rows[0];
      });

      if (offer) {
        validOffer = offer;
        if (offer.discount_type === 'percentage') {
          discount = (Number(plan.price) * Number(offer.discount_value)) / 100;
        } else {
          discount = Number(offer.discount_value);
        }
      }
    }

    const originalAmount = Number(plan.price);
    const discountAmount = Math.min(discount, originalAmount);
    const finalAmount = originalAmount - discountAmount;

    return {
      plan,
      offer: validOffer,
      originalAmount,
      discountAmount,
      finalAmount,
      currency: plan.currency,
    };
  }
}
