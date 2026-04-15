import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ConflictException,
} from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';
import { TenantService } from '../tenant/tenant.service';
import { NotificationHelperService } from '../notifications/notification-helper.service';
import { NotificationsService } from '../notifications/notifications.service';
import { NotificationType } from '../notifications/notification-types';
import { PaymentsService } from '../payments/payments.service';
import { ActivityLogsService } from '../activity-logs/activity-logs.service';
import {
  CreateMembershipDto,
  UpdateMembershipDto,
  CancelMembershipDto,
  RenewMembershipDto,
  RecordPaymentDto,
} from './dto/membership.dto';
import { SqlValue } from '../common/types';
import { sanitizePagination } from '../common/pagination.util';
import { PoolClient } from 'pg';

@Injectable()
export class MembershipsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tenantService: TenantService,
    private readonly notificationHelper: NotificationHelperService,
    private readonly notificationsService: NotificationsService,
    private readonly paymentsService: PaymentsService,
    private readonly activityLogsService: ActivityLogsService,
  ) {}

  async findAll(
    gymId: number,
    filters?: {
      status?: string;
      userId?: number;
      planId?: number;
      search?: string;
      page?: number;
      limit?: number;
      branchId?: number | null;
    },
  ) {
    const { page, limit, skip } = sanitizePagination(filters?.page, filters?.limit, 15);

    const { memberships, total } = await this.tenantService.executeInTenant(
      gymId,
      async (client) => {
        // Start with soft delete filter
        let whereClause = '(m.is_deleted = FALSE OR m.is_deleted IS NULL)';
        const values: SqlValue[] = [];
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
        if (filters?.branchId) {
          whereClause += ` AND (m.branch_id = $${paramIndex++} OR m.branch_id IS NULL)`;
          values.push(filters.branchId);
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
            [...values, limit, skip],
          ),
          client.query(
            `SELECT COUNT(*) as count FROM memberships m
           JOIN users u ON u.id = m.user_id
           WHERE ${whereClause}`,
            values,
          ),
        ]);

        return {
          memberships: membershipsResult.rows,
          total: parseInt(countResult.rows[0].count, 10),
        };
      },
    );

    return {
      data: memberships.map((m: Record<string, any>) => this.formatMembership(m)),
      pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
    };
  }

  /**
   * Log a snapshot of the membership into the membership_history table.
   */
  private async logToHistory(
    client: PoolClient,
    membership: Record<string, any>,
    archiveReason: string,
  ): Promise<void> {
    await client.query(
      `INSERT INTO membership_history (
        original_id, user_id, plan_id, offer_id,
        start_date, end_date, status,
        original_amount, discount_amount, final_amount, currency,
        payment_status, payment_method, payment_ref, paid_at,
        cancelled_at, cancel_reason, notes,
        archive_reason, original_created_at
      ) VALUES (
        $1, $2, $3, $4,
        $5, $6, $7,
        $8, $9, $10, $11,
        $12, $13, $14, $15,
        $16, $17, $18,
        $19, $20
      )`,
      [
        membership.id,
        membership.user_id,
        membership.plan_id,
        membership.offer_id ?? null,
        membership.start_date,
        membership.end_date,
        membership.status,
        membership.original_amount ?? null,
        membership.discount_amount ?? null,
        membership.final_amount ?? null,
        membership.currency ?? null,
        membership.payment_status ?? null,
        membership.payment_method ?? null,
        membership.payment_ref ?? null,
        membership.paid_at ?? null,
        membership.cancelled_at ?? null,
        membership.cancel_reason ?? null,
        membership.notes ?? null,
        archiveReason,
        membership.created_at ?? null,
      ],
    );
  }

  async getAuditLog(userId: number, gymId: number, limit: number = 50) {
    return this.tenantService.executeInTenant(gymId, async (client) => {
      const result = await client.query(
        `SELECT mh.*, p.name as plan_name, p.code as plan_code
         FROM membership_history mh
         LEFT JOIN plans p ON p.id = mh.plan_id
         WHERE mh.user_id = $1
         ORDER BY mh.created_at DESC
         LIMIT $2`,
        [userId, limit],
      );
      return result.rows.map((r: Record<string, any>) => ({
        id: r.id,
        originalId: r.original_id,
        userId: r.user_id,
        planId: r.plan_id,
        planName: r.plan_name,
        planCode: r.plan_code,
        status: r.status,
        originalAmount: parseFloat(r.original_amount || '0'),
        discountAmount: parseFloat(r.discount_amount || '0'),
        finalAmount: parseFloat(r.final_amount || '0'),
        currency: r.currency,
        paymentStatus: r.payment_status,
        paymentMethod: r.payment_method,
        startDate: r.start_date,
        endDate: r.end_date,
        cancelledAt: r.cancelled_at,
        cancelReason: r.cancel_reason,
        notes: r.notes,
        archiveReason: r.archive_reason,
        archivedAt: r.archived_at,
        originalCreatedAt: r.original_created_at,
        createdAt: r.created_at,
      }));
    });
  }

  private formatMembership(m: Record<string, any>) {
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
      cancellationReasonCode: m.cancellation_reason_code,
      autoRenew: m.auto_renew,
      freezeStartDate: m.freeze_start_date,
      freezeEndDate: m.freeze_end_date,
      freezeReason: m.freeze_reason,
      totalFreezeDays: m.total_freeze_days,
      notes: m.notes,
      createdAt: m.created_at,
      updatedAt: m.updated_at,
      user: m.user_name
        ? {
            id: m.user_id,
            name: m.user_name,
            email: m.user_email,
            phone: m.user_phone,
          }
        : undefined,
      plan: m.plan_name
        ? {
            id: m.plan_id,
            name: m.plan_name,
            code: m.plan_code,
            price: m.plan_price,
          }
        : undefined,
      offer: m.offer_name
        ? {
            id: m.offer_id,
            code: m.offer_code,
            name: m.offer_name,
          }
        : undefined,
    };
  }

  async findOne(id: number, gymId: number) {
    const membership = await this.tenantService.executeInTenant(
      gymId,
      async (client) => {
        let query = `SELECT m.*, u.id as user_id, u.name as user_name, u.email as user_email, u.phone as user_phone, u.avatar as user_avatar,
                p.id as plan_id, p.name as plan_name, p.code as plan_code, p.price as plan_price,
                o.id as offer_id, o.code as offer_code, o.name as offer_name
         FROM memberships m
         JOIN users u ON u.id = m.user_id
         LEFT JOIN plans p ON p.id = m.plan_id
         LEFT JOIN offers o ON o.id = m.offer_id
         WHERE m.id = $1 AND (m.is_deleted = FALSE OR m.is_deleted IS NULL)`;
        const values: SqlValue[] = [id];

        const result = await client.query(query, values);
        return result.rows[0];
      },
    );

    if (!membership) {
      throw new NotFoundException(`Membership with ID ${id} not found`);
    }

    return this.formatMembership(membership);
  }

  async findByUser(
    userId: number,
    gymId: number,
  ) {
    const memberships = await this.tenantService.executeInTenant(
      gymId,
      async (client) => {
        let query = `SELECT m.*, p.id as plan_id, p.name as plan_name, p.code as plan_code,
                o.id as offer_id, o.code as offer_code, o.name as offer_name
         FROM memberships m
         LEFT JOIN plans p ON p.id = m.plan_id
         LEFT JOIN offers o ON o.id = m.offer_id
         WHERE m.user_id = $1 AND (m.is_deleted = FALSE OR m.is_deleted IS NULL)`;
        const values: SqlValue[] = [userId];

        query += ` ORDER BY m.created_at DESC`;

        const result = await client.query(query, values);
        return result.rows;
      },
    );

    return memberships.map((m: Record<string, any>) => this.formatMembership(m));
  }

  async getHistory(
    userId: number,
    gymId: number,
    options?: { page?: number; limit?: number },
  ) {
    const { page, limit, skip } = sanitizePagination(options?.page, options?.limit, 15);

    const { memberships, total } = await this.tenantService.executeInTenant(
      gymId,
      async (client) => {
        let whereClause = 'm.user_id = $1';
        const values: SqlValue[] = [userId];
        let paramIndex = 2;

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
            [...values, limit, skip],
          ),
          client.query(
            `SELECT COUNT(*) as count FROM memberships m WHERE ${whereClause}`,
            values,
          ),
        ]);

        return {
          memberships: membershipsResult.rows,
          total: parseInt(countResult.rows[0].count, 10),
        };
      },
    );

    return {
      data: memberships.map((m: Record<string, any>) => this.formatMembership(m)),
      pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
    };
  }

  async getActiveMembership(userId: number, gymId: number) {
    const now = new Date();

    const membership = await this.tenantService.executeInTenant(
      gymId,
      async (client) => {
        const result = await client.query(
          `SELECT m.*, p.id as plan_id, p.name as plan_name, p.code as plan_code, p.price as plan_price,
                o.id as offer_id, o.code as offer_code, o.name as offer_name
         FROM memberships m
         LEFT JOIN plans p ON p.id = m.plan_id
         LEFT JOIN offers o ON o.id = m.offer_id
         WHERE m.user_id = $1 AND m.status = 'active' AND m.start_date <= $2 AND m.end_date >= $2
           AND (m.is_deleted = FALSE OR m.is_deleted IS NULL)
         LIMIT 1`,
          [userId, now],
        );
        return result.rows[0];
      },
    );

    return membership ? this.formatMembership(membership) : null;
  }

  async checkMembershipStatus(userId: number, gymId: number) {
    const active = await this.getActiveMembership(userId, gymId);

    if (!active) {
      return { hasActiveMembership: false, membership: null, daysRemaining: 0 };
    }

    const now = new Date();
    const endDate = new Date(active.endDate);
    const daysRemaining = Math.ceil(
      (endDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24),
    );

    return {
      hasActiveMembership: true,
      membership: active,
      daysRemaining,
      isExpiringSoon: daysRemaining <= 7,
    };
  }

  /**
   * Create a new membership
   * @param dto - Membership data
   * @param gymId - Gym ID
   */
  async create(
    dto: CreateMembershipDto,
    gymId: number,
    actorInfo?: { id: number; name: string; role: string; branchId?: number | null },
  ) {
    // Verify user exists in tenant (and not soft-deleted)
    const user = await this.tenantService.executeInTenant(
      gymId,
      async (client) => {
        const result = await client.query(
          `SELECT id FROM users WHERE id = $1 AND (is_deleted = FALSE OR is_deleted IS NULL)`,
          [dto.userId],
        );
        return result.rows[0];
      },
    );

    if (!user) {
      throw new NotFoundException(`User with ID ${dto.userId} not found`);
    }

    // If user already has an active membership, queue the new one after it ends (renewal)
    // Old membership stays active and will expire naturally via the scheduler
    const activeMembership = await this.getActiveMembership(dto.userId, gymId);
    let isRenewal = false;
    if (activeMembership) {
      const oldEndDate = new Date(activeMembership.endDate);
      // New membership starts from old membership's end date (not today)
      if (oldEndDate > new Date()) {
        dto.startDate = oldEndDate.toISOString();
        isRenewal = true;
      }
    }

    // Get plan details
    const plan = await this.tenantService.executeInTenant(
      gymId,
      async (client) => {
        const result = await client.query(
          `SELECT * FROM plans WHERE id = $1 AND is_active = true`,
          [dto.planId],
        );
        return result.rows[0];
      },
    );

    if (!plan) {
      throw new NotFoundException(`Plan with ID ${dto.planId} not found`);
    }

    // Get offer if provided
    let offer: Record<string, any> | null = null;
    let discountAmount = 0;
    if (dto.offerCode) {
      offer = await this.tenantService.executeInTenant(
        gymId,
        async (client) => {
          const result = await client.query(
            `SELECT * FROM offers WHERE code = $1 AND is_active = true AND start_date <= NOW() AND end_date >= NOW()`,
            [dto.offerCode],
          );
          return result.rows[0];
        },
      );

      if (offer) {
        if (offer.discount_value < 0) {
          throw new BadRequestException('Offer discount value cannot be negative')
        }
        if (offer.discount_type === 'percentage' && offer.discount_value > 100) {
          throw new BadRequestException('Percentage discount value cannot exceed 100')
        }
        if (offer.discount_type === 'percentage') {
          discountAmount = (plan.price * offer.discount_value) / 100;
        } else {
          discountAmount = offer.discount_value;
        }
      }
    }

    // Fall back to manual discount if no offer was resolved
    if (discountAmount === 0 && dto.discountAmount && dto.discountAmount > 0) {
      if (dto.discountAmount < 0) {
        throw new BadRequestException('Discount amount cannot be negative')
      }
      discountAmount = dto.discountAmount;
      // Ensure discount doesn't exceed plan price
      if (discountAmount > plan.price) {
        discountAmount = plan.price;
      }
    }

    const originalAmount = plan.price;
    const finalAmount = Math.max(0, originalAmount - discountAmount);

    // Calculate end date
    const startDate = new Date(dto.startDate);
    const endDate = this.calculateEndDate(
      startDate,
      plan.duration_value,
      plan.duration_type,
    );

    // Create membership, increment offer usage, save facilities/amenities, and
    // create payment record atomically to prevent partial state on failure.
    const { membership, userName } = await this.tenantService.executeInTenantTransaction(
      gymId,
      async (client) => {
        // Create membership
        const membershipResult = await client.query(
          `INSERT INTO memberships (user_id, plan_id, offer_id, start_date, end_date, status,
          original_amount, discount_amount, final_amount, currency, payment_status, payment_method, paid_at, notes, auto_renew, branch_id, created_at, updated_at)
         VALUES ($1, $2, $3, $4, $5, $13, $6, $7, $8, $9, 'paid', $10, NOW(), $11, $12, $14, NOW(), NOW())
         RETURNING *`,
          [
            dto.userId,
            dto.planId,
            offer?.id || null,
            startDate,
            endDate,
            originalAmount,
            discountAmount,
            finalAmount,
            'INR',
            dto.paymentMethod || 'cash',
            dto.notes || null,
            dto.autoRenew || false,
            isRenewal ? 'pending' : 'active',
            actorInfo?.branchId ?? null,
          ],
        );
        const txMembership = membershipResult.rows[0];

        // Increment offer usage
        if (offer) {
          await client.query(
            `UPDATE offers SET current_usage = current_usage + 1 WHERE id = $1`,
            [offer.id],
          );
        }

        // Save membership facilities (bulk insert)
        if (dto.facilityIds && dto.facilityIds.length > 0) {
          await client.query(
            `INSERT INTO membership_facilities (membership_id, facility_id)
             SELECT $1, unnest($2::int[])
             ON CONFLICT DO NOTHING`,
            [txMembership.id, dto.facilityIds],
          );
        }

        // Save membership amenities (bulk insert)
        if (dto.amenityIds && dto.amenityIds.length > 0) {
          await client.query(
            `INSERT INTO membership_amenities (membership_id, amenity_id)
             SELECT $1, unnest($2::int[])
             ON CONFLICT DO NOTHING`,
            [txMembership.id, dto.amenityIds],
          );
        }

        // Get user name for payment record
        const userResult = await client.query(
          `SELECT name FROM users WHERE id = $1`,
          [dto.userId],
        );
        const txUserName = userResult.rows[0]?.name || 'Unknown';

        // Create payment record for the membership
        await this.paymentsService.createMembershipPaymentWithClient(
          client,
          txMembership.id,
          dto.userId,
          txUserName,
          originalAmount,
          discountAmount,
          finalAmount,
          dto.paymentMethod || 'cash',
          undefined, // paymentRef
          undefined, // processedBy
          actorInfo?.branchId ?? null,
        );

        // Log membership creation to history
        await this.logToHistory(client, txMembership, 'created');

        return { membership: txMembership, userName: txUserName };
      },
    );

    // Non-critical side effects (notifications, activity logs) run after the
    // transaction commits so they don't cause a rollback if they fail.

    // Send membership renewed notification
    try {
      await this.notificationsService.notifyMembershipRenewed(
        dto.userId,
        gymId,
        {
          planName: plan.name,
          endDate: endDate,
          membershipId: membership.id,
        },
      );
    } catch (err) {
      console.error('Failed to send notifyMembershipRenewed notification:', err);
    }

    // Log activity
    if (actorInfo) {
      try {
        await this.activityLogsService.logMembershipCreated(
          gymId,
          actorInfo.id,
          actorInfo.role,
          actorInfo.name,
          membership.id,
          userName,
          plan.name,
        );
      } catch (err) {
        console.error('Failed to log membership created activity:', err);
      }
    }

    // Notify admin and manager about new enrollment
    try {
      await this.notificationHelper.notifyStaff(
        gymId,
        {
          type: NotificationType.NEW_ENROLLMENT,
          title: 'New Membership Enrollment',
          message: `${userName} has been enrolled in ${plan.name}.`,
          actionUrl: `/clients/${dto.userId}?tab=subscription`,
          data: {
            entityId: membership.id,
            entityType: 'membership',
            userId: dto.userId,
            membershipId: membership.id,
            metadata: { userName, planName: plan.name },
          },
        },
        { excludeUserId: actorInfo?.id },
      );
    } catch (err) {
      console.error('Failed to send notifyStaff notification:', err);
    }

    return this.findOne(membership.id, gymId);
  }

  /**
   * Save facilities for a membership
   */
  private async saveMembershipFacilities(
    membershipId: number,
    facilityIds: number[],
    gymId: number,
  ): Promise<void> {
    await this.tenantService.executeInTenant(gymId, async (client) => {
      // Clear existing facilities
      await client.query(
        `DELETE FROM membership_facilities WHERE membership_id = $1`,
        [membershipId],
      );

      // Insert new facilities
      for (const facilityId of facilityIds) {
        await client.query(
          `INSERT INTO membership_facilities (membership_id, facility_id) VALUES ($1, $2) ON CONFLICT DO NOTHING`,
          [membershipId, facilityId],
        );
      }
    });
  }

  /**
   * Save amenities for a membership
   */
  private async saveMembershipAmenities(
    membershipId: number,
    amenityIds: number[],
    gymId: number,
  ): Promise<void> {
    await this.tenantService.executeInTenant(gymId, async (client) => {
      // Clear existing amenities
      await client.query(
        `DELETE FROM membership_amenities WHERE membership_id = $1`,
        [membershipId],
      );

      // Insert new amenities
      for (const amenityId of amenityIds) {
        await client.query(
          `INSERT INTO membership_amenities (membership_id, amenity_id) VALUES ($1, $2) ON CONFLICT DO NOTHING`,
          [membershipId, amenityId],
        );
      }
    });
  }

  /**
   * Get facilities and amenities for a membership
   */
  async getMembershipFacilitiesAndAmenities(
    membershipId: number,
    gymId: number,
  ): Promise<{ facilities: Record<string, any>[]; amenities: Record<string, any>[] }> {
    return this.tenantService.executeInTenant(gymId, async (client) => {
      const [facilitiesResult, amenitiesResult] = await Promise.all([
        client.query(
          `SELECT f.id, f.name, f.code, f.description, f.icon
           FROM membership_facilities mf
           JOIN facilities f ON f.id = mf.facility_id
           WHERE mf.membership_id = $1 AND f.is_active = true
           ORDER BY f.display_order`,
          [membershipId],
        ),
        client.query(
          `SELECT a.id, a.name, a.code, a.description, a.icon
           FROM membership_amenities ma
           JOIN amenities a ON a.id = ma.amenity_id
           WHERE ma.membership_id = $1 AND a.is_active = true
           ORDER BY a.display_order`,
          [membershipId],
        ),
      ]);

      return {
        facilities: facilitiesResult.rows.map((f: Record<string, any>) => ({
          id: f.id,
          name: f.name,
          code: f.code,
          description: f.description,
          icon: f.icon,
        })),
        amenities: amenitiesResult.rows.map((a: Record<string, any>) => ({
          id: a.id,
          name: a.name,
          code: a.code,
          description: a.description,
          icon: a.icon,
        })),
      };
    });
  }

  /**
   * Update facilities and amenities for a membership
   */
  async updateMembershipFacilitiesAndAmenities(
    membershipId: number,
    gymId: number,
    facilityIds: number[],
    amenityIds: number[],
  ): Promise<{ facilities: Record<string, any>[]; amenities: Record<string, any>[] }> {
    // Verify membership exists
    await this.findOne(membershipId, gymId);

    // Update facilities
    if (facilityIds) {
      await this.saveMembershipFacilities(membershipId, facilityIds, gymId);
    }

    // Update amenities
    if (amenityIds) {
      await this.saveMembershipAmenities(membershipId, amenityIds, gymId);
    }

    // Return updated facilities and amenities
    return this.getMembershipFacilitiesAndAmenities(membershipId, gymId);
  }

  async update(id: number, gymId: number, dto: UpdateMembershipDto) {
    await this.findOne(id, gymId); // Verify exists

    const updates: string[] = [];
    const values: SqlValue[] = [];
    let paramIndex = 1;

    if (dto.status) {
      updates.push(`status = $${paramIndex++}`);
      values.push(dto.status);
    }
    if (dto.paymentStatus) {
      updates.push(`payment_status = $${paramIndex++}`);
      values.push(dto.paymentStatus);
    }
    if (dto.paymentMethod) {
      updates.push(`payment_method = $${paramIndex++}`);
      values.push(dto.paymentMethod);
    }
    if (dto.paymentRef) {
      updates.push(`payment_ref = $${paramIndex++}`);
      values.push(dto.paymentRef);
    }
    if (dto.notes !== undefined) {
      updates.push(`notes = $${paramIndex++}`);
      values.push(dto.notes);
    }
    if (dto.paidAt) {
      updates.push(`paid_at = $${paramIndex++}`);
      values.push(new Date(dto.paidAt));
    }

    updates.push(`updated_at = NOW()`);
    values.push(id);

    await this.tenantService.executeInTenantTransaction(gymId, async (client) => {
      await client.query(
        `UPDATE memberships SET ${updates.join(', ')} WHERE id = $${paramIndex}`,
        values,
      );
    });

    return this.findOne(id, gymId);
  }

  async recordPayment(
    id: number,
    gymId: number,
    dto: RecordPaymentDto,
    processedBy?: number,
  ) {
    const membership = await this.findOne(id, gymId);

    if (membership.paymentStatus === 'paid') {
      throw new BadRequestException(
        'Payment already recorded for this membership',
      );
    }

    const endDate = new Date(membership.endDate)
    if (endDate < new Date()) {
      throw new BadRequestException('Cannot record payment for an expired membership')
    }

    // Update membership status and create payment record atomically
    await this.tenantService.executeInTenantTransaction(gymId, async (client) => {
      await client.query(
        `UPDATE memberships SET payment_status = 'paid', payment_method = $1, payment_ref = $2, paid_at = NOW(), status = 'active', updated_at = NOW() WHERE id = $3`,
        [dto.paymentMethod, dto.paymentRef || null, id],
      );

      // Get user name for payment record
      const userResult = await client.query(
        `SELECT name FROM users WHERE id = $1`,
        [membership.userId],
      );
      const userName = userResult.rows[0]?.name || 'Unknown';

      // Create payment record
      await this.paymentsService.createMembershipPaymentWithClient(
        client,
        id,
        membership.userId,
        userName,
        membership.originalAmount,
        membership.discountAmount,
        dto.amount || membership.finalAmount,
        dto.paymentMethod,
        dto.paymentRef,
        processedBy,
      );

      // Log after recording payment to capture the updated state
      const snapshot = await client.query(`SELECT * FROM memberships WHERE id = $1`, [id]);
      if (snapshot.rows[0]) {
        await this.logToHistory(client, snapshot.rows[0], 'payment_recorded');
      }
    });

    return this.findOne(id, gymId);
  }

  async cancel(id: number, gymId: number, dto: CancelMembershipDto) {
    const membership = await this.findOne(id, gymId);

    if (membership.status === 'cancelled') {
      throw new BadRequestException('Membership is already cancelled');
    }

    if (membership.status === 'expired') {
      throw new BadRequestException('Cannot cancel an already expired membership')
    }

    await this.tenantService.executeInTenantTransaction(gymId, async (client) => {
      await client.query(
        `UPDATE memberships SET status = 'cancelled', cancelled_at = NOW(), cancel_reason = $1, cancellation_reason_code = $2, updated_at = NOW() WHERE id = $3`,
        [dto.reason || null, dto.cancellationReasonCode || null, id],
      );

      // Log after cancelling so cancel_reason and cancellation metadata are captured
      const snapshot = await client.query(`SELECT * FROM memberships WHERE id = $1`, [id]);
      if (snapshot.rows[0]) {
        await this.logToHistory(client, snapshot.rows[0], 'cancelled');
      }
    });

    return this.findOne(id, gymId);
  }

  async delete(
    id: number,
    gymId: number,
    force: boolean = false,
    deletedById?: number,
  ) {
    const membership = await this.findOne(id, gymId);

    if (
      (membership.status === 'active' || membership.status === 'pending') &&
      !force
    ) {
      throw new BadRequestException(
        'Cannot delete active or pending memberships. Use force delete.',
      );
    }

    // Soft delete the membership and void associated payment atomically
    await this.tenantService.executeInTenantTransaction(gymId, async (client) => {
      await client.query(
        `UPDATE memberships SET is_deleted = TRUE, deleted_at = NOW(), deleted_by = $2, updated_at = NOW() WHERE id = $1`,
        [id, deletedById || null],
      );

      // Log after soft deleting so deletion metadata is captured in the history entry
      const snapshot = await client.query(`SELECT * FROM memberships WHERE id = $1`, [id]);
      if (snapshot.rows[0]) {
        await this.logToHistory(client, snapshot.rows[0], 'deleted');
      }

      // Void the associated payment record
      await client.query(
        `UPDATE payments SET status = 'voided', updated_at = NOW() WHERE reference_table = 'memberships' AND reference_id = $1`,
        [id],
      );
    });

    return { id, deleted: true };
  }

  async voidDelete(id: number, gymId: number) {
    // Verify membership exists
    await this.findOne(id, gymId);

    const txResult = await this.tenantService.executeInTenantTransaction(gymId, async (client) => {
      // Log BEFORE hard deleting so we capture the membership state while it still exists
      const snapshot = await client.query(`SELECT * FROM memberships WHERE id = $1`, [id]);
      if (snapshot.rows[0]) {
        await this.logToHistory(client, snapshot.rows[0], 'void_deleted');
      }

      // Hard delete attendance records linked to this membership
      await client.query(
        `DELETE FROM attendance WHERE membership_id = $1`,
        [id],
      );

      // Hard delete payments linked to this membership
      await client.query(
        `DELETE FROM payments WHERE reference_table = 'memberships' AND reference_id = $1`,
        [id],
      );

      // Hard delete membership freezes
      await client.query(
        `DELETE FROM membership_freezes WHERE membership_id = $1`,
        [id],
      );

      // Hard delete membership facilities
      await client.query(
        `DELETE FROM membership_facilities WHERE membership_id = $1`,
        [id],
      );

      // Hard delete membership amenities
      await client.query(
        `DELETE FROM membership_amenities WHERE membership_id = $1`,
        [id],
      );

      // Hard delete the membership itself
      await client.query(
        `DELETE FROM memberships WHERE id = $1`,
        [id],
      );

      // If the deleted membership was active, immediately activate the earliest pending membership for the same user
      if (snapshot.rows[0]?.status === 'active') {
        const pendingResult = await client.query(
          `SELECT id FROM memberships
           WHERE user_id = $1
           AND status = 'pending'
           AND end_date >= NOW()
           AND (is_deleted = FALSE OR is_deleted IS NULL)
           ORDER BY start_date ASC
           LIMIT 1`,
          [snapshot.rows[0].user_id],
        );

        if (pendingResult.rows.length > 0) {
          const pendingId = pendingResult.rows[0].id;

          await client.query(
            `UPDATE memberships
             SET status = 'active', updated_at = NOW()
             WHERE id = $1`,
            [pendingId],
          );

          await client.query(
            `UPDATE users
             SET status = 'active', updated_at = NOW()
             WHERE id = $1`,
            [snapshot.rows[0].user_id],
          );

          // Audit log for the auto-activated membership
          const activatedSnapshot = await client.query(
            `SELECT * FROM memberships WHERE id = $1`,
            [pendingId],
          );
          if (activatedSnapshot.rows[0]) {
            await this.logToHistory(client, activatedSnapshot.rows[0], 'activated');
          }

          return { pendingActivated: true };
        }

        // No pending membership found — mark the user as inactive
        await client.query(
          `UPDATE users SET status = 'inactive', updated_at = NOW() WHERE id = $1`,
          [snapshot.rows[0].user_id],
        );
      }

      return { pendingActivated: false };
    });

    return { id, voided: true, pendingActivated: txResult?.pendingActivated ?? false, message: 'Membership permanently deleted' };
  }

  async getExpiringSoon(
    gymId: number,
    days = 7,
    branchId?: number | null,
  ) {
    const now = new Date();
    const futureDate = new Date();
    futureDate.setDate(futureDate.getDate() + days);

    const memberships = await this.tenantService.executeInTenant(
      gymId,
      async (client) => {
        let query = `SELECT m.*, u.name as user_name, u.email as user_email, u.phone as user_phone,
                p.name as plan_name, p.code as plan_code
         FROM memberships m
         JOIN users u ON u.id = m.user_id
         LEFT JOIN plans p ON p.id = m.plan_id
         WHERE m.status = 'active' AND m.end_date >= $1 AND m.end_date <= $2
           AND (m.is_deleted = FALSE OR m.is_deleted IS NULL)`;
        const values: SqlValue[] = [now, futureDate];

        if (branchId) {
          query += ` AND (m.branch_id = ${branchId} OR m.branch_id IS NULL)`;
        }
        query += ` ORDER BY m.end_date ASC`;

        const result = await client.query(query, values);
        return result.rows;
      },
    );

    return memberships.map((m: Record<string, any>) => this.formatMembership(m));
  }

  async getStats(gymId: number, branchId?: number | null) {
    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const endOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0);

    const stats = await this.tenantService.executeInTenant(
      gymId,
      async (client) => {
        const branchFilter = branchId ? ` AND (branch_id = ${branchId} OR branch_id IS NULL)` : '';
        const softDeleteFilter =
          ' AND (is_deleted = FALSE OR is_deleted IS NULL)';

        const [activeResult, revenueResult, endingResult, totalRevenueResult] =
          await Promise.all([
            client.query(
              `SELECT COUNT(*) as count FROM memberships WHERE status = 'active' AND end_date >= $1${branchFilter}${softDeleteFilter}`,
              [now],
            ),
            client.query(
              `SELECT COALESCE(SUM(final_amount), 0) as sum FROM memberships WHERE payment_status = 'paid' AND paid_at >= $1 AND paid_at <= $2${branchFilter}${softDeleteFilter}`,
              [startOfMonth, now],
            ),
            client.query(
              `SELECT COUNT(*) as count FROM memberships WHERE status = 'active' AND end_date >= $1 AND end_date <= $2${branchFilter}${softDeleteFilter}`,
              [now, endOfMonth],
            ),
            client.query(
              `SELECT COALESCE(SUM(final_amount), 0) as sum FROM memberships WHERE payment_status = 'paid'${branchFilter}${softDeleteFilter}`,
            ),
          ]);

        return {
          totalActiveMembers: parseInt(activeResult.rows[0].count, 10),
          thisMonthRevenue: parseFloat(revenueResult.rows[0].sum),
          endingThisMonth: parseInt(endingResult.rows[0].count, 10),
          totalRevenue: parseFloat(totalRevenueResult.rows[0].sum),
        };
      },
    );

    return stats;
  }

  async getOverview(gymId: number, branchId?: number | null) {
    const [stats, expiringSoon, recentSubscriptions, plans, planDistribution] =
      await Promise.all([
        this.getStats(gymId, branchId),
        this.getExpiringSoon(gymId, 7, branchId),
        this.getRecentSubscriptions(gymId, 10, branchId),
        this.getPlansForOverview(gymId, branchId),
        this.getPlanDistribution(gymId, branchId),
      ]);

    return {
      stats,
      expiringSoon,
      recentSubscriptions,
      plans,
      planDistribution,
    };
  }

  private async getPlansForOverview(
    gymId: number,
    branchId?: number | null,
  ) {
    return this.tenantService.executeInTenant(gymId, async (client) => {
      let query = `SELECT id, code, name FROM plans WHERE is_active = true AND (is_deleted = FALSE OR is_deleted IS NULL)`;
      const values: SqlValue[] = [];

      if (branchId) {
        query += ` AND (branch_id = ${branchId} OR branch_id IS NULL)`;
      }

      query += ` ORDER BY display_order ASC`;

      const result = await client.query(query, values);
      return result.rows.map((p: Record<string, any>) => ({
        id: p.id,
        code: p.code,
        name: p.name,
      }));
    });
  }

  private async getPlanDistribution(
    gymId: number,
    branchId?: number | null,
  ) {
    return this.tenantService.executeInTenant(gymId, async (client) => {
      let query = `SELECT plan_id, COUNT(*) as count
         FROM memberships
         WHERE status = 'active' AND (is_deleted = FALSE OR is_deleted IS NULL)`;
      const values: SqlValue[] = [];

      if (branchId) {
        query += ` AND (branch_id = ${branchId} OR branch_id IS NULL)`;
      }

      query += ` GROUP BY plan_id ORDER BY count DESC`;

      const result = await client.query(query, values);
      return result.rows.map((row: Record<string, any>) => ({
        planId: row.plan_id,
        count: parseInt(row.count, 10),
      }));
    });
  }

  private async getRecentSubscriptions(
    gymId: number,
    limit = 10,
    branchId?: number | null,
  ) {
    const memberships = await this.tenantService.executeInTenant(
      gymId,
      async (client) => {
        let query = `SELECT m.*, u.name as user_name, u.email as user_email, u.phone as user_phone,
                p.name as plan_name, p.code as plan_code
         FROM memberships m
         JOIN users u ON u.id = m.user_id
         LEFT JOIN plans p ON p.id = m.plan_id
         WHERE (m.is_deleted = FALSE OR m.is_deleted IS NULL)`;
        const values: SqlValue[] = [];
        let paramIndex = 1;

        if (branchId) {
          query += ` AND (m.branch_id = ${branchId} OR m.branch_id IS NULL)`;
        }
        query += ` ORDER BY m.created_at DESC LIMIT $${paramIndex}`;
        values.push(limit);

        const result = await client.query(query, values);
        return result.rows;
      },
    );

    return memberships.map((m: Record<string, any>) => this.formatMembership(m));
  }

  async renew(
    userId: number,
    gymId: number,
    dto: RenewMembershipDto,
  ) {
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

    const result = await this.create(
      {
        userId,
        planId,
        offerCode: dto.offerCode,
        startDate: startDate.toISOString(),
        paymentMethod: dto.paymentMethod,
        notes: dto.notes,
        discountAmount: dto.discountAmount,
        facilityIds: dto.facilityIds,
        amenityIds: dto.amenityIds,
      },
      gymId,
    );

    // Log the renewed membership to history
    if (result?.id) {
      await this.tenantService.executeInTenantTransaction(gymId, async (client) => {
        const snapshot = await client.query(`SELECT * FROM memberships WHERE id = $1`, [result.id]);
        if (snapshot.rows[0]) {
          await this.logToHistory(client, snapshot.rows[0], 'renewed');
        }
      });
    }

    return result;
  }

  private calculateEndDate(
    startDate: Date,
    durationValue: number,
    durationType: string,
  ): Date {
    const endDate = new Date(startDate);

    switch (durationType) {
      case 'day':
        endDate.setDate(endDate.getDate() + durationValue);
        break;
      case 'week':
        endDate.setDate(endDate.getDate() + durationValue * 7);
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

  async freeze(id: number, gymId: number, dto: { startDate: string; endDate: string; reason?: string }, approvedBy: number) {
    const membership = await this.findOne(id, gymId);

    if (membership.status !== 'active') {
      throw new BadRequestException('Only active memberships can be frozen');
    }

    if (membership.freezeStartDate) {
      throw new BadRequestException('Membership is already frozen');
    }

    const startDate = new Date(dto.startDate);
    const endDate = new Date(dto.endDate);
    const freezeDays = Math.ceil((endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24));

    if (freezeDays <= 0) {
      throw new BadRequestException('End date must be after start date');
    }

    const today = new Date()
    today.setHours(0, 0, 0, 0)
    const freezeStart = new Date(dto.startDate)
    freezeStart.setHours(0, 0, 0, 0)
    if (freezeStart < today) {
      throw new BadRequestException('Freeze start date cannot be in the past')
    }

    // Check against plan's max freeze days
    const plan = await this.tenantService.executeInTenant(gymId, async (client) => {
      const result = await client.query(`SELECT * FROM plans WHERE id = $1`, [membership.planId]);
      return result.rows[0];
    });

    const maxFreezeDays = plan?.max_freeze_days || 0;
    const usedFreezeDays = membership.totalFreezeDays || 0;

    if (maxFreezeDays > 0 && (usedFreezeDays + freezeDays) > maxFreezeDays) {
      throw new BadRequestException(
        `Cannot freeze for ${freezeDays} days. Max allowed: ${maxFreezeDays}, already used: ${usedFreezeDays}`,
      );
    }

    // Create freeze record and update membership atomically
    await this.tenantService.executeInTenantTransaction(gymId, async (client) => {
      await client.query(
        `INSERT INTO membership_freezes (membership_id, start_date, end_date, reason, approved_by, status, created_at, updated_at)
         VALUES ($1, $2, $3, $4, $5, 'active', NOW(), NOW())`,
        [id, startDate, endDate, dto.reason || null, approvedBy],
      );

      await client.query(
        `UPDATE memberships SET freeze_start_date = $1, freeze_end_date = $2, freeze_reason = $3,
         total_freeze_days = total_freeze_days + $4, updated_at = NOW() WHERE id = $5`,
        [startDate, endDate, dto.reason || null, freezeDays, id],
      );

      // Log after freezing to capture the frozen state
      const snapshot = await client.query(`SELECT * FROM memberships WHERE id = $1`, [id]);
      if (snapshot.rows[0]) {
        await this.logToHistory(client, snapshot.rows[0], 'frozen');
      }
    });

    return this.findOne(id, gymId);
  }

  async unfreeze(id: number, gymId: number) {
    const membership = await this.findOne(id, gymId);

    if (!membership.freezeStartDate) {
      throw new BadRequestException('Membership is not frozen');
    }

    const freezeStart = new Date(membership.freezeStartDate);
    const now = new Date();
    const actualFreezeDays = Math.ceil((now.getTime() - freezeStart.getTime()) / (1000 * 60 * 60 * 24));

    if (actualFreezeDays <= 0) {
      throw new BadRequestException('Membership freeze has not started yet')
    }

    // Complete freeze and extend membership atomically
    await this.tenantService.executeInTenantTransaction(gymId, async (client) => {
      await client.query(
        `UPDATE membership_freezes SET status = 'completed', end_date = NOW(), updated_at = NOW()
         WHERE membership_id = $1 AND status = 'active'`,
        [id],
      );

      await client.query(
        `UPDATE memberships SET
         end_date = end_date + INTERVAL '1 day' * $1,
         freeze_start_date = NULL, freeze_end_date = NULL, freeze_reason = NULL,
         updated_at = NOW() WHERE id = $2`,
        [actualFreezeDays, id],
      );

      // Log after unfreezing to capture the unfrozen state
      const snapshot = await client.query(`SELECT * FROM memberships WHERE id = $1`, [id]);
      if (snapshot.rows[0]) {
        await this.logToHistory(client, snapshot.rows[0], 'unfrozen');
      }
    });

    return this.findOne(id, gymId);
  }

  async getFreezeHistory(membershipId: number, gymId: number) {
    return this.tenantService.executeInTenant(gymId, async (client) => {
      const result = await client.query(
        `SELECT * FROM membership_freezes WHERE membership_id = $1 ORDER BY created_at DESC`,
        [membershipId],
      );
      return result.rows.map((f) => ({
        id: f.id,
        membershipId: f.membership_id,
        startDate: f.start_date,
        endDate: f.end_date,
        reason: f.reason,
        approvedBy: f.approved_by,
        status: f.status,
        createdAt: f.created_at,
        updatedAt: f.updated_at,
      }));
    });
  }

  async getCancellationReasons(gymId: number) {
    return this.tenantService.executeInTenant(gymId, async (client) => {
      const result = await client.query(
        `SELECT * FROM cancellation_reasons WHERE is_active = TRUE ORDER BY display_order ASC`,
      );
      return result.rows.map((r) => ({
        id: r.id,
        code: r.code,
        label: r.label,
      }));
    });
  }
}
