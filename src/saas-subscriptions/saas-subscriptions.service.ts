import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ConflictException,
} from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';
import { TenantService } from '../tenant/tenant.service';
import {
  CreateSaasPlanDto,
  UpdateSaasPlanDto,
  CreateGymSubscriptionDto,
  UpdateGymSubscriptionDto,
  CancelSubscriptionDto,
} from './dto/saas-subscriptions.dto';
import {
  PaginationParams,
  PaginatedResponse,
  getPaginationParams,
  createPaginationMeta,
} from '../common/pagination.util';

export interface SubscriptionFilters extends PaginationParams {
  status?: string;
  planId?: number;
  paymentStatus?: string;
}

@Injectable()
export class SaasSubscriptionsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tenantService: TenantService,
  ) {}

  // ============================================
  // SaaS Plans
  // ============================================

  async findAllPlans(includeInactive = false) {
    const where = includeInactive ? {} : { isActive: true };

    const plans = await this.prisma.saasPlan.findMany({
      where,
      orderBy: { displayOrder: 'asc' },
      include: {
        _count: {
          select: { gymSubscriptions: true },
        },
      },
    });

    return plans.map((plan) => ({
      ...plan,
      subscriberCount: plan._count.gymSubscriptions,
      _count: undefined,
    }));
  }

  async findPlanById(id: number) {
    const plan = await this.prisma.saasPlan.findUnique({
      where: { id },
      include: {
        _count: {
          select: { gymSubscriptions: true },
        },
      },
    });

    if (!plan) {
      throw new NotFoundException(`Plan with ID ${id} not found`);
    }

    return {
      ...plan,
      subscriberCount: plan._count.gymSubscriptions,
      _count: undefined,
    };
  }

  async createPlan(dto: CreateSaasPlanDto) {
    // Check if code already exists
    const existing = await this.prisma.saasPlan.findUnique({
      where: { code: dto.code },
    });

    if (existing) {
      throw new ConflictException(
        `Plan with code '${dto.code}' already exists`,
      );
    }

    return this.prisma.saasPlan.create({
      data: {
        code: dto.code,
        name: dto.name,
        description: dto.description,
        price: dto.price,
        currency: dto.currency || 'INR',
        billingPeriod: dto.billingPeriod || 'monthly',
        maxMembers: dto.maxMembers ?? -1,
        maxStaff: dto.maxStaff ?? -1,
        maxBranches: dto.maxBranches ?? 1,
        features: dto.features || [],
        displayOrder: dto.displayOrder ?? 0,
        isFeatured: dto.isFeatured ?? false,
        badge: dto.badge,
        isActive: dto.isActive ?? true,
      },
    });
  }

  async updatePlan(id: number, dto: UpdateSaasPlanDto) {
    await this.findPlanById(id);

    return this.prisma.saasPlan.update({
      where: { id },
      data: {
        ...(dto.name && { name: dto.name }),
        ...(dto.description !== undefined && { description: dto.description }),
        ...(dto.price !== undefined && { price: dto.price }),
        ...(dto.maxMembers !== undefined && { maxMembers: dto.maxMembers }),
        ...(dto.maxStaff !== undefined && { maxStaff: dto.maxStaff }),
        ...(dto.maxBranches !== undefined && { maxBranches: dto.maxBranches }),
        ...(dto.features && { features: dto.features }),
        ...(dto.displayOrder !== undefined && {
          displayOrder: dto.displayOrder,
        }),
        ...(dto.isFeatured !== undefined && { isFeatured: dto.isFeatured }),
        ...(dto.badge !== undefined && { badge: dto.badge }),
        ...(dto.isActive !== undefined && { isActive: dto.isActive }),
      },
    });
  }

  async deletePlan(id: number) {
    const plan = await this.findPlanById(id);

    // Check if any gyms are subscribed to this plan
    const activeSubscriptions = await this.prisma.saasGymSubscription.count({
      where: {
        planId: id,
        status: { in: ['active', 'trial'] },
      },
    });

    if (activeSubscriptions > 0) {
      throw new BadRequestException(
        `Cannot delete plan with ${activeSubscriptions} active subscriptions`,
      );
    }

    return this.prisma.saasPlan.delete({ where: { id } });
  }

  // ============================================
  // Gym Subscriptions
  // ============================================

  async findAllSubscriptions(
    filters: SubscriptionFilters = {},
  ): Promise<PaginatedResponse<any>> {
    const { page, limit, skip, take } = getPaginationParams(filters);

    const where: any = {};

    if (filters.status && filters.status !== 'all') {
      where.status = filters.status;
    }

    if (filters.planId) {
      where.planId = filters.planId;
    }

    if (filters.paymentStatus && filters.paymentStatus !== 'all') {
      where.paymentStatus = filters.paymentStatus;
    }

    if (filters.search) {
      where.gym = {
        OR: [
          { name: { contains: filters.search, mode: 'insensitive' } },
          { email: { contains: filters.search, mode: 'insensitive' } },
        ],
      };
    }

    const [subscriptions, total] = await Promise.all([
      this.prisma.saasGymSubscription.findMany({
        where,
        include: {
          gym: {
            select: {
              id: true,
              name: true,
              logo: true,
              email: true,
              city: true,
            },
          },
          plan: {
            select: {
              id: true,
              code: true,
              name: true,
              price: true,
            },
          },
        },
        orderBy: { createdAt: 'desc' },
        skip,
        take,
      }),
      this.prisma.saasGymSubscription.count({ where }),
    ]);

    // Get admin owners for each gym from user_gym_xref (public.users)
    const gymIds = subscriptions.map((s) => s.gym.id);
    const adminAssignments = await this.prisma.userGymXref.findMany({
      where: {
        gymId: { in: gymIds },
        role: 'admin',
        isActive: true,
      },
      include: {
        user: {
          select: {
            id: true,
            name: true,
            email: true,
            avatar: true,
          },
        },
      },
    });

    // Create a map of gymId -> admin info
    const ownerMap = new Map<number, any>();
    for (const assignment of adminAssignments) {
      if (!ownerMap.has(assignment.gymId)) {
        ownerMap.set(assignment.gymId, {
          id: assignment.user.id,
          name: assignment.user.name,
          email: assignment.user.email,
          avatar: assignment.user.avatar,
        });
      }
    }

    // Format subscriptions with owner info
    const formattedSubscriptions = subscriptions.map((sub) => ({
      ...sub,
      gym: {
        ...sub.gym,
        owner: ownerMap.get(sub.gym.id) || null,
      },
    }));

    return {
      data: formattedSubscriptions,
      pagination: createPaginationMeta(total, page, limit),
    };
  }

  async findSubscriptionById(id: number) {
    const subscription = await this.prisma.saasGymSubscription.findUnique({
      where: { id },
      include: {
        gym: true,
        plan: true,
      },
    });

    if (!subscription) {
      throw new NotFoundException(`Subscription with ID ${id} not found`);
    }

    return subscription;
  }

  async findSubscriptionByGymId(gymId: number) {
    const subscription = await this.prisma.saasGymSubscription.findUnique({
      where: { gymId },
      include: {
        gym: {
          select: {
            id: true,
            name: true,
            logo: true,
            email: true,
          },
        },
        plan: true,
      },
    });

    return subscription;
  }

  async createSubscription(dto: CreateGymSubscriptionDto) {
    // Check if gym exists
    const gym = await this.prisma.gym.findUnique({
      where: { id: dto.gymId },
    });

    if (!gym) {
      throw new NotFoundException(`Gym with ID ${dto.gymId} not found`);
    }

    // Check if gym already has a subscription
    const existingSubscription =
      await this.prisma.saasGymSubscription.findUnique({
        where: { gymId: dto.gymId },
      });

    if (existingSubscription) {
      throw new ConflictException(
        `Gym already has a subscription. Use update instead.`,
      );
    }

    // Get plan
    const plan = await this.prisma.saasPlan.findUnique({
      where: { id: dto.planId },
    });

    if (!plan) {
      throw new NotFoundException(`Plan with ID ${dto.planId} not found`);
    }

    // Calculate dates
    const startDate = dto.startDate ? new Date(dto.startDate) : new Date();
    let endDate: Date;

    if (dto.endDate) {
      endDate = new Date(dto.endDate);
    } else {
      // Default to 1 month for paid, or trial period
      endDate = new Date(startDate);
      if (plan.price.toNumber() === 0) {
        // Free plan - set far future date
        endDate.setFullYear(2099);
      } else if (dto.status === 'trial') {
        // Trial - 14 days
        endDate.setDate(endDate.getDate() + 14);
      } else {
        // Paid - 1 month
        endDate.setMonth(endDate.getMonth() + 1);
      }
    }

    const amount = dto.amount ?? plan.price.toNumber();
    const status =
      dto.status || (plan.price.toNumber() === 0 ? 'active' : 'trial');
    const paymentStatus =
      dto.paymentStatus || (plan.price.toNumber() === 0 ? 'paid' : 'pending');

    return this.prisma.saasGymSubscription.create({
      data: {
        gymId: dto.gymId,
        planId: dto.planId,
        startDate,
        endDate,
        status,
        trialEndsAt: status === 'trial' ? endDate : null,
        amount,
        paymentStatus,
        paymentMethod: dto.paymentMethod,
        paymentRef: dto.paymentRef,
        notes: dto.notes,
      },
      include: {
        gym: {
          select: {
            id: true,
            name: true,
            logo: true,
          },
        },
        plan: true,
      },
    });
  }

  async updateSubscription(id: number, dto: UpdateGymSubscriptionDto) {
    await this.findSubscriptionById(id);

    const updateData: any = {};

    if (dto.planId) {
      const plan = await this.prisma.saasPlan.findUnique({
        where: { id: dto.planId },
      });
      if (!plan) {
        throw new NotFoundException(`Plan with ID ${dto.planId} not found`);
      }
      updateData.planId = dto.planId;
    }

    if (dto.endDate) updateData.endDate = new Date(dto.endDate);
    if (dto.status) updateData.status = dto.status;
    if (dto.amount !== undefined) updateData.amount = dto.amount;
    if (dto.paymentStatus) updateData.paymentStatus = dto.paymentStatus;
    if (dto.paymentMethod !== undefined)
      updateData.paymentMethod = dto.paymentMethod;
    if (dto.paymentRef !== undefined) updateData.paymentRef = dto.paymentRef;
    if (dto.autoRenew !== undefined) updateData.autoRenew = dto.autoRenew;
    if (dto.notes !== undefined) updateData.notes = dto.notes;

    // If payment status changed to paid, update lastPaymentAt
    if (dto.paymentStatus === 'paid') {
      updateData.lastPaymentAt = new Date();
    }

    return this.prisma.saasGymSubscription.update({
      where: { id },
      data: updateData,
      include: {
        gym: {
          select: {
            id: true,
            name: true,
            logo: true,
          },
        },
        plan: true,
      },
    });
  }

  async cancelSubscription(id: number, dto: CancelSubscriptionDto) {
    await this.findSubscriptionById(id);

    return this.prisma.saasGymSubscription.update({
      where: { id },
      data: {
        status: 'cancelled',
        cancelledAt: new Date(),
        cancelReason: dto.cancelReason,
        autoRenew: false,
      },
      include: {
        gym: {
          select: {
            id: true,
            name: true,
          },
        },
        plan: true,
      },
    });
  }

  // ============================================
  // Statistics
  // ============================================

  async getStats() {
    const [
      totalGyms,
      activeSubscriptions,
      trialSubscriptions,
      monthlyRevenue,
      planDistribution,
    ] = await Promise.all([
      this.prisma.saasGymSubscription.count(),
      this.prisma.saasGymSubscription.count({ where: { status: 'active' } }),
      this.prisma.saasGymSubscription.count({ where: { status: 'trial' } }),
      this.prisma.saasGymSubscription.aggregate({
        where: {
          paymentStatus: 'paid',
          status: 'active',
        },
        _sum: { amount: true },
      }),
      this.prisma.saasGymSubscription.groupBy({
        by: ['planId'],
        _count: { id: true },
        where: { status: { in: ['active', 'trial'] } },
      }),
    ]);

    // Get plan names for distribution
    const plans = await this.prisma.saasPlan.findMany({
      select: { id: true, name: true },
    });
    const planMap = new Map(plans.map((p) => [p.id, p.name]));

    const distribution = planDistribution.map((d) => ({
      planId: d.planId,
      planName: planMap.get(d.planId) || 'Unknown',
      count: d._count.id,
    }));

    return {
      totalGyms,
      activeSubscriptions,
      trialSubscriptions,
      expiredSubscriptions:
        totalGyms - activeSubscriptions - trialSubscriptions,
      monthlyRevenue: monthlyRevenue._sum.amount?.toNumber() || 0,
      planDistribution: distribution,
    };
  }
}
