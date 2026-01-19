import { Injectable, NotFoundException, ConflictException } from '@nestjs/common';
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

  async findOne(id: string) {
    const plan = await this.prisma.plan.findUnique({
      where: { id },
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

  async update(id: string, dto: UpdatePlanDto) {
    await this.findOne(id);

    return this.prisma.plan.update({
      where: { id },
      data: dto,
    });
  }

  async delete(id: string) {
    await this.findOne(id);

    // Soft delete
    return this.prisma.plan.update({
      where: { id },
      data: { isActive: false },
    });
  }

  async getActiveOffers(planId: string) {
    const now = new Date();

    const planOffers = await this.prisma.planOffer.findMany({
      where: { planId },
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

  async calculatePriceWithOffer(planId: string, offerCode?: string) {
    const plan = await this.findOne(planId);

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
            const planOffer = await this.prisma.planOffer.findUnique({
              where: {
                planId_offerId: {
                  planId,
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
