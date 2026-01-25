import { Injectable, NotFoundException, BadRequestException, ConflictException } from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';
import { TenantService } from '../tenant/tenant.service';
import {
  CreateMembershipDto,
  UpdateMembershipDto,
  CancelMembershipDto,
  RenewMembershipDto,
  RecordPaymentDto,
} from './dto/membership.dto';

@Injectable()
export class MembershipsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tenantService: TenantService,
  ) {}

  async findAll(gymId: number, filters?: {
    status?: string;
    userId?: number;
    planId?: number;
    search?: string;
    page?: number;
    limit?: number;
  }) {
    const page = filters?.page || 1;
    const limit = filters?.limit || 15;
    const skip = (page - 1) * limit;

    const { memberships, total } = await this.tenantService.executeInTenant(gymId, async (client) => {
      let whereClause = '1=1';
      const values: any[] = [];
      let paramIndex = 1;

      if (filters?.status) {
        whereClause += ` AND m.status = $${paramIndex++}`;
        values.push(filters.status);
      }
      if (filters?.userId) {
        whereClause += ` AND m.user_id = $${paramIndex++}`;
        values.push(filters.userId);
      }
      if (filters?.planId) {
        whereClause += ` AND m.plan_id = $${paramIndex++}`;
        values.push(filters.planId);
      }
      if (filters?.search) {
        whereClause += ` AND (u.name ILIKE $${paramIndex} OR u.email ILIKE $${paramIndex})`;
        values.push(`%${filters.search}%`);
        paramIndex++;
      }

      const [membershipsResult, countResult] = await Promise.all([
        client.query(
          `SELECT m.*, u.id as user_id, u.name as user_name, u.email as user_email, u.phone as user_phone,
                  p.id as plan_id, p.name as plan_name, p.code as plan_code, p.price as plan_price,
                  o.id as offer_id, o.code as offer_code, o.name as offer_name
           FROM memberships m
           JOIN users u ON u.id = m.user_id
           LEFT JOIN plans p ON p.id = m.plan_id
           LEFT JOIN offers o ON o.id = m.offer_id
           WHERE ${whereClause}
           ORDER BY m.created_at DESC
           LIMIT $${paramIndex++} OFFSET $${paramIndex}`,
          [...values, limit, skip]
        ),
        client.query(
          `SELECT COUNT(*) as count FROM memberships m
           JOIN users u ON u.id = m.user_id
           WHERE ${whereClause}`,
          values
        ),
      ]);

      return {
        memberships: membershipsResult.rows,
        total: parseInt(countResult.rows[0].count, 10),
      };
    });

    return {
      data: memberships.map((m: any) => this.formatMembership(m)),
      pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
    };
  }

  private formatMembership(m: any) {
    return {
      id: m.id,
      userId: m.user_id,
      planId: m.plan_id,
      offerId: m.offer_id,
      startDate: m.start_date,
      endDate: m.end_date,
      status: m.status,
      originalAmount: m.original_amount,
      discountAmount: m.discount_amount,
      finalAmount: m.final_amount,
      currency: m.currency,
      paymentStatus: m.payment_status,
      paymentMethod: m.payment_method,
      paymentRef: m.payment_ref,
      paidAt: m.paid_at,
      cancelledAt: m.cancelled_at,
      cancelReason: m.cancel_reason,
      notes: m.notes,
      createdAt: m.created_at,
      updatedAt: m.updated_at,
      user: m.user_name ? {
        id: m.user_id,
        name: m.user_name,
        email: m.user_email,
        phone: m.user_phone,
      } : undefined,
      plan: m.plan_name ? {
        id: m.plan_id,
        name: m.plan_name,
        code: m.plan_code,
        price: m.plan_price,
      } : undefined,
      offer: m.offer_name ? {
        id: m.offer_id,
        code: m.offer_code,
        name: m.offer_name,
      } : undefined,
    };
  }

  async findOne(id: number, gymId: number) {
    const membership = await this.tenantService.executeInTenant(gymId, async (client) => {
      const result = await client.query(
        `SELECT m.*, u.id as user_id, u.name as user_name, u.email as user_email, u.phone as user_phone, u.avatar as user_avatar,
                p.id as plan_id, p.name as plan_name, p.code as plan_code, p.price as plan_price,
                o.id as offer_id, o.code as offer_code, o.name as offer_name
         FROM memberships m
         JOIN users u ON u.id = m.user_id
         LEFT JOIN plans p ON p.id = m.plan_id
         LEFT JOIN offers o ON o.id = m.offer_id
         WHERE m.id = $1`,
        [id]
      );
      return result.rows[0];
    });

    if (!membership) {
      throw new NotFoundException(`Membership with ID ${id} not found`);
    }

    return this.formatMembership(membership);
  }

  async findByUser(userId: number, gymId: number) {
    const memberships = await this.tenantService.executeInTenant(gymId, async (client) => {
      const result = await client.query(
        `SELECT m.*, p.id as plan_id, p.name as plan_name, p.code as plan_code,
                o.id as offer_id, o.code as offer_code, o.name as offer_name
         FROM memberships m
         LEFT JOIN plans p ON p.id = m.plan_id
         LEFT JOIN offers o ON o.id = m.offer_id
         WHERE m.user_id = $1
         ORDER BY m.created_at DESC`,
        [userId]
      );
      return result.rows;
    });

    return memberships.map((m: any) => this.formatMembership(m));
  }

  async getActiveMembership(userId: number, gymId: number) {
    const now = new Date();

    const membership = await this.tenantService.executeInTenant(gymId, async (client) => {
      const result = await client.query(
        `SELECT m.*, p.id as plan_id, p.name as plan_name, p.code as plan_code, p.price as plan_price,
                o.id as offer_id, o.code as offer_code, o.name as offer_name
         FROM memberships m
         LEFT JOIN plans p ON p.id = m.plan_id
         LEFT JOIN offers o ON o.id = m.offer_id
         WHERE m.user_id = $1 AND m.status = 'active' AND m.start_date <= $2 AND m.end_date >= $2
         LIMIT 1`,
        [userId, now]
      );
      return result.rows[0];
    });

    return membership ? this.formatMembership(membership) : null;
  }

  async checkMembershipStatus(userId: number, gymId: number) {
    const active = await this.getActiveMembership(userId, gymId);

    if (!active) {
      return { hasActiveMembership: false, membership: null, daysRemaining: 0 };
    }

    const now = new Date();
    const endDate = new Date(active.endDate);
    const daysRemaining = Math.ceil((endDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));

    return {
      hasActiveMembership: true,
      membership: active,
      daysRemaining,
      isExpiringSoon: daysRemaining <= 7,
    };
  }

  async create(dto: CreateMembershipDto, gymId: number) {
    // Verify user exists in tenant
    const user = await this.tenantService.executeInTenant(gymId, async (client) => {
      const result = await client.query(`SELECT id FROM users WHERE id = $1`, [dto.userId]);
      return result.rows[0];
    });

    if (!user) {
      throw new NotFoundException(`User with ID ${dto.userId} not found`);
    }

    // Check for active membership
    const activeMembership = await this.getActiveMembership(dto.userId, gymId);
    if (activeMembership) {
      throw new ConflictException('User already has an active membership');
    }

    // Get plan details
    const plan = await this.tenantService.executeInTenant(gymId, async (client) => {
      const result = await client.query(
        `SELECT * FROM plans WHERE id = $1 AND is_active = true`,
        [dto.planId]
      );
      return result.rows[0];
    });

    if (!plan) {
      throw new NotFoundException(`Plan with ID ${dto.planId} not found`);
    }

    // Get offer if provided
    let offer: any = null;
    let discountAmount = 0;
    if (dto.offerCode) {
      offer = await this.tenantService.executeInTenant(gymId, async (client) => {
        const result = await client.query(
          `SELECT * FROM offers WHERE code = $1 AND is_active = true AND start_date <= NOW() AND end_date >= NOW()`,
          [dto.offerCode]
        );
        return result.rows[0];
      });

      if (offer) {
        if (offer.discount_type === 'percentage') {
          discountAmount = (plan.price * offer.discount_value) / 100;
        } else {
          discountAmount = offer.discount_value;
        }
      }
    }

    const originalAmount = plan.price;
    const finalAmount = Math.max(0, originalAmount - discountAmount);

    // Calculate end date
    const startDate = new Date(dto.startDate);
    const endDate = this.calculateEndDate(startDate, plan.duration_value, plan.duration_type);

    // Create membership
    const membership = await this.tenantService.executeInTenant(gymId, async (client) => {
      const result = await client.query(
        `INSERT INTO memberships (user_id, plan_id, offer_id, start_date, end_date, status,
          original_amount, discount_amount, final_amount, currency, payment_status, payment_method, paid_at, notes, created_at, updated_at)
         VALUES ($1, $2, $3, $4, $5, 'active', $6, $7, $8, $9, 'paid', $10, NOW(), $11, NOW(), NOW())
         RETURNING *`,
        [dto.userId, dto.planId, offer?.id || null, startDate, endDate, originalAmount, discountAmount, finalAmount, 'INR', dto.paymentMethod || 'cash', dto.notes || null]
      );
      return result.rows[0];
    });

    // Increment offer usage
    if (offer) {
      await this.tenantService.executeInTenant(gymId, async (client) => {
        await client.query(`UPDATE offers SET current_usage = current_usage + 1 WHERE id = $1`, [offer.id]);
      });
    }

    return this.findOne(membership.id, gymId);
  }

  async update(id: number, gymId: number, dto: UpdateMembershipDto) {
    await this.findOne(id, gymId); // Verify exists

    const updates: string[] = [];
    const values: any[] = [];
    let paramIndex = 1;

    if (dto.status) { updates.push(`status = $${paramIndex++}`); values.push(dto.status); }
    if (dto.paymentStatus) { updates.push(`payment_status = $${paramIndex++}`); values.push(dto.paymentStatus); }
    if (dto.paymentMethod) { updates.push(`payment_method = $${paramIndex++}`); values.push(dto.paymentMethod); }
    if (dto.paymentRef) { updates.push(`payment_ref = $${paramIndex++}`); values.push(dto.paymentRef); }
    if (dto.notes !== undefined) { updates.push(`notes = $${paramIndex++}`); values.push(dto.notes); }
    if (dto.paidAt) { updates.push(`paid_at = $${paramIndex++}`); values.push(new Date(dto.paidAt)); }

    updates.push(`updated_at = NOW()`);
    values.push(id);

    await this.tenantService.executeInTenant(gymId, async (client) => {
      await client.query(
        `UPDATE memberships SET ${updates.join(', ')} WHERE id = $${paramIndex}`,
        values
      );
    });

    return this.findOne(id, gymId);
  }

  async recordPayment(id: number, gymId: number, dto: RecordPaymentDto) {
    const membership = await this.findOne(id, gymId);

    if (membership.paymentStatus === 'paid') {
      throw new BadRequestException('Payment already recorded for this membership');
    }

    await this.tenantService.executeInTenant(gymId, async (client) => {
      await client.query(
        `UPDATE memberships SET payment_status = 'paid', payment_method = $1, payment_ref = $2, paid_at = NOW(), status = 'active', updated_at = NOW() WHERE id = $3`,
        [dto.paymentMethod, dto.paymentRef || null, id]
      );
    });

    return this.findOne(id, gymId);
  }

  async cancel(id: number, gymId: number, dto: CancelMembershipDto) {
    const membership = await this.findOne(id, gymId);

    if (membership.status === 'cancelled') {
      throw new BadRequestException('Membership is already cancelled');
    }

    await this.tenantService.executeInTenant(gymId, async (client) => {
      await client.query(
        `UPDATE memberships SET status = 'cancelled', cancelled_at = NOW(), cancel_reason = $1, updated_at = NOW() WHERE id = $2`,
        [dto.reason || null, id]
      );
    });

    return this.findOne(id, gymId);
  }

  async delete(id: number, gymId: number, force: boolean = false) {
    const membership = await this.findOne(id, gymId);

    if ((membership.status === 'active' || membership.status === 'pending') && !force) {
      throw new BadRequestException('Cannot delete active or pending memberships. Use force delete.');
    }

    await this.tenantService.executeInTenant(gymId, async (client) => {
      await client.query(`DELETE FROM memberships WHERE id = $1`, [id]);
    });

    return { id, deleted: true };
  }

  async getExpiringSoon(gymId: number, days = 7) {
    const now = new Date();
    const futureDate = new Date();
    futureDate.setDate(futureDate.getDate() + days);

    const memberships = await this.tenantService.executeInTenant(gymId, async (client) => {
      const result = await client.query(
        `SELECT m.*, u.name as user_name, u.email as user_email, u.phone as user_phone,
                p.name as plan_name, p.code as plan_code
         FROM memberships m
         JOIN users u ON u.id = m.user_id
         LEFT JOIN plans p ON p.id = m.plan_id
         WHERE m.status = 'active' AND m.end_date >= $1 AND m.end_date <= $2
         ORDER BY m.end_date ASC`,
        [now, futureDate]
      );
      return result.rows;
    });

    return memberships.map((m: any) => this.formatMembership(m));
  }

  async getStats(gymId: number) {
    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const endOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0);

    const stats = await this.tenantService.executeInTenant(gymId, async (client) => {
      const [activeResult, revenueResult, endingResult, totalRevenueResult] = await Promise.all([
        client.query(`SELECT COUNT(*) as count FROM memberships WHERE status = 'active' AND end_date >= $1`, [now]),
        client.query(`SELECT COALESCE(SUM(final_amount), 0) as sum FROM memberships WHERE payment_status = 'paid' AND paid_at >= $1 AND paid_at <= $2`, [startOfMonth, now]),
        client.query(`SELECT COUNT(*) as count FROM memberships WHERE status = 'active' AND end_date >= $1 AND end_date <= $2`, [now, endOfMonth]),
        client.query(`SELECT COALESCE(SUM(final_amount), 0) as sum FROM memberships WHERE payment_status = 'paid'`),
      ]);

      return {
        totalActiveMembers: parseInt(activeResult.rows[0].count, 10),
        thisMonthRevenue: parseFloat(revenueResult.rows[0].sum),
        endingThisMonth: parseInt(endingResult.rows[0].count, 10),
        totalRevenue: parseFloat(totalRevenueResult.rows[0].sum),
      };
    });

    return stats;
  }

  async getOverview(gymId: number) {
    const [stats, expiringSoon, recentSubscriptions] = await Promise.all([
      this.getStats(gymId),
      this.getExpiringSoon(gymId, 7),
      this.getRecentSubscriptions(gymId, 10),
    ]);

    return {
      stats,
      expiringSoon,
      recentSubscriptions,
    };
  }

  private async getRecentSubscriptions(gymId: number, limit = 10) {
    const memberships = await this.tenantService.executeInTenant(gymId, async (client) => {
      const result = await client.query(
        `SELECT m.*, u.name as user_name, u.email as user_email, u.phone as user_phone,
                p.name as plan_name, p.code as plan_code
         FROM memberships m
         JOIN users u ON u.id = m.user_id
         LEFT JOIN plans p ON p.id = m.plan_id
         ORDER BY m.created_at DESC
         LIMIT $1`,
        [limit]
      );
      return result.rows;
    });

    return memberships.map((m: any) => this.formatMembership(m));
  }

  async renew(userId: number, gymId: number, dto: RenewMembershipDto) {
    const currentMembership = await this.getActiveMembership(userId, gymId);
    const planId = dto.planId || currentMembership?.planId;

    if (!planId) {
      throw new BadRequestException('Plan ID is required for renewal');
    }

    let startDate: Date;
    if (currentMembership && new Date(currentMembership.endDate) > new Date()) {
      startDate = new Date(currentMembership.endDate);
      startDate.setDate(startDate.getDate() + 1);
    } else {
      startDate = new Date();
    }

    return this.create({
      userId,
      planId,
      offerCode: dto.offerCode,
      startDate: startDate.toISOString(),
      paymentMethod: dto.paymentMethod,
      notes: dto.notes,
    }, gymId);
  }

  private calculateEndDate(startDate: Date, durationValue: number, durationType: string): Date {
    const endDate = new Date(startDate);

    switch (durationType) {
      case 'day':
        endDate.setDate(endDate.getDate() + durationValue);
        break;
      case 'month':
        endDate.setMonth(endDate.getMonth() + durationValue);
        break;
      case 'year':
        endDate.setFullYear(endDate.getFullYear() + durationValue);
        break;
      default:
        endDate.setMonth(endDate.getMonth() + durationValue);
    }

    return endDate;
  }
}
