import { Injectable, Logger, NotFoundException, BadRequestException } from '@nestjs/common';
import { TenantService } from '../tenant/tenant.service';
import { LoyaltyService } from '../loyalty/loyalty.service';
import {
  CreateReferralDto,
  UpdateReferralDto,
  ReferralFiltersDto,
} from './dto/referral.dto';
import { SqlValue } from '../common/types';

@Injectable()
export class ReferralsService {
  private readonly logger = new Logger(ReferralsService.name);

  constructor(
    private readonly tenantService: TenantService,
    private readonly loyaltyService: LoyaltyService,
  ) {}

  private generateReferralCode(): string {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    let code = 'REF-';
    for (let i = 0; i < 8; i++) {
      code += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return code;
  }

  private formatReferral(r: Record<string, any>) {
    return {
      id: r.id,
      branchId: r.branch_id,
      referrerId: r.referrer_id,
      referredId: r.referred_id,
      referralCode: r.referral_code,
      status: r.status,
      rewardType: r.reward_type,
      rewardAmount: r.reward_amount,
      notes: r.notes,
      referrerName: r.referrer_name,
      referredName: r.referred_name,
      rewardedAt: r.rewarded_at,
      createdAt: r.created_at,
      updatedAt: r.updated_at,
    };
  }

  async findAll(
    gymId: number,
    branchId: number | null = null,
    filters: ReferralFiltersDto = {},
  ) {
    const page = filters.page || 1;
    const limit = filters.limit || 50;
    const skip = (page - 1) * limit;

    return this.tenantService.executeInTenant(gymId, async (client) => {
      const conditions: string[] = [];
      const values: SqlValue[] = [];
      let paramIndex = 1;

      if (branchId !== null) {
        conditions.push(`r.branch_id = $${paramIndex++}`);
        values.push(branchId);
      }

      if (filters.status) {
        conditions.push(`r.status = $${paramIndex++}`);
        values.push(filters.status);
      }

      if (filters.referrerId) {
        conditions.push(`r.referrer_id = $${paramIndex++}`);
        values.push(filters.referrerId);
      }

      const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

      const countResult = await client.query(
        `SELECT COUNT(*) FROM referrals r ${whereClause}`,
        values,
      );
      const total = parseInt(countResult.rows[0].count);

      const result = await client.query(
        `SELECT r.*,
                referrer.name as referrer_name,
                referred.name as referred_name
         FROM referrals r
         LEFT JOIN users referrer ON referrer.id = r.referrer_id
         LEFT JOIN users referred ON referred.id = r.referred_id
         ${whereClause}
         ORDER BY r.created_at DESC
         LIMIT $${paramIndex++} OFFSET $${paramIndex++}`,
        [...values, limit, skip],
      );

      return {
        data: result.rows.map((r) => this.formatReferral(r)),
        total,
        page,
        limit,
      };
    });
  }

  async findByUser(userId: number, gymId: number) {
    return this.tenantService.executeInTenant(gymId, async (client) => {
      const madeResult = await client.query(
        `SELECT r.*,
                referrer.name as referrer_name,
                referred.name as referred_name
         FROM referrals r
         LEFT JOIN users referrer ON referrer.id = r.referrer_id
         LEFT JOIN users referred ON referred.id = r.referred_id
         WHERE r.referrer_id = $1
         ORDER BY r.created_at DESC`,
        [userId],
      );

      const referredResult = await client.query(
        `SELECT r.*,
                referrer.name as referrer_name,
                referred.name as referred_name
         FROM referrals r
         LEFT JOIN users referrer ON referrer.id = r.referrer_id
         LEFT JOIN users referred ON referred.id = r.referred_id
         WHERE r.referred_id = $1
         ORDER BY r.created_at DESC`,
        [userId],
      );

      return {
        madeByUser: madeResult.rows.map((r) => this.formatReferral(r)),
        referredUser: referredResult.rows.map((r) => this.formatReferral(r)),
      };
    });
  }

  async findOne(id: number, gymId: number) {
    const referral = await this.tenantService.executeInTenant(gymId, async (client) => {
      const result = await client.query(
        `SELECT r.*,
                referrer.name as referrer_name,
                referred.name as referred_name
         FROM referrals r
         LEFT JOIN users referrer ON referrer.id = r.referrer_id
         LEFT JOIN users referred ON referred.id = r.referred_id
         WHERE r.id = $1`,
        [id],
      );
      return result.rows[0];
    });

    if (!referral) {
      throw new NotFoundException(`Referral #${id} not found`);
    }

    return this.formatReferral(referral);
  }

  async create(
    gymId: number,
    branchId: number | null,
    dto: CreateReferralDto,
  ) {
    // Prevent self-referral
    if (dto.referredId && dto.referrerId === dto.referredId) {
      throw new BadRequestException('A member cannot refer themselves');
    }

    const referral = await this.tenantService.executeInTenant(gymId, async (client) => {
      // Auto-generate referral code if not provided
      const referralCode = dto.referralCode || this.generateReferralCode();

      const result = await client.query(
        `INSERT INTO referrals (branch_id, referrer_id, referred_id, referral_code, status, notes)
         VALUES ($1, $2, $3, $4, 'pending', $5)
         RETURNING *`,
        [
          branchId,
          dto.referrerId,
          dto.referredId || null,
          referralCode,
          dto.notes || null,
        ],
      );
      return result.rows[0];
    });

    return this.formatReferral(referral);
  }

  async update(id: number, gymId: number, dto: UpdateReferralDto) {
    await this.findOne(id, gymId);

    const updates: string[] = [];
    const values: SqlValue[] = [];
    let paramIndex = 1;

    if (dto.status !== undefined) {
      updates.push(`status = $${paramIndex++}`);
      values.push(dto.status);
    }
    if (dto.referredId !== undefined) {
      updates.push(`referred_id = $${paramIndex++}`);
      values.push(dto.referredId);
    }
    if (dto.rewardType !== undefined) {
      updates.push(`reward_type = $${paramIndex++}`);
      values.push(dto.rewardType);
    }
    if (dto.rewardAmount !== undefined) {
      updates.push(`reward_amount = $${paramIndex++}`);
      values.push(dto.rewardAmount);
    }
    if (dto.notes !== undefined) {
      updates.push(`notes = $${paramIndex++}`);
      values.push(dto.notes);
    }

    if (updates.length === 0) return this.findOne(id, gymId);

    values.push(id);

    await this.tenantService.executeInTenant(gymId, async (client) => {
      await client.query(
        `UPDATE referrals SET ${updates.join(', ')} WHERE id = $${paramIndex}`,
        values,
      );
    });

    return this.findOne(id, gymId);
  }

  async markRewarded(
    id: number,
    gymId: number,
    rewardType: string,
    rewardAmount: number,
  ) {
    const referral = await this.findOne(id, gymId);

    await this.tenantService.executeInTenant(gymId, async (client) => {
      await client.query(
        `UPDATE referrals
         SET status = 'rewarded', reward_type = $1, reward_amount = $2, rewarded_at = NOW()
         WHERE id = $3`,
        [rewardType, rewardAmount, id],
      );
    });

    // Award loyalty points to referrer (fire-and-forget)
    if (referral.referrerId) {
      this.loyaltyService
        .awardPoints(gymId, referral.referrerId, 'referral', 'referral', id, 'Points for successful referral')
        .catch((err) => this.logger.error('Failed to award loyalty points for referral', err));
    }

    return this.findOne(id, gymId);
  }

  async getStats(gymId: number, branchId: number | null = null) {
    return this.tenantService.executeInTenant(gymId, async (client) => {
      const conditions: string[] = [];
      const values: SqlValue[] = [];
      let paramIndex = 1;

      if (branchId !== null) {
        conditions.push(`branch_id = $${paramIndex++}`);
        values.push(branchId);
      }

      const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

      const result = await client.query(
        `SELECT
           COUNT(*) as total,
           COUNT(*) FILTER (WHERE status = 'pending') as pending_count,
           COUNT(*) FILTER (WHERE status = 'converted') as converted_count,
           COUNT(*) FILTER (WHERE status = 'rewarded') as rewarded_count,
           COALESCE(SUM(reward_amount) FILTER (WHERE status = 'rewarded'), 0) as total_reward_amount
         FROM referrals
         ${whereClause}`,
        values,
      );

      const row = result.rows[0];
      return {
        total: parseInt(row.total),
        pending: parseInt(row.pending_count),
        converted: parseInt(row.converted_count),
        rewarded: parseInt(row.rewarded_count),
        totalRewardAmount: parseFloat(row.total_reward_amount),
      };
    });
  }
}
