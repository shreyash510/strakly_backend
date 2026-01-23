import { Injectable, NotFoundException, ConflictException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';
import { CreatePlanDto, UpdatePlanDto } from './dto/plan.dto';
import type { Offer } from '@prisma/client';

@Injectable()
export class PlansService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(includeInactive = false) {
    const where = includeInactive ? {} : { isActive: true };

    return this.prisma.plan.findMany({
      where,
      orderBy: { displayOrder: 'asc' },
    });
  }

  async findFeatured() {
    return this.prisma.plan.findMany({
      where: { isActive: true, isFeatured: true },
      orderBy: { displayOrder: 'asc' },
    });
  }

  async findOne(id: number | string) {
    const numId = typeof id === 'string' ? parseInt(id) : id;
    const plan = await this.prisma.plan.findUnique({
      where: { id: numId },
      include: {
        planOffers: {
          include: {
            offer: true,
          },
        },
      },
    });

    if (!plan) {
      throw new NotFoundException(`Plan with ID ${id} not found`);
    }

    return plan;
  }

  async findByCode(code: string) {
    const plan = await this.prisma.plan.findUnique({
      where: { code },
      include: {
        planOffers: {
          include: {
            offer: true,
          },
        },
      },
    });

    if (!plan) {
      throw new NotFoundException(`Plan with code ${code} not found`);
    }

    // Filter active offers
    const now = new Date();
    const activeOffers = plan.planOffers.filter(
      po => po.offer.isActive && po.offer.validFrom <= now && po.offer.validTo >= now
    );

    return {
      ...plan,
      planOffers: activeOffers,
    };
  }

  async create(dto: CreatePlanDto) {
    const existing = await this.prisma.plan.findUnique({
      where: { code: dto.code },
    });

    if (existing) {
      throw new ConflictException(`Plan with code ${dto.code} already exists`);
    }

    return this.prisma.plan.create({
      data: {
        code: dto.code,
        name: dto.name,
        description: dto.description,
        durationValue: dto.durationValue,
        durationType: dto.durationType,
        price: dto.price,
        currency: dto.currency || 'INR',
        features: dto.features || [],
        displayOrder: dto.displayOrder || 0,
        isFeatured: dto.isFeatured || false,
      },
    });
  }

  async update(id: number | string, dto: UpdatePlanDto) {
    const numId = typeof id === 'string' ? parseInt(id) : id;
    await this.findOne(numId);

    return this.prisma.plan.update({
      where: { id: numId },
      data: dto,
    });
  }

  async delete(id: number | string) {
    const numId = typeof id === 'string' ? parseInt(id) : id;
    await this.findOne(numId);

    // Check for active memberships using this plan
    const activeMemberships = await this.prisma.membership.count({
      where: {
        planId: numId,
        status: { in: ['active', 'pending'] },
      },
    });

    if (activeMemberships > 0) {
      throw new BadRequestException(
        `Cannot delete plan. ${activeMemberships} active membership(s) are using this plan.`,
      );
    }

    // Soft delete
    return this.prisma.plan.update({
      where: { id: numId },
      data: { isActive: false },
    });
  }

  async getActiveOffers(planId: number | string) {
    const numPlanId = typeof planId === 'string' ? parseInt(planId) : planId;
    const now = new Date();

    const planOffers = await this.prisma.planOfferXref.findMany({
      where: { planId: numPlanId },
      include: {
        offer: true,
      },
    });

    // Filter active offers
    const planSpecificOffers = planOffers
      .map(po => po.offer)
      .filter(offer => offer.isActive && offer.validFrom <= now && offer.validTo >= now);

    // Also get offers that apply to all plans
    const globalOffers = await this.prisma.offer.findMany({
      where: {
        isActive: true,
        applicableToAll: true,
        validFrom: { lte: now },
        validTo: { gte: now },
      },
    });

    return [...planSpecificOffers, ...globalOffers];
  }

  async calculatePriceWithOffer(planId: number | string, offerCode?: string) {
    const numPlanId = typeof planId === 'string' ? parseInt(planId) : planId;
    const plan = await this.findOne(numPlanId);

    let discount = 0;
    let validOffer: Offer | null = null;

    if (offerCode) {
      const offer = await this.prisma.offer.findUnique({
        where: { code: offerCode },
      });

      if (offer && offer.isActive) {
        const now = new Date();
        if (offer.validFrom <= now && offer.validTo >= now) {
          let isValid = true;

          // Check if offer applies to this plan
          if (!offer.applicableToAll) {
            const planOffer = await this.prisma.planOfferXref.findUnique({
              where: {
                planId_offerId: {
                  planId: numPlanId,
                  offerId: offer.id,
                },
              },
            });
            if (!planOffer) {
              isValid = false;
            }
          }

          // Check min purchase amount
          if (isValid && offer.minPurchaseAmount && Number(plan.price) < Number(offer.minPurchaseAmount)) {
            isValid = false;
          }

          // Check usage limit
          if (isValid && offer.maxUsageCount && offer.usedCount >= offer.maxUsageCount) {
            isValid = false;
          }

          if (isValid) {
            validOffer = offer;
            if (offer.discountType === 'percentage') {
              discount = (Number(plan.price) * Number(offer.discountValue)) / 100;
            } else {
              discount = Number(offer.discountValue);
            }
          }
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
