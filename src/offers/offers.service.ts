import { Injectable, NotFoundException, ConflictException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';
import { CreateOfferDto, UpdateOfferDto, AssignOfferToPlansDto } from './dto/offer.dto';

@Injectable()
export class OffersService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(includeInactive = false) {
    const where = includeInactive ? {} : { isActive: true };

    return this.prisma.offer.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      include: {
        planOffers: {
          include: {
            plan: {
              select: { id: true, code: true, name: true },
            },
          },
        },
      },
    });
  }

  async findActive() {
    const now = new Date();

    return this.prisma.offer.findMany({
      where: {
        isActive: true,
        validFrom: { lte: now },
        validTo: { gte: now },
      },
      orderBy: { validTo: 'asc' },
      include: {
        planOffers: {
          include: {
            plan: {
              select: { id: true, code: true, name: true },
            },
          },
        },
      },
    });
  }

  async findOne(id: string) {
    const offer = await this.prisma.offer.findUnique({
      where: { id },
      include: {
        planOffers: {
          include: {
            plan: true,
          },
        },
      },
    });

    if (!offer) {
      throw new NotFoundException(`Offer with ID ${id} not found`);
    }

    return offer;
  }

  async findByCode(code: string) {
    const offer = await this.prisma.offer.findUnique({
      where: { code },
      include: {
        planOffers: {
          include: {
            plan: {
              select: { id: true, code: true, name: true },
            },
          },
        },
      },
    });

    if (!offer) {
      throw new NotFoundException(`Offer with code ${code} not found`);
    }

    return offer;
  }

  async validateOfferCode(code: string, planId?: string) {
    const offer = await this.prisma.offer.findUnique({
      where: { code },
    });

    if (!offer) {
      return { valid: false, message: 'Offer code not found' };
    }

    if (!offer.isActive) {
      return { valid: false, message: 'Offer is not active' };
    }

    const now = new Date();
    if (offer.validFrom > now) {
      return { valid: false, message: 'Offer is not yet valid' };
    }

    if (offer.validTo < now) {
      return { valid: false, message: 'Offer has expired' };
    }

    if (offer.maxUsageCount && offer.usedCount >= offer.maxUsageCount) {
      return { valid: false, message: 'Offer usage limit reached' };
    }

    // Check if offer applies to the plan
    if (planId && !offer.applicableToAll) {
      const planOffer = await this.prisma.planOffer.findUnique({
        where: {
          planId_offerId: {
            planId,
            offerId: offer.id,
          },
        },
      });

      if (!planOffer) {
        return { valid: false, message: 'Offer does not apply to this plan' };
      }
    }

    return { valid: true, offer };
  }

  async create(dto: CreateOfferDto) {
    const existing = await this.prisma.offer.findUnique({
      where: { code: dto.code },
    });

    if (existing) {
      throw new ConflictException(`Offer with code ${dto.code} already exists`);
    }

    // Validate dates
    const validFrom = new Date(dto.validFrom);
    const validTo = new Date(dto.validTo);

    if (validTo <= validFrom) {
      throw new BadRequestException('validTo must be after validFrom');
    }

    const { planIds, ...offerData } = dto;

    const offer = await this.prisma.offer.create({
      data: {
        ...offerData,
        validFrom,
        validTo,
        applicableToAll: dto.applicableToAll ?? true,
      },
    });

    // Create plan associations if provided
    if (planIds && planIds.length > 0 && !dto.applicableToAll) {
      await this.prisma.planOffer.createMany({
        data: planIds.map(planId => ({
          planId,
          offerId: offer.id,
        })),
        skipDuplicates: true,
      });
    }

    return this.findOne(offer.id);
  }

  async update(id: string, dto: UpdateOfferDto) {
    await this.findOne(id);

    const updateData: any = { ...dto };

    if (dto.validFrom) {
      updateData.validFrom = new Date(dto.validFrom);
    }
    if (dto.validTo) {
      updateData.validTo = new Date(dto.validTo);
    }

    return this.prisma.offer.update({
      where: { id },
      data: updateData,
    });
  }

  async delete(id: string) {
    await this.findOne(id);

    return this.prisma.offer.update({
      where: { id },
      data: { isActive: false },
    });
  }

  async assignToPlans(offerId: string, dto: AssignOfferToPlansDto) {
    await this.findOne(offerId);

    // Delete existing associations
    await this.prisma.planOffer.deleteMany({
      where: { offerId },
    });

    // Create new associations
    if (dto.planIds.length > 0) {
      await this.prisma.planOffer.createMany({
        data: dto.planIds.map(planId => ({
          planId,
          offerId,
        })),
        skipDuplicates: true,
      });

      // Mark offer as not applicable to all
      await this.prisma.offer.update({
        where: { id: offerId },
        data: { applicableToAll: false },
      });
    }

    return this.findOne(offerId);
  }

  async addToPlan(offerId: string, planId: string) {
    await this.findOne(offerId);

    // Verify plan exists
    const plan = await this.prisma.plan.findUnique({
      where: { id: planId },
    });
    if (!plan) {
      throw new NotFoundException(`Plan with ID ${planId} not found`);
    }

    const existing = await this.prisma.planOffer.findUnique({
      where: {
        planId_offerId: { planId, offerId },
      },
    });

    if (existing) {
      throw new ConflictException('Offer is already assigned to this plan');
    }

    return this.prisma.planOffer.create({
      data: { planId, offerId },
      include: {
        plan: true,
        offer: true,
      },
    });
  }

  async removeFromPlan(offerId: string, planId: string) {
    const existing = await this.prisma.planOffer.findUnique({
      where: {
        planId_offerId: { planId, offerId },
      },
    });

    if (!existing) {
      throw new NotFoundException('Offer is not assigned to this plan');
    }

    await this.prisma.planOffer.delete({
      where: {
        planId_offerId: { planId, offerId },
      },
    });

    return { success: true };
  }

  async incrementUsage(offerId: string) {
    return this.prisma.offer.update({
      where: { id: offerId },
      data: { usedCount: { increment: 1 } },
    });
  }
}
