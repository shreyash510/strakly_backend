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
    branchId: number | null = null,
    filters?: {
      status?: string;
      userId?: number;
      planId?: number;
      search?: string;
      page?: number;
      limit?: number;
    },
  ) {
    const page = filters?.page || 1;
    const limit = filters?.limit || 15;
    const skip = (page - 1) * limit;

    const { memberships, total } = await this.tenantService.executeInTenant(
      gymId,
      async (client) => {
        // Start with soft delete filter
        let whereClause = '(m.is_deleted = FALSE OR m.is_deleted IS NULL)';
        const values: any[] = [];
        let paramIndex = 1;

        // Branch filtering: null = admin (all branches), number = specific branch
        if (branchId !== null) {
          whereClause += ` AND m.branch_id = $${paramIndex++}`;
          values.push(branchId);
        }

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
      data: memberships.map((m: any) => this.formatMembership(m)),
      pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
    };
  }

  private formatMembership(m: any) {
    return {
      id: m.id,
      branchId: m.branch_id,
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

  async findOne(id: number, gymId: number, branchId: number | null = null) {
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
        const values: any[] = [id];

        // Branch filtering for non-admin users
        if (branchId !== null) {
          query += ` AND m.branch_id = $2`;
          values.push(branchId);
        }

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
    branchId: number | null = null,
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
        const values: any[] = [userId];

        // Branch filtering for non-admin users
        if (branchId !== null) {
          query += ` AND m.branch_id = $2`;
          values.push(branchId);
        }

        query += ` ORDER BY m.created_at DESC`;

        const result = await client.query(query, values);
        return result.rows;
      },
    );

    return memberships.map((m: any) => this.formatMembership(m));
  }

  async getHistory(
    userId: number,
    gymId: number,
    branchId: number | null = null,
    options?: { page?: number; limit?: number },
  ) {
    const page = options?.page || 1;
    const limit = options?.limit || 15;
    const skip = (page - 1) * limit;

    const { memberships, total } = await this.tenantService.executeInTenant(
      gymId,
      async (client) => {
        let whereClause =
          'm.user_id = $1 AND (m.is_deleted = FALSE OR m.is_deleted IS NULL)';
        const values: any[] = [userId];
        let paramIndex = 2;

        // Branch filtering
        if (branchId !== null) {
          whereClause += ` AND m.branch_id = $${paramIndex++}`;
          values.push(branchId);
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
      data: memberships.map((m: any) => this.formatMembership(m)),
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
   * @param branchId - Branch ID for the membership
   */
  async create(
    dto: CreateMembershipDto,
    gymId: number,
    branchId: number | null = null,
    actorInfo?: { id: number; name: string; role: string },
  ) {
    // Verify user exists in tenant (and not soft-deleted)
    const user = await this.tenantService.executeInTenant(
      gymId,
      async (client) => {
        const result = await client.query(
          `SELECT id, branch_id FROM users WHERE id = $1 AND (is_deleted = FALSE OR is_deleted IS NULL)`,
          [dto.userId],
        );
        return result.rows[0];
      },
    );

    if (!user) {
      throw new NotFoundException(`User with ID ${dto.userId} not found`);
    }

    // Use user's branch if branchId not provided
    const membershipBranchId = branchId ?? user.branch_id;

    // Check for active membership
    const activeMembership = await this.getActiveMembership(dto.userId, gymId);
    if (activeMembership) {
      throw new ConflictException('User already has an active membership');
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
    let offer: any = null;
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
    const endDate = this.calculateEndDate(
      startDate,
      plan.duration_value,
      plan.duration_type,
    );

    // Create membership with branch_id
    const membership = await this.tenantService.executeInTenant(
      gymId,
      async (client) => {
        const result = await client.query(
          `INSERT INTO memberships (branch_id, user_id, plan_id, offer_id, start_date, end_date, status,
          original_amount, discount_amount, final_amount, currency, payment_status, payment_method, paid_at, notes, created_at, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6, 'active', $7, $8, $9, $10, 'paid', $11, NOW(), $12, NOW(), NOW())
         RETURNING *`,
          [
            membershipBranchId,
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
          ],
        );
        return result.rows[0];
      },
    );

    // Increment offer usage
    if (offer) {
      await this.tenantService.executeInTenant(gymId, async (client) => {
        await client.query(
          `UPDATE offers SET current_usage = current_usage + 1 WHERE id = $1`,
          [offer.id],
        );
      });
    }

    // Save membership facilities
    if (dto.facilityIds && dto.facilityIds.length > 0) {
      await this.saveMembershipFacilities(
        membership.id,
        dto.facilityIds,
        gymId,
      );
    }

    // Save membership amenities
    if (dto.amenityIds && dto.amenityIds.length > 0) {
      await this.saveMembershipAmenities(membership.id, dto.amenityIds, gymId);
    }

    // Send membership renewed notification
    await this.notificationsService.notifyMembershipRenewed(
      dto.userId,
      gymId,
      membershipBranchId,
      {
        planName: plan.name,
        endDate: endDate,
        membershipId: membership.id,
      },
    );

    // Get user name for payment record
    const userName = await this.tenantService.executeInTenant(
      gymId,
      async (client) => {
        const result = await client.query(
          `SELECT name FROM users WHERE id = $1`,
          [dto.userId],
        );
        return result.rows[0]?.name || 'Unknown';
      },
    );

    // Create payment record for the membership
    await this.paymentsService.createMembershipPayment(
      membership.id,
      gymId,
      membershipBranchId,
      dto.userId,
      userName,
      originalAmount,
      discountAmount,
      finalAmount,
      dto.paymentMethod || 'cash',
      undefined, // paymentRef
      undefined, // processedBy
    );

    // Log activity
    if (actorInfo) {
      await this.activityLogsService.logMembershipCreated(
        gymId,
        membershipBranchId,
        actorInfo.id,
        actorInfo.role,
        actorInfo.name,
        membership.id,
        userName,
        plan.name,
      );
    }

    // Notify admin, branch_admin and manager about new enrollment
    await this.notificationHelper.notifyStaff(
      gymId,
      membershipBranchId || null,
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
  ): Promise<{ facilities: any[]; amenities: any[] }> {
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
        facilities: facilitiesResult.rows.map((f: any) => ({
          id: f.id,
          name: f.name,
          code: f.code,
          description: f.description,
          icon: f.icon,
        })),
        amenities: amenitiesResult.rows.map((a: any) => ({
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
  ): Promise<{ facilities: any[]; amenities: any[] }> {
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
    const values: any[] = [];
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

    await this.tenantService.executeInTenant(gymId, async (client) => {
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

    await this.tenantService.executeInTenant(gymId, async (client) => {
      await client.query(
        `UPDATE memberships SET payment_status = 'paid', payment_method = $1, payment_ref = $2, paid_at = NOW(), status = 'active', updated_at = NOW() WHERE id = $3`,
        [dto.paymentMethod, dto.paymentRef || null, id],
      );
    });

    // Get user name for payment record
    const userName = await this.tenantService.executeInTenant(
      gymId,
      async (client) => {
        const result = await client.query(
          `SELECT name FROM users WHERE id = $1`,
          [membership.userId],
        );
        return result.rows[0]?.name || 'Unknown';
      },
    );

    // Create payment record
    await this.paymentsService.createMembershipPayment(
      id,
      gymId,
      membership.branchId,
      membership.userId,
      userName,
      membership.originalAmount,
      membership.discountAmount,
      dto.amount || membership.finalAmount,
      dto.paymentMethod,
      dto.paymentRef,
      processedBy,
    );

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
        [dto.reason || null, id],
      );
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

    // Soft delete the membership
    await this.tenantService.executeInTenant(gymId, async (client) => {
      await client.query(
        `UPDATE memberships SET is_deleted = TRUE, deleted_at = NOW(), deleted_by = $2, updated_at = NOW() WHERE id = $1`,
        [id, deletedById || null],
      );
    });

    return { id, deleted: true };
  }

  async getExpiringSoon(
    gymId: number,
    branchId: number | null = null,
    days = 7,
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
        const values: any[] = [now, futureDate];

        // Branch filtering for non-admin users
        if (branchId !== null) {
          query += ` AND m.branch_id = $3`;
          values.push(branchId);
        }

        query += ` ORDER BY m.end_date ASC`;

        const result = await client.query(query, values);
        return result.rows;
      },
    );

    return memberships.map((m: any) => this.formatMembership(m));
  }

  async getStats(gymId: number, branchId: number | null = null) {
    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const endOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0);

    const stats = await this.tenantService.executeInTenant(
      gymId,
      async (client) => {
        // Build branch filter clause
        const branchFilter =
          branchId !== null ? ` AND branch_id = ${branchId}` : '';
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

  async getOverview(gymId: number, branchId: number | null = null) {
    const [stats, expiringSoon, recentSubscriptions, plans, planDistribution] =
      await Promise.all([
        this.getStats(gymId, branchId),
        this.getExpiringSoon(gymId, branchId, 7),
        this.getRecentSubscriptions(gymId, branchId, 10),
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
    branchId: number | null = null,
  ) {
    return this.tenantService.executeInTenant(gymId, async (client) => {
      let query = `SELECT id, code, name FROM plans WHERE is_active = true`;
      const values: any[] = [];

      // Branch filtering: show branch-specific plans + global plans (branch_id IS NULL)
      if (branchId !== null) {
        query += ` AND (branch_id = $1 OR branch_id IS NULL)`;
        values.push(branchId);
      }

      query += ` ORDER BY display_order ASC`;

      const result = await client.query(query, values);
      return result.rows.map((p: any) => ({
        id: p.id,
        code: p.code,
        name: p.name,
      }));
    });
  }

  private async getPlanDistribution(
    gymId: number,
    branchId: number | null = null,
  ) {
    return this.tenantService.executeInTenant(gymId, async (client) => {
      let query = `SELECT plan_id, COUNT(*) as count
         FROM memberships
         WHERE status = 'active' AND (is_deleted = FALSE OR is_deleted IS NULL)`;
      const values: any[] = [];

      // Branch filtering for non-admin users
      if (branchId !== null) {
        query += ` AND branch_id = $1`;
        values.push(branchId);
      }

      query += ` GROUP BY plan_id ORDER BY count DESC`;

      const result = await client.query(query, values);
      return result.rows.map((row: any) => ({
        planId: row.plan_id,
        count: parseInt(row.count, 10),
      }));
    });
  }

  private async getRecentSubscriptions(
    gymId: number,
    branchId: number | null = null,
    limit = 10,
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
        const values: any[] = [];
        let paramIndex = 1;

        // Branch filtering for non-admin users
        if (branchId !== null) {
          query += ` AND m.branch_id = $${paramIndex++}`;
          values.push(branchId);
        }

        query += ` ORDER BY m.created_at DESC LIMIT $${paramIndex}`;
        values.push(limit);

        const result = await client.query(query, values);
        return result.rows;
      },
    );

    return memberships.map((m: any) => this.formatMembership(m));
  }

  async renew(
    userId: number,
    gymId: number,
    branchId: number | null = null,
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

    return this.create(
      {
        userId,
        planId,
        offerCode: dto.offerCode,
        startDate: startDate.toISOString(),
        paymentMethod: dto.paymentMethod,
        notes: dto.notes,
      },
      gymId,
      branchId,
    );
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
