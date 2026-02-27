import {
  Injectable,
  NotFoundException,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import { TenantService } from '../tenant/tenant.service';
import { NotificationsService } from '../notifications/notifications.service';
import { NotificationHelperService } from '../notifications/notification-helper.service';
import { NotificationType } from '../notifications/notification-types';
import {
  UpdateLoyaltyConfigDto,
  CreateLoyaltyTierDto,
  UpdateLoyaltyTierDto,
  AdjustPointsDto,
  CreateRewardDto,
  UpdateRewardDto,
  LoyaltyFiltersDto,
} from './dto/loyalty.dto';
import { SqlValue } from '../common/types';

@Injectable()
export class LoyaltyService {
  private readonly logger = new Logger(LoyaltyService.name);

  constructor(
    private readonly tenantService: TenantService,
    private readonly notificationsService: NotificationsService,
    private readonly notificationHelper: NotificationHelperService,
  ) {}

  // ═══════════════════════════════════════════════
  //  Formatters
  // ═══════════════════════════════════════════════

  private formatConfig(row: Record<string, any>) {
    return {
      id: row.id,
      branchId: row.branch_id,
      isEnabled: row.is_enabled,
      pointsPerVisit: row.points_per_visit,
      pointsPerAttendance: row.points_per_visit,
      pointsPerReferral: row.points_per_referral,
      pointsPerPurchaseUnit: row.points_per_purchase_unit
        ? parseFloat(row.points_per_purchase_unit)
        : null,
      pointsPerPurchase: row.points_per_purchase_unit
        ? parseFloat(row.points_per_purchase_unit)
        : null,
      pointsPerClassBooking: row.points_per_class_booking,
      pointExpiryDays: row.point_expiry_days,
      pointsExpiry: row.point_expiry_days,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }

  private formatTier(row: Record<string, any>) {
    return {
      id: row.id,
      branchId: row.branch_id,
      name: row.name,
      minPoints: row.min_points,
      multiplier: row.multiplier ? parseFloat(row.multiplier) : 1,
      benefits: row.benefits,
      icon: row.icon,
      color: row.color,
      displayOrder: row.display_order,
      sortOrder: row.display_order,
      isActive: row.is_active,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }

  private formatPoints(row: Record<string, any>) {
    return {
      id: row.id,
      userId: row.user_id,
      totalEarned: row.total_earned,
      totalRedeemed: row.total_redeemed,
      currentBalance: row.current_balance,
      tierId: row.tier_id,
      tierName: row.tier_name ?? null,
      tierColor: row.tier_color ?? null,
      tierUpdatedAt: row.tier_updated_at,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }

  private formatTransaction(row: Record<string, any>) {
    return {
      id: row.id,
      userId: row.user_id,
      type: row.type,
      points: row.points,
      balanceAfter: row.balance_after,
      source: row.source,
      referenceType: row.reference_type,
      referenceId: row.reference_id,
      description: row.description,
      expiresAt: row.expires_at,
      createdBy: row.created_by,
      createdAt: row.created_at,
    };
  }

  private formatReward(row: Record<string, any>) {
    return {
      id: row.id,
      branchId: row.branch_id,
      name: row.name,
      description: row.description,
      pointsCost: row.points_cost,
      category: row.reward_type,
      rewardType: row.reward_type,
      rewardValue: row.reward_value,
      stock: row.stock,
      maxPerUser: row.max_per_user,
      isActive: row.is_active,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }

  // ═══════════════════════════════════════════════
  //  Config
  // ═══════════════════════════════════════════════

  async getConfig(gymId: number, branchId: number | null) {
    return this.tenantService.executeInTenant(gymId, async (client) => {
      const conditions: string[] = [];
      const values: SqlValue[] = [];
      let paramIndex = 1;

      if (branchId !== null) {
        conditions.push(`(branch_id = $${paramIndex++} OR branch_id IS NULL)`);
        values.push(branchId);
      }

      const whereClause =
        conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

      const result = await client.query(
        `SELECT * FROM loyalty_config ${whereClause} ORDER BY branch_id NULLS FIRST LIMIT 1`,
        values,
      );

      if (result.rows.length === 0) {
        // Return defaults if no config row exists
        return {
          id: null,
          branchId: null,
          isEnabled: true,
          pointsPerVisit: 10,
          pointsPerReferral: 100,
          pointsPerPurchaseUnit: 1,
          pointsPerClassBooking: 5,
          pointExpiryDays: 365,
          createdAt: null,
          updatedAt: null,
        };
      }

      return this.formatConfig(result.rows[0]);
    });
  }

  async updateConfig(
    gymId: number,
    branchId: number | null,
    dto: UpdateLoyaltyConfigDto,
  ) {
    return this.tenantService.executeInTenant(gymId, async (client) => {
      // Upsert: try to find existing config for this branch (or global)
      const existing = await client.query(
        `SELECT id FROM loyalty_config WHERE branch_id IS NOT DISTINCT FROM $1 LIMIT 1`,
        [branchId],
      );

      const setClauses: string[] = [];
      const values: SqlValue[] = [];
      let paramIndex = 1;

      if (dto.isEnabled !== undefined) {
        setClauses.push(`is_enabled = $${paramIndex++}`);
        values.push(dto.isEnabled);
      }
      const perVisit = dto.pointsPerVisit ?? dto.pointsPerAttendance;
      if (perVisit !== undefined) {
        setClauses.push(`points_per_visit = $${paramIndex++}`);
        values.push(perVisit);
      }
      if (dto.pointsPerReferral !== undefined) {
        setClauses.push(`points_per_referral = $${paramIndex++}`);
        values.push(dto.pointsPerReferral);
      }
      const perPurchase = dto.pointsPerPurchaseUnit ?? dto.pointsPerPurchase;
      if (perPurchase !== undefined) {
        setClauses.push(`points_per_purchase_unit = $${paramIndex++}`);
        values.push(perPurchase);
      }
      if (dto.pointsPerClassBooking !== undefined) {
        setClauses.push(`points_per_class_booking = $${paramIndex++}`);
        values.push(dto.pointsPerClassBooking);
      }
      const expiryDays = dto.pointExpiryDays ?? dto.pointsExpiry;
      if (expiryDays !== undefined) {
        setClauses.push(`point_expiry_days = $${paramIndex++}`);
        values.push(expiryDays);
      }

      if (setClauses.length === 0) {
        return this.getConfig(gymId, branchId);
      }

      setClauses.push(`updated_at = CURRENT_TIMESTAMP`);

      let result;
      if (existing.rows.length > 0) {
        values.push(existing.rows[0].id);
        result = await client.query(
          `UPDATE loyalty_config SET ${setClauses.join(', ')} WHERE id = $${paramIndex++} RETURNING *`,
          values,
        );
      } else {
        // Insert new config row
        values.push(branchId);
        result = await client.query(
          `INSERT INTO loyalty_config (${setClauses.map((c) => c.split(' = ')[0]).join(', ')}, branch_id)
           VALUES (${values.slice(0, -1).map((_, i) => `$${i + 1}`).join(', ')}, $${paramIndex++})
           RETURNING *`,
          values,
        );
      }

      return this.formatConfig(result.rows[0]);
    });
  }

  // ═══════════════════════════════════════════════
  //  Tiers
  // ═══════════════════════════════════════════════

  async getTiers(gymId: number, branchId: number | null) {
    return this.tenantService.executeInTenant(gymId, async (client) => {
      const conditions: string[] = [];
      const values: SqlValue[] = [];
      let paramIndex = 1;

      if (branchId !== null) {
        conditions.push(
          `(branch_id = $${paramIndex++} OR branch_id IS NULL)`,
        );
        values.push(branchId);
      }

      const whereClause =
        conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

      const result = await client.query(
        `SELECT * FROM loyalty_tiers ${whereClause} ORDER BY min_points ASC, display_order ASC`,
        values,
      );

      return result.rows.map((r) => this.formatTier(r));
    });
  }

  async createTier(
    gymId: number,
    branchId: number | null,
    dto: CreateLoyaltyTierDto,
  ) {
    return this.tenantService.executeInTenant(gymId, async (client) => {
      const result = await client.query(
        `INSERT INTO loyalty_tiers (branch_id, name, min_points, multiplier, benefits, icon, color, display_order)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
         RETURNING *`,
        [
          branchId,
          dto.name,
          dto.minPoints,
          dto.multiplier ?? 1.0,
          dto.benefits ? JSON.stringify(dto.benefits) : null,
          dto.icon ?? null,
          dto.color ?? null,
          dto.displayOrder ?? dto.sortOrder ?? 0,
        ],
      );

      return this.formatTier(result.rows[0]);
    });
  }

  async updateTier(gymId: number, tierId: number, dto: UpdateLoyaltyTierDto) {
    return this.tenantService.executeInTenant(gymId, async (client) => {
      const setClauses: string[] = [];
      const values: SqlValue[] = [];
      let paramIndex = 1;

      if (dto.name !== undefined) {
        setClauses.push(`name = $${paramIndex++}`);
        values.push(dto.name);
      }
      if (dto.minPoints !== undefined) {
        setClauses.push(`min_points = $${paramIndex++}`);
        values.push(dto.minPoints);
      }
      if (dto.multiplier !== undefined) {
        setClauses.push(`multiplier = $${paramIndex++}`);
        values.push(dto.multiplier);
      }
      if (dto.benefits !== undefined) {
        setClauses.push(`benefits = $${paramIndex++}`);
        values.push(JSON.stringify(dto.benefits));
      }
      if (dto.icon !== undefined) {
        setClauses.push(`icon = $${paramIndex++}`);
        values.push(dto.icon);
      }
      if (dto.color !== undefined) {
        setClauses.push(`color = $${paramIndex++}`);
        values.push(dto.color);
      }
      const displayOrder = dto.displayOrder ?? dto.sortOrder;
      if (displayOrder !== undefined) {
        setClauses.push(`display_order = $${paramIndex++}`);
        values.push(displayOrder);
      }
      if (dto.isActive !== undefined) {
        setClauses.push(`is_active = $${paramIndex++}`);
        values.push(dto.isActive);
      }

      if (setClauses.length === 0) {
        throw new BadRequestException('No fields to update');
      }

      setClauses.push(`updated_at = CURRENT_TIMESTAMP`);
      values.push(tierId);

      const result = await client.query(
        `UPDATE loyalty_tiers SET ${setClauses.join(', ')} WHERE id = $${paramIndex++} RETURNING *`,
        values,
      );

      if (result.rows.length === 0) {
        throw new NotFoundException(`Tier with id ${tierId} not found`);
      }

      return this.formatTier(result.rows[0]);
    });
  }

  async deleteTier(gymId: number, tierId: number) {
    return this.tenantService.executeInTenant(gymId, async (client) => {
      const result = await client.query(
        `DELETE FROM loyalty_tiers WHERE id = $1 RETURNING id`,
        [tierId],
      );

      if (result.rows.length === 0) {
        throw new NotFoundException(`Tier with id ${tierId} not found`);
      }

      return { deleted: true, id: tierId };
    });
  }

  // ═══════════════════════════════════════════════
  //  Points
  // ═══════════════════════════════════════════════

  async getMyPoints(userId: number, gymId: number) {
    return this.tenantService.executeInTenant(gymId, async (client) => {
      const result = await client.query(
        `SELECT lp.*, lt.name as tier_name, lt.color as tier_color
         FROM loyalty_points lp
         LEFT JOIN loyalty_tiers lt ON lt.id = lp.tier_id
         WHERE lp.user_id = $1`,
        [userId],
      );

      if (result.rows.length === 0) {
        return {
          id: null,
          userId,
          totalEarned: 0,
          totalRedeemed: 0,
          currentBalance: 0,
          tierId: null,
          tierName: null,
          tierColor: null,
          tierUpdatedAt: null,
          createdAt: null,
          updatedAt: null,
        };
      }

      return this.formatPoints(result.rows[0]);
    });
  }

  async getUserPoints(userId: number, gymId: number) {
    return this.getMyPoints(userId, gymId);
  }

  async getLeaderboard(
    gymId: number,
    branchId: number | null,
    limit: number = 20,
  ) {
    return this.tenantService.executeInTenant(gymId, async (client) => {
      const conditions: string[] = [];
      const values: SqlValue[] = [];
      let paramIndex = 1;

      if (branchId !== null) {
        conditions.push(`u.branch_id = $${paramIndex++}`);
        values.push(branchId);
      }

      const whereClause =
        conditions.length > 0
          ? `WHERE ${conditions.join(' AND ')}`
          : '';

      values.push(limit);

      const result = await client.query(
        `SELECT lp.user_id, lp.total_earned, lp.current_balance,
                u.name as user_name, u.avatar_url,
                lt.name as tier_name, lt.color as tier_color
         FROM loyalty_points lp
         LEFT JOIN users u ON u.id = lp.user_id
         LEFT JOIN loyalty_tiers lt ON lt.id = lp.tier_id
         ${whereClause}
         ORDER BY lp.total_earned DESC
         LIMIT $${paramIndex++}`,
        values,
      );

      return result.rows.map((r, index) => ({
        rank: index + 1,
        userId: r.user_id,
        userName: r.user_name,
        avatarUrl: r.avatar_url,
        totalEarned: r.total_earned,
        currentBalance: r.current_balance,
        tierName: r.tier_name,
        tierColor: r.tier_color,
      }));
    });
  }

  async adjustPoints(gymId: number, dto: AdjustPointsDto, adminUserId: number) {
    return this.tenantService.executeInTenant(gymId, async (client) => {
      // Ensure loyalty_points row exists
      await client.query(
        `INSERT INTO loyalty_points (user_id) VALUES ($1)
         ON CONFLICT (user_id) DO NOTHING`,
        [dto.userId],
      );

      const type = dto.points >= 0 ? 'earn' : 'redeem';
      const absPoints = Math.abs(dto.points);

      if (type === 'earn') {
        await client.query(
          `UPDATE loyalty_points
           SET total_earned = total_earned + $1,
               current_balance = current_balance + $1,
               updated_at = CURRENT_TIMESTAMP
           WHERE user_id = $2`,
          [absPoints, dto.userId],
        );
      } else {
        // Check balance for deduction
        const balanceResult = await client.query(
          `SELECT current_balance FROM loyalty_points WHERE user_id = $1`,
          [dto.userId],
        );
        const currentBalance = balanceResult.rows[0]?.current_balance ?? 0;
        if (currentBalance < absPoints) {
          throw new BadRequestException(
            `Insufficient balance. Current: ${currentBalance}, requested deduction: ${absPoints}`,
          );
        }

        await client.query(
          `UPDATE loyalty_points
           SET total_redeemed = total_redeemed + $1,
               current_balance = current_balance - $1,
               updated_at = CURRENT_TIMESTAMP
           WHERE user_id = $2`,
          [absPoints, dto.userId],
        );
      }

      // Get updated balance for transaction record
      const updatedBalance = await client.query(
        `SELECT current_balance FROM loyalty_points WHERE user_id = $1`,
        [dto.userId],
      );
      const balanceAfter = updatedBalance.rows[0].current_balance;

      // Insert transaction
      const txResult = await client.query(
        `INSERT INTO loyalty_transactions (user_id, type, points, balance_after, source, description, created_by)
         VALUES ($1, $2, $3, $4, 'admin_adjust', $5, $6)
         RETURNING *`,
        [dto.userId, type, absPoints, balanceAfter, dto.description, adminUserId],
      );

      // Check tier upgrade
      await this.checkAndUpdateTier(client, dto.userId);

      return this.formatTransaction(txResult.rows[0]);
    });
  }

  // ═══════════════════════════════════════════════
  //  Core: awardPoints
  // ═══════════════════════════════════════════════

  async awardPoints(
    gymId: number,
    userId: number,
    source: string,
    referenceType: string | null,
    referenceId: number | null,
    description?: string,
  ) {
    const result = await this.tenantService.executeInTenant(gymId, async (client) => {
      // Get config
      const configResult = await client.query(
        `SELECT * FROM loyalty_config ORDER BY branch_id NULLS FIRST LIMIT 1`,
      );

      let basePoints = 0;
      let expiryDays = 365;

      if (configResult.rows.length > 0) {
        const config = configResult.rows[0];
        if (!config.is_enabled) {
          return null; // Loyalty program disabled
        }
        expiryDays = config.point_expiry_days ?? 365;

        switch (source) {
          case 'visit':
            basePoints = config.points_per_visit ?? 10;
            break;
          case 'referral':
            basePoints = config.points_per_referral ?? 100;
            break;
          case 'purchase':
            basePoints = config.points_per_purchase_unit
              ? parseFloat(config.points_per_purchase_unit)
              : 1;
            break;
          case 'class_booking':
            basePoints = config.points_per_class_booking ?? 5;
            break;
          default:
            basePoints = 0;
        }
      } else {
        // Default points if no config
        switch (source) {
          case 'visit':
            basePoints = 10;
            break;
          case 'referral':
            basePoints = 100;
            break;
          case 'purchase':
            basePoints = 1;
            break;
          case 'class_booking':
            basePoints = 5;
            break;
          default:
            basePoints = 0;
        }
      }

      if (basePoints <= 0) {
        return null;
      }

      // Ensure loyalty_points row exists
      await client.query(
        `INSERT INTO loyalty_points (user_id) VALUES ($1)
         ON CONFLICT (user_id) DO NOTHING`,
        [userId],
      );

      // Get user's current tier multiplier
      const tierResult = await client.query(
        `SELECT lt.multiplier
         FROM loyalty_points lp
         LEFT JOIN loyalty_tiers lt ON lt.id = lp.tier_id
         WHERE lp.user_id = $1`,
        [userId],
      );
      const multiplier =
        tierResult.rows[0]?.multiplier
          ? parseFloat(tierResult.rows[0].multiplier)
          : 1.0;

      const finalPoints = Math.round(basePoints * multiplier);

      // Update balance
      await client.query(
        `UPDATE loyalty_points
         SET total_earned = total_earned + $1,
             current_balance = current_balance + $1,
             updated_at = CURRENT_TIMESTAMP
         WHERE user_id = $2`,
        [finalPoints, userId],
      );

      // Get updated balance
      const updatedBalance = await client.query(
        `SELECT current_balance FROM loyalty_points WHERE user_id = $1`,
        [userId],
      );
      const balanceAfter = updatedBalance.rows[0].current_balance;

      // Calculate expiry date
      const expiresAt = new Date();
      expiresAt.setDate(expiresAt.getDate() + expiryDays);

      // Insert transaction
      const txResult = await client.query(
        `INSERT INTO loyalty_transactions (user_id, type, points, balance_after, source, reference_type, reference_id, description, expires_at)
         VALUES ($1, 'earn', $2, $3, $4, $5, $6, $7, $8)
         RETURNING *`,
        [
          userId,
          finalPoints,
          balanceAfter,
          source,
          referenceType,
          referenceId,
          description ?? `Earned ${finalPoints} points from ${source}`,
          expiresAt,
        ],
      );

      // Check tier upgrade
      const tierChange = await this.checkAndUpdateTier(client, userId);

      return {
        transaction: this.formatTransaction(txResult.rows[0]),
        _notif: { finalPoints, source, tierChange },
      };
    });

    if (!result) return null;

    // Send notifications after transaction committed
    try {
      await this.notificationsService.notifyPointsEarned(
        userId, gymId, null,
        { points: result._notif.finalPoints, source: result._notif.source, balance: 0 },
      );
    } catch { /* notifications are non-critical */ }

    if (result._notif.tierChange) {
      try {
        await this.notificationsService.notifyTierUpgraded(
          userId, gymId, null, { tierName: result._notif.tierChange.newTierName },
        );
      } catch { /* notifications are non-critical */ }
    }

    return result.transaction;
  }

  /**
   * Check if the user's total_earned qualifies for a higher tier, and upgrade if so.
   * Returns tier change info if upgraded, null otherwise.
   */
  private async checkAndUpdateTier(
    client: any,
    userId: number,
  ): Promise<{ oldTierId: number | null; newTierId: number; newTierName: string } | null> {
    // Get user's total earned
    const pointsResult = await client.query(
      `SELECT total_earned, tier_id FROM loyalty_points WHERE user_id = $1`,
      [userId],
    );

    if (pointsResult.rows.length === 0) return null;

    const { total_earned, tier_id: currentTierId } = pointsResult.rows[0];

    // Get the highest qualifying tier
    const tierResult = await client.query(
      `SELECT id, name FROM loyalty_tiers
       WHERE min_points <= $1 AND is_active = TRUE
       ORDER BY min_points DESC
       LIMIT 1`,
      [total_earned],
    );

    const newTierId = tierResult.rows.length > 0 ? tierResult.rows[0].id : null;

    if (newTierId !== currentTierId) {
      await client.query(
        `UPDATE loyalty_points
         SET tier_id = $1, tier_updated_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
         WHERE user_id = $2`,
        [newTierId, userId],
      );

      // Only return upgrade info when moving to a higher tier (not downgrade/removal)
      if (newTierId !== null && (currentTierId === null || newTierId !== currentTierId)) {
        return {
          oldTierId: currentTierId,
          newTierId,
          newTierName: tierResult.rows[0].name,
        };
      }
    }

    return null;
  }

  // ═══════════════════════════════════════════════
  //  Transactions
  // ═══════════════════════════════════════════════

  async getMyTransactions(
    userId: number,
    gymId: number,
    filters: LoyaltyFiltersDto = {},
  ) {
    return this.getTransactionsForUser(userId, gymId, filters);
  }

  async getUserTransactions(
    userId: number,
    gymId: number,
    filters: LoyaltyFiltersDto = {},
  ) {
    return this.getTransactionsForUser(userId, gymId, filters);
  }

  private async getTransactionsForUser(
    userId: number,
    gymId: number,
    filters: LoyaltyFiltersDto,
  ) {
    const page = filters.page || 1;
    const limit = filters.limit || 50;
    const skip = (page - 1) * limit;

    return this.tenantService.executeInTenant(gymId, async (client) => {
      const countResult = await client.query(
        `SELECT COUNT(*) FROM loyalty_transactions WHERE user_id = $1`,
        [userId],
      );
      const total = parseInt(countResult.rows[0].count);

      const result = await client.query(
        `SELECT * FROM loyalty_transactions
         WHERE user_id = $1
         ORDER BY created_at DESC
         LIMIT $2 OFFSET $3`,
        [userId, limit, skip],
      );

      return {
        data: result.rows.map((r) => this.formatTransaction(r)),
        total,
        page,
        limit,
      };
    });
  }

  // ═══════════════════════════════════════════════
  //  Rewards
  // ═══════════════════════════════════════════════

  async getRewards(gymId: number, branchId: number | null) {
    return this.tenantService.executeInTenant(gymId, async (client) => {
      const conditions: string[] = ['is_deleted = FALSE'];
      const values: SqlValue[] = [];
      let paramIndex = 1;

      if (branchId !== null) {
        conditions.push(
          `(branch_id = $${paramIndex++} OR branch_id IS NULL)`,
        );
        values.push(branchId);
      }

      const result = await client.query(
        `SELECT * FROM loyalty_rewards
         WHERE ${conditions.join(' AND ')}
         ORDER BY points_cost ASC, name ASC`,
        values,
      );

      return result.rows.map((r) => this.formatReward(r));
    });
  }

  async createReward(
    gymId: number,
    branchId: number | null,
    dto: CreateRewardDto,
  ) {
    return this.tenantService.executeInTenant(gymId, async (client) => {
      const rewardType = dto.rewardType || dto.category || 'custom';

      const result = await client.query(
        `INSERT INTO loyalty_rewards (branch_id, name, description, points_cost, reward_type, reward_value, stock, max_per_user)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
         RETURNING *`,
        [
          branchId,
          dto.name,
          dto.description ?? null,
          dto.pointsCost,
          rewardType,
          dto.rewardValue ? JSON.stringify(dto.rewardValue) : null,
          dto.stock ?? null,
          dto.maxPerUser ?? null,
        ],
      );

      return this.formatReward(result.rows[0]);
    });
  }

  async updateReward(gymId: number, rewardId: number, dto: UpdateRewardDto) {
    return this.tenantService.executeInTenant(gymId, async (client) => {
      const setClauses: string[] = [];
      const values: SqlValue[] = [];
      let paramIndex = 1;

      if (dto.name !== undefined) {
        setClauses.push(`name = $${paramIndex++}`);
        values.push(dto.name);
      }
      if (dto.description !== undefined) {
        setClauses.push(`description = $${paramIndex++}`);
        values.push(dto.description);
      }
      if (dto.pointsCost !== undefined) {
        setClauses.push(`points_cost = $${paramIndex++}`);
        values.push(dto.pointsCost);
      }
      const rewardType = dto.rewardType ?? dto.category;
      if (rewardType !== undefined) {
        setClauses.push(`reward_type = $${paramIndex++}`);
        values.push(rewardType);
      }
      if (dto.rewardValue !== undefined) {
        setClauses.push(`reward_value = $${paramIndex++}`);
        values.push(JSON.stringify(dto.rewardValue));
      }
      if (dto.stock !== undefined) {
        setClauses.push(`stock = $${paramIndex++}`);
        values.push(dto.stock);
      }
      if (dto.maxPerUser !== undefined) {
        setClauses.push(`max_per_user = $${paramIndex++}`);
        values.push(dto.maxPerUser);
      }
      if (dto.isActive !== undefined) {
        setClauses.push(`is_active = $${paramIndex++}`);
        values.push(dto.isActive);
      }

      if (setClauses.length === 0) {
        throw new BadRequestException('No fields to update');
      }

      setClauses.push(`updated_at = CURRENT_TIMESTAMP`);
      values.push(rewardId);

      const result = await client.query(
        `UPDATE loyalty_rewards SET ${setClauses.join(', ')}
         WHERE id = $${paramIndex++} AND is_deleted = FALSE
         RETURNING *`,
        values,
      );

      if (result.rows.length === 0) {
        throw new NotFoundException(`Reward with id ${rewardId} not found`);
      }

      return this.formatReward(result.rows[0]);
    });
  }

  async softDeleteReward(gymId: number, rewardId: number) {
    return this.tenantService.executeInTenant(gymId, async (client) => {
      const result = await client.query(
        `UPDATE loyalty_rewards
         SET is_deleted = TRUE, deleted_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
         WHERE id = $1 AND is_deleted = FALSE
         RETURNING id`,
        [rewardId],
      );

      if (result.rows.length === 0) {
        throw new NotFoundException(`Reward with id ${rewardId} not found`);
      }

      return { deleted: true, id: rewardId };
    });
  }

  async redeemReward(rewardId: number, userId: number, gymId: number) {
    const result = await this.tenantService.executeInTenant(gymId, async (client) => {
      // Get reward
      const rewardResult = await client.query(
        `SELECT r.*, u.branch_id AS user_branch_id FROM loyalty_rewards r
         LEFT JOIN users u ON u.id = $2
         WHERE r.id = $1 AND r.is_deleted = FALSE AND r.is_active = TRUE`,
        [rewardId, userId],
      );

      if (rewardResult.rows.length === 0) {
        throw new NotFoundException('Reward not found or inactive');
      }

      const reward = rewardResult.rows[0];

      // Check stock
      if (reward.stock !== null && reward.stock <= 0) {
        throw new BadRequestException('Reward is out of stock');
      }

      // Check max per user
      if (reward.max_per_user !== null) {
        const userRedemptions = await client.query(
          `SELECT COUNT(*) FROM loyalty_transactions
           WHERE user_id = $1 AND type = 'redeem' AND source = 'reward_redeem' AND reference_id = $2`,
          [userId, rewardId],
        );
        const count = parseInt(userRedemptions.rows[0].count);
        if (count >= reward.max_per_user) {
          throw new BadRequestException(
            `Maximum redemptions (${reward.max_per_user}) reached for this reward`,
          );
        }
      }

      // Ensure loyalty_points row exists
      await client.query(
        `INSERT INTO loyalty_points (user_id) VALUES ($1)
         ON CONFLICT (user_id) DO NOTHING`,
        [userId],
      );

      // Check balance
      const balanceResult = await client.query(
        `SELECT current_balance FROM loyalty_points WHERE user_id = $1`,
        [userId],
      );
      const currentBalance = balanceResult.rows[0]?.current_balance ?? 0;

      if (currentBalance < reward.points_cost) {
        throw new BadRequestException(
          `Insufficient balance. Current: ${currentBalance}, required: ${reward.points_cost}`,
        );
      }

      // Deduct points
      await client.query(
        `UPDATE loyalty_points
         SET total_redeemed = total_redeemed + $1,
             current_balance = current_balance - $1,
             updated_at = CURRENT_TIMESTAMP
         WHERE user_id = $2`,
        [reward.points_cost, userId],
      );

      // Decrement stock if applicable
      if (reward.stock !== null) {
        await client.query(
          `UPDATE loyalty_rewards SET stock = stock - 1, updated_at = CURRENT_TIMESTAMP WHERE id = $1`,
          [rewardId],
        );
      }

      // Get updated balance
      const updatedBalance = await client.query(
        `SELECT current_balance FROM loyalty_points WHERE user_id = $1`,
        [userId],
      );
      const balanceAfter = updatedBalance.rows[0].current_balance;

      // Create redeem transaction
      const txResult = await client.query(
        `INSERT INTO loyalty_transactions (user_id, type, points, balance_after, source, reference_type, reference_id, description)
         VALUES ($1, 'redeem', $2, $3, 'reward_redeem', 'loyalty_rewards', $4, $5)
         RETURNING *`,
        [
          userId,
          reward.points_cost,
          balanceAfter,
          rewardId,
          `Redeemed reward: ${reward.name}`,
        ],
      );

      return {
        transaction: this.formatTransaction(txResult.rows[0]),
        reward: this.formatReward(reward),
        _notif: {
          rewardName: reward.name,
          pointsSpent: reward.points_cost,
          branchId: reward.user_branch_id ?? reward.branch_id,
        },
      };
    });

    // Notify user about reward redemption
    try {
      await this.notificationsService.notifyRewardRedeemed(
        userId, gymId, result._notif.branchId,
        { rewardId: rewardId, rewardName: result._notif.rewardName, pointsSpent: result._notif.pointsSpent },
      );
    } catch { /* notifications are non-critical */ }

    // Notify staff about the redemption
    try {
      await this.notificationHelper.notifyStaff(gymId, result._notif.branchId, {
        type: NotificationType.REWARD_REDEEMED,
        title: 'Reward Redeemed',
        message: `A member redeemed "${result._notif.rewardName}" for ${result._notif.pointsSpent} points.`,
        actionUrl: '/loyalty',
      }, { excludeUserId: userId });
    } catch { /* notifications are non-critical */ }

    return {
      transaction: result.transaction,
      reward: result.reward,
    };
  }

  // ═══════════════════════════════════════════════
  //  Dashboard
  // ═══════════════════════════════════════════════

  async getDashboard(gymId: number, branchId: number | null) {
    return this.tenantService.executeInTenant(gymId, async (client) => {
      // Total points outstanding
      const outstandingResult = await client.query(
        `SELECT COALESCE(SUM(current_balance), 0) as total_outstanding,
                COALESCE(SUM(total_earned), 0) as total_earned,
                COALESCE(SUM(total_redeemed), 0) as total_redeemed,
                COUNT(*) as total_members
         FROM loyalty_points`,
      );
      const outstanding = outstandingResult.rows[0];

      // Redemption rate
      const totalEarned = parseInt(outstanding.total_earned) || 0;
      const totalRedeemed = parseInt(outstanding.total_redeemed) || 0;
      const redemptionRate =
        totalEarned > 0
          ? Math.round((totalRedeemed / totalEarned) * 10000) / 100
          : 0;

      // Tier distribution
      const tierDistResult = await client.query(
        `SELECT lt.name as tier_name, lt.color as tier_color, COUNT(lp.id) as count
         FROM loyalty_tiers lt
         LEFT JOIN loyalty_points lp ON lp.tier_id = lt.id
         WHERE lt.is_active = TRUE
         GROUP BY lt.id, lt.name, lt.color
         ORDER BY lt.min_points ASC`,
      );

      const tierDistribution = tierDistResult.rows.map((r) => ({
        tierName: r.tier_name,
        tierColor: r.tier_color,
        count: parseInt(r.count),
      }));

      // Top earners
      const topEarnersResult = await client.query(
        `SELECT lp.user_id, lp.total_earned, lp.current_balance,
                u.name as user_name,
                lt.name as tier_name
         FROM loyalty_points lp
         LEFT JOIN users u ON u.id = lp.user_id
         LEFT JOIN loyalty_tiers lt ON lt.id = lp.tier_id
         ORDER BY lp.total_earned DESC
         LIMIT 10`,
      );

      const topEarners = topEarnersResult.rows.map((r) => ({
        userId: r.user_id,
        userName: r.user_name,
        totalEarned: r.total_earned,
        currentBalance: r.current_balance,
        tierName: r.tier_name,
      }));

      // Recent transactions count (last 30 days)
      const recentTxResult = await client.query(
        `SELECT
           COUNT(*) FILTER (WHERE type = 'earn') as recent_earn_count,
           COUNT(*) FILTER (WHERE type = 'redeem') as recent_redeem_count,
           COALESCE(SUM(points) FILTER (WHERE type = 'earn'), 0) as recent_points_earned,
           COALESCE(SUM(points) FILTER (WHERE type = 'redeem'), 0) as recent_points_redeemed
         FROM loyalty_transactions
         WHERE created_at >= NOW() - INTERVAL '30 days'`,
      );
      const recentTx = recentTxResult.rows[0];

      return {
        totalOutstanding: parseInt(outstanding.total_outstanding),
        totalEarned,
        totalRedeemed,
        totalMembers: parseInt(outstanding.total_members),
        redemptionRate,
        tierDistribution,
        topEarners,
        recentActivity: {
          earnCount: parseInt(recentTx.recent_earn_count),
          redeemCount: parseInt(recentTx.recent_redeem_count),
          pointsEarned: parseInt(recentTx.recent_points_earned),
          pointsRedeemed: parseInt(recentTx.recent_points_redeemed),
        },
      };
    });
  }

  // ═══════════════════════════════════════════════
  //  Scheduler Helpers (called from LoyaltyScheduler)
  // ═══════════════════════════════════════════════

  async expireOldPoints(gymId: number): Promise<number> {
    return this.tenantService.executeInTenant(gymId, async (client) => {
      // Batch expire: find expired transactions, update balances, insert expire records in one CTE
      const result = await client.query(
        `WITH expired AS (
           SELECT lt.id, lt.user_id, lt.points
           FROM loyalty_transactions lt
           WHERE lt.type = 'earn'
             AND lt.expires_at IS NOT NULL
             AND lt.expires_at < NOW()
             AND NOT EXISTS (
               SELECT 1 FROM loyalty_transactions lt2
               WHERE lt2.type = 'expire'
                 AND lt2.reference_type = 'loyalty_transactions'
                 AND lt2.reference_id = lt.id
             )
         ),
         expired_per_user AS (
           SELECT user_id, SUM(points) AS total_points
           FROM expired
           GROUP BY user_id
         ),
         updated_balances AS (
           UPDATE loyalty_points lp
           SET current_balance = GREATEST(lp.current_balance - epu.total_points, 0),
               updated_at = CURRENT_TIMESTAMP
           FROM expired_per_user epu
           WHERE lp.user_id = epu.user_id
           RETURNING lp.user_id, lp.current_balance
         ),
         inserted_txns AS (
           INSERT INTO loyalty_transactions (user_id, type, points, balance_after, source, reference_type, reference_id, description)
           SELECT e.user_id, 'expire', e.points,
                  COALESCE(ub.current_balance, 0),
                  'system_expiry', 'loyalty_transactions', e.id, 'Points expired'
           FROM expired e
           LEFT JOIN updated_balances ub ON ub.user_id = e.user_id
           RETURNING points
         )
         SELECT COALESCE(SUM(points), 0) AS total_expired FROM inserted_txns`,
      );

      return parseInt(result.rows[0].total_expired) || 0;
    });
  }

  async recalculateTiers(gymId: number): Promise<number> {
    return this.tenantService.executeInTenant(gymId, async (client) => {
      // Single UPDATE with lateral join to find correct tier for each user
      const result = await client.query(
        `UPDATE loyalty_points lp
         SET tier_id = best_tier.id,
             tier_updated_at = CURRENT_TIMESTAMP,
             updated_at = CURRENT_TIMESTAMP
         FROM (
           SELECT lp2.user_id,
                  (SELECT lt.id FROM loyalty_tiers lt
                   WHERE lt.min_points <= lp2.total_earned AND lt.is_active = TRUE
                   ORDER BY lt.min_points DESC LIMIT 1) AS id
           FROM loyalty_points lp2
         ) best_tier
         WHERE lp.user_id = best_tier.user_id
           AND lp.tier_id IS DISTINCT FROM best_tier.id`,
      );

      return result.rowCount ?? 0;
    });
  }
}
