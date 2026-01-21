import { Injectable, NotFoundException, BadRequestException, ConflictException } from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';
import { PlansService } from '../plans/plans.service';
import { OffersService } from '../offers/offers.service';
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
    private readonly plansService: PlansService,
    private readonly offersService: OffersService,
  ) {}

  async findAll(filters?: {
    status?: string;
    userId?: number;
    planId?: number;
    search?: string;
    page?: number;
    limit?: number;
    gymId?: number;
  }) {
    const where: any = {};

    if (filters?.status) {
      where.status = filters.status;
    }
    if (filters?.userId) {
      where.userId = filters.userId;
    }
    if (filters?.planId) {
      where.planId = filters.planId;
    }
    if (filters?.gymId) {
      where.gymId = filters.gymId;
    }

    // Search by user name or email
    if (filters?.search) {
      where.user = {
        OR: [
          { name: { contains: filters.search, mode: 'insensitive' } },
          { email: { contains: filters.search, mode: 'insensitive' } },
        ],
      };
    }

    // Pagination
    const page = filters?.page || 1;
    const limit = filters?.limit || 15;
    const skip = (page - 1) * limit;

    const [memberships, total] = await Promise.all([
      this.prisma.membership.findMany({
        where,
        include: {
          user: {
            select: { id: true, name: true, email: true, phone: true },
          },
          plan: true,
          offer: true,
        },
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
      }),
      this.prisma.membership.count({ where }),
    ]);

    return {
      data: memberships,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  async findOne(id: number) {
    const membership = await this.prisma.membership.findUnique({
      where: { id },
      include: {
        user: {
          select: { id: true, name: true, email: true, phone: true, avatar: true },
        },
        plan: true,
        offer: true,
      },
    });

    if (!membership) {
      throw new NotFoundException(`Membership with ID ${id} not found`);
    }

    return membership;
  }

  async findByUser(userId: number) {
    return this.prisma.membership.findMany({
      where: { userId },
      include: {
        plan: true,
        offer: true,
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async getActiveMembership(userId: number) {
    const now = new Date();

    return this.prisma.membership.findFirst({
      where: {
        userId,
        status: 'active',
        startDate: { lte: now },
        endDate: { gte: now },
      },
      include: {
        plan: true,
        offer: true,
      },
    });
  }

  async checkMembershipStatus(userId: number) {
    const active = await this.getActiveMembership(userId);

    if (!active) {
      return {
        hasActiveMembership: false,
        membership: null,
        daysRemaining: 0,
      };
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

  async create(dto: CreateMembershipDto, creatorId?: number) {
    /* Parallelize initial queries for better performance */
    const [user, userGymAssoc, creator, creatorGymAssoc, activeMembership, priceCalculation] = await Promise.all([
      /* Verify user exists */
      this.prisma.user.findUnique({
        where: { id: dto.userId },
        select: { id: true, gymId: true },
      }),
      /* User's gym association (needed if user.gymId is null) */
      this.prisma.userGymXref.findFirst({
        where: { userId: dto.userId, isActive: true },
        select: { gymId: true },
      }),
      /* Creator info (if creatorId provided) */
      creatorId ? this.prisma.user.findUnique({
        where: { id: creatorId },
        select: { gymId: true },
      }) : null,
      /* Creator's gym association */
      creatorId ? this.prisma.userGymXref.findFirst({
        where: { userId: creatorId, isActive: true },
        select: { gymId: true },
      }) : null,
      /* Check active membership */
      this.getActiveMembership(dto.userId),
      /* Calculate price with optional offer */
      this.plansService.calculatePriceWithOffer(dto.planId, dto.offerCode),
    ]);

    if (!user) {
      throw new NotFoundException(`User with ID ${dto.userId} not found`);
    }

    if (activeMembership) {
      throw new ConflictException('User already has an active membership');
    }

    /* Determine gymId: provided > user's gym > user's gym association > creator's gym */
    let gymId = dto.gymId
      || user.gymId
      || userGymAssoc?.gymId
      || creator?.gymId
      || creatorGymAssoc?.gymId
      || undefined;

    if (!gymId) {
      throw new BadRequestException('Unable to determine gym for membership. Please specify gymId.');
    }

    const plan = priceCalculation.plan;
    const offer = priceCalculation.offer;

    // Calculate end date based on plan duration
    const startDate = new Date(dto.startDate);
    const endDate = this.calculateEndDate(startDate, plan.durationValue, plan.durationType);

    const membership = await this.prisma.membership.create({
      data: {
        userId: dto.userId,
        gymId: gymId,
        planId: dto.planId,
        offerId: offer?.id || null,
        startDate,
        endDate,
        status: 'active',
        originalAmount: priceCalculation.originalAmount,
        discountAmount: priceCalculation.discountAmount,
        finalAmount: priceCalculation.finalAmount,
        currency: priceCalculation.currency,
        paymentStatus: 'paid',
        paymentMethod: dto.paymentMethod || 'cash',
        paidAt: new Date(),
        notes: dto.notes,
      },
      include: {
        user: {
          select: { id: true, name: true, email: true },
        },
        plan: true,
        offer: true,
      },
    });

    // Increment offer usage if used
    if (offer) {
      await this.offersService.incrementUsage(offer.id);
    }

    return membership;
  }

  /* Lightweight check for status validation - avoids loading full relations */
  private async getMembershipStatus(id: number): Promise<{ status: string; paymentStatus: string }> {
    const membership = await this.prisma.membership.findUnique({
      where: { id },
      select: { status: true, paymentStatus: true },
    });

    if (!membership) {
      throw new NotFoundException(`Membership with ID ${id} not found`);
    }

    return membership;
  }

  async update(id: number, dto: UpdateMembershipDto) {
    const updateData: any = { ...dto };

    if (dto.paidAt) {
      updateData.paidAt = new Date(dto.paidAt);
    }

    try {
      return await this.prisma.membership.update({
        where: { id },
        data: updateData,
        include: {
          user: {
            select: { id: true, name: true, email: true },
          },
          plan: true,
          offer: true,
        },
      });
    } catch (error: any) {
      if (error.code === 'P2025') {
        throw new NotFoundException(`Membership with ID ${id} not found`);
      }
      throw error;
    }
  }

  async recordPayment(id: number, dto: RecordPaymentDto) {
    const { paymentStatus } = await this.getMembershipStatus(id);

    if (paymentStatus === 'paid') {
      throw new BadRequestException('Payment already recorded for this membership');
    }

    return this.prisma.membership.update({
      where: { id },
      data: {
        paymentStatus: 'paid',
        paymentMethod: dto.paymentMethod,
        paymentRef: dto.paymentRef,
        paidAt: new Date(),
        status: 'active',
      },
      include: {
        user: {
          select: { id: true, name: true, email: true },
        },
        plan: true,
        offer: true,
      },
    });
  }

  async activate(id: number) {
    const { status, paymentStatus } = await this.getMembershipStatus(id);

    if (status === 'active') {
      throw new BadRequestException('Membership is already active');
    }

    if (paymentStatus !== 'paid') {
      throw new BadRequestException('Cannot activate membership without payment');
    }

    return this.prisma.membership.update({
      where: { id },
      data: { status: 'active' },
    });
  }

  async cancel(id: number, dto: CancelMembershipDto) {
    const { status } = await this.getMembershipStatus(id);

    if (status === 'cancelled') {
      throw new BadRequestException('Membership is already cancelled');
    }

    return this.prisma.membership.update({
      where: { id },
      data: {
        status: 'cancelled',
        cancelledAt: new Date(),
        cancelReason: dto.reason,
      },
    });
  }

  async delete(id: number) {
    const { status } = await this.getMembershipStatus(id);

    /* Only allow deletion of cancelled or expired memberships */
    if (status === 'active' || status === 'pending') {
      throw new BadRequestException(
        'Cannot delete active or pending memberships. Please cancel the membership first.',
      );
    }

    await this.prisma.membership.delete({
      where: { id },
    });

    return { id, deleted: true };
  }

  async pause(id: number) {
    const { status } = await this.getMembershipStatus(id);

    if (status !== 'active') {
      throw new BadRequestException('Only active memberships can be paused');
    }

    return this.prisma.membership.update({
      where: { id },
      data: { status: 'paused' },
    });
  }

  async resume(id: number) {
    const { status } = await this.getMembershipStatus(id);

    if (status !== 'paused') {
      throw new BadRequestException('Only paused memberships can be resumed');
    }

    return this.prisma.membership.update({
      where: { id },
      data: { status: 'active' },
    });
  }

  async renew(userId: number, dto: RenewMembershipDto) {
    // Get current membership to determine renewal plan
    const currentMembership = await this.getActiveMembership(userId);

    const planId = dto.planId || currentMembership?.planId;

    if (!planId) {
      throw new BadRequestException('Plan ID is required for renewal');
    }

    // Calculate start date (after current membership ends, or now)
    let startDate: Date;
    if (currentMembership && currentMembership.endDate > new Date()) {
      startDate = new Date(currentMembership.endDate);
      startDate.setDate(startDate.getDate() + 1);
    } else {
      startDate = new Date();
    }

    // If there's an active membership, mark it for non-renewal
    // New membership will start after current one ends

    return this.create({
      userId,
      gymId: dto.gymId,
      planId,
      offerCode: dto.offerCode,
      startDate: startDate.toISOString(),
      paymentMethod: dto.paymentMethod,
      notes: dto.notes,
    });
  }

  async getExpiringSoon(days = 7, gymId?: number) {
    const now = new Date();
    const futureDate = new Date();
    futureDate.setDate(futureDate.getDate() + days);

    const where: any = {
      status: 'active',
      endDate: {
        gte: now,
        lte: futureDate,
      },
    };

    if (gymId) {
      where.gymId = gymId;
    }

    return this.prisma.membership.findMany({
      where,
      include: {
        user: {
          select: { id: true, name: true, email: true, phone: true },
        },
        plan: true,
      },
      orderBy: { endDate: 'asc' },
    });
  }

  async getExpired(gymId?: number) {
    const now = new Date();

    const where: any = {
      status: 'active',
      endDate: { lt: now },
    };

    if (gymId) {
      where.gymId = gymId;
    }

    return this.prisma.membership.findMany({
      where,
      include: {
        user: {
          select: { id: true, name: true, email: true, phone: true },
        },
        plan: true,
      },
    });
  }

  async markExpiredMemberships() {
    const now = new Date();

    const result = await this.prisma.membership.updateMany({
      where: {
        status: 'active',
        endDate: { lt: now },
      },
      data: { status: 'expired' },
    });

    return { updated: result.count };
  }

  async getStats(gymId?: number) {
    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const endOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0);

    /* Build base where clause with optional gymId filter */
    const baseWhere = gymId ? { gymId } : {};

    const [
      totalActiveMembers,
      thisMonthRevenue,
      endingThisMonth,
      totalRevenue,
    ] = await Promise.all([
      /* Total active members (memberships with status 'active') */
      this.prisma.membership.count({
        where: {
          ...baseWhere,
          status: 'active',
          endDate: { gte: now },
        },
      }),

      /* This month revenue (paid memberships this month) */
      this.prisma.membership.aggregate({
        _sum: { finalAmount: true },
        where: {
          ...baseWhere,
          paymentStatus: 'paid',
          paidAt: {
            gte: startOfMonth,
            lte: now,
          },
        },
      }),

      /* Memberships ending this month */
      this.prisma.membership.count({
        where: {
          ...baseWhere,
          status: 'active',
          endDate: {
            gte: now,
            lte: endOfMonth,
          },
        },
      }),

      /* Total revenue (all paid memberships) */
      this.prisma.membership.aggregate({
        _sum: { finalAmount: true },
        where: {
          ...baseWhere,
          paymentStatus: 'paid',
        },
      }),
    ]);

    return {
      totalActiveMembers,
      thisMonthRevenue: Number(thisMonthRevenue._sum.finalAmount) || 0,
      endingThisMonth,
      totalRevenue: Number(totalRevenue._sum.finalAmount) || 0,
    };
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
