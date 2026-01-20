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

  async findAll(filters?: { status?: string; userId?: number; planId?: number }) {
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

    return this.prisma.membership.findMany({
      where,
      include: {
        user: {
          select: { id: true, name: true, email: true, phone: true },
        },
        plan: true,
        offer: true,
      },
      orderBy: { createdAt: 'desc' },
    });
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

  async create(dto: CreateMembershipDto) {
    // Verify user exists
    const user = await this.prisma.user.findUnique({
      where: { id: dto.userId },
    });
    if (!user) {
      throw new NotFoundException(`User with ID ${dto.userId} not found`);
    }

    // Check if user already has active membership
    const activeMembership = await this.getActiveMembership(dto.userId);
    if (activeMembership) {
      throw new ConflictException('User already has an active membership');
    }

    // Calculate price with optional offer
    const priceCalculation = await this.plansService.calculatePriceWithOffer(
      dto.planId,
      dto.offerCode,
    );

    const plan = priceCalculation.plan;
    const offer = priceCalculation.offer;

    // Calculate end date based on plan duration
    const startDate = new Date(dto.startDate);
    const endDate = this.calculateEndDate(startDate, plan.durationValue, plan.durationType);

    const membership = await this.prisma.membership.create({
      data: {
        userId: dto.userId,
        planId: dto.planId,
        offerId: offer?.id || null,
        startDate,
        endDate,
        status: 'pending',
        originalAmount: priceCalculation.originalAmount,
        discountAmount: priceCalculation.discountAmount,
        finalAmount: priceCalculation.finalAmount,
        currency: priceCalculation.currency,
        paymentStatus: 'pending',
        paymentMethod: dto.paymentMethod,
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

  async update(id: number, dto: UpdateMembershipDto) {
    await this.findOne(id);

    const updateData: any = { ...dto };

    if (dto.paidAt) {
      updateData.paidAt = new Date(dto.paidAt);
    }

    return this.prisma.membership.update({
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
  }

  async recordPayment(id: number, dto: RecordPaymentDto) {
    const membership = await this.findOne(id);

    if (membership.paymentStatus === 'paid') {
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
    const membership = await this.findOne(id);

    if (membership.status === 'active') {
      throw new BadRequestException('Membership is already active');
    }

    if (membership.paymentStatus !== 'paid') {
      throw new BadRequestException('Cannot activate membership without payment');
    }

    return this.prisma.membership.update({
      where: { id },
      data: { status: 'active' },
    });
  }

  async cancel(id: number, dto: CancelMembershipDto) {
    const membership = await this.findOne(id);

    if (membership.status === 'cancelled') {
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

  async pause(id: number) {
    const membership = await this.findOne(id);

    if (membership.status !== 'active') {
      throw new BadRequestException('Only active memberships can be paused');
    }

    return this.prisma.membership.update({
      where: { id },
      data: { status: 'paused' },
    });
  }

  async resume(id: number) {
    const membership = await this.findOne(id);

    if (membership.status !== 'paused') {
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
      planId,
      offerCode: dto.offerCode,
      startDate: startDate.toISOString(),
      paymentMethod: dto.paymentMethod,
      notes: dto.notes,
    });
  }

  async getExpiringSoon(days = 7) {
    const now = new Date();
    const futureDate = new Date();
    futureDate.setDate(futureDate.getDate() + days);

    return this.prisma.membership.findMany({
      where: {
        status: 'active',
        endDate: {
          gte: now,
          lte: futureDate,
        },
      },
      include: {
        user: {
          select: { id: true, name: true, email: true, phone: true },
        },
        plan: true,
      },
      orderBy: { endDate: 'asc' },
    });
  }

  async getExpired() {
    const now = new Date();

    return this.prisma.membership.findMany({
      where: {
        status: 'active',
        endDate: { lt: now },
      },
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
