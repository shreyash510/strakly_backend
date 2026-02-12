import {
  Injectable,
  Logger,
  NotFoundException,
  BadRequestException,
  ConflictException,
} from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PrismaService } from '../database/prisma.service';
import { TenantService } from '../tenant/tenant.service';
import {
  CreateSaasPlanDto,
  UpdateSaasPlanDto,
  CreateGymSubscriptionDto,
  UpdateGymSubscriptionDto,
  CancelSubscriptionDto,
  CreatePaymentHistoryDto,
  UpdatePaymentHistoryDto,
  PaymentHistoryFiltersDto,
  InitiateManualPaymentDto,
} from './dto/saas-subscriptions.dto';
import { EmailService } from '../email/email.service';
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
  private readonly logger = new Logger(SaasSubscriptionsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly tenantService: TenantService,
    private readonly emailService: EmailService,
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
        currency: dto.currency || 'USD',
        billingPeriod: dto.billingPeriod || 'monthly',
        durationMonths: dto.durationMonths ?? 1,
        maxClients: dto.maxClients ?? -1,
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
        ...(dto.durationMonths !== undefined && { durationMonths: dto.durationMonths }),
        ...(dto.maxClients !== undefined && { maxClients: dto.maxClients }),
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
  ): Promise<PaginatedResponse<Record<string, any>>> {
    const { page, limit, skip, take } = getPaginationParams(filters);

    const where: Record<string, any> = {};

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
    const ownerMap = new Map<number, Record<string, any>>();
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
      // Use plan's durationMonths to calculate end date
      endDate = new Date(startDate);
      const months = plan.durationMonths || 3;
      endDate.setMonth(endDate.getMonth() + months);
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

    const updateData: Record<string, any> = {};

    if (dto.planId) {
      const plan = await this.prisma.saasPlan.findUnique({
        where: { id: dto.planId },
      });
      if (!plan) {
        throw new NotFoundException(`Plan with ID ${dto.planId} not found`);
      }
      updateData.planId = dto.planId;
    }

    if (dto.startDate) updateData.startDate = new Date(dto.startDate);
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

  // ============================================
  // Payment History
  // ============================================

  async getPaymentHistory(filters: PaymentHistoryFiltersDto = {}) {
    const { page = 1, limit = 10 } = filters;
    const skip = (page - 1) * limit;

    const where: Record<string, any> = {};

    if (filters.subscriptionId) {
      where.subscriptionId = filters.subscriptionId;
    }

    if (filters.gymId) {
      where.gymId = filters.gymId;
    }

    if (filters.status && filters.status !== 'all') {
      where.status = filters.status;
    }

    if (filters.gateway) {
      where.gateway = filters.gateway;
    }

    if (filters.startDate || filters.endDate) {
      where.createdAt = {};
      if (filters.startDate) {
        where.createdAt.gte = new Date(filters.startDate);
      }
      if (filters.endDate) {
        where.createdAt.lte = new Date(filters.endDate);
      }
    }

    const [payments, total] = await Promise.all([
      this.prisma.saasPaymentHistory.findMany({
        where,
        include: {
          subscription: {
            select: {
              id: true,
              status: true,
            },
          },
          gym: {
            select: {
              id: true,
              name: true,
              logo: true,
            },
          },
          plan: {
            select: {
              id: true,
              name: true,
              code: true,
            },
          },
        },
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
      }),
      this.prisma.saasPaymentHistory.count({ where }),
    ]);

    return {
      data: payments,
      pagination: createPaginationMeta(total, page, limit),
    };
  }

  async getPaymentHistoryBySubscriptionId(subscriptionId: number, filters: PaymentHistoryFiltersDto = {}) {
    return this.getPaymentHistory({ ...filters, subscriptionId });
  }

  async getPaymentHistoryByGymId(gymId: number, filters: PaymentHistoryFiltersDto = {}) {
    return this.getPaymentHistory({ ...filters, gymId });
  }

  async getPaymentById(id: number) {
    const payment = await this.prisma.saasPaymentHistory.findUnique({
      where: { id },
      include: {
        subscription: true,
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

    if (!payment) {
      throw new NotFoundException(`Payment with ID ${id} not found`);
    }

    return payment;
  }

  async createPaymentHistory(dto: CreatePaymentHistoryDto) {
    // Get subscription to validate and get gymId, planId
    const subscription = await this.findSubscriptionById(dto.subscriptionId);

    // Generate invoice number if not provided
    const invoiceNumber = dto.invoiceNumber || await this.generateInvoiceNumber();

    // Generate payment reference if not provided
    const paymentRef = dto.paymentRef || `PAY-${Date.now()}-${Math.random().toString(36).substr(2, 9).toUpperCase()}`;

    const payment = await this.prisma.saasPaymentHistory.create({
      data: {
        subscriptionId: dto.subscriptionId,
        gymId: subscription.gymId,
        planId: subscription.planId,
        amount: dto.amount,
        currency: dto.currency || 'USD',
        status: dto.status || 'pending',
        paymentMethod: dto.paymentMethod,
        paymentRef,
        gateway: dto.gateway,
        gatewayRef: dto.gatewayRef,
        billingPeriodStart: dto.billingPeriodStart
          ? new Date(dto.billingPeriodStart)
          : subscription.startDate,
        billingPeriodEnd: dto.billingPeriodEnd
          ? new Date(dto.billingPeriodEnd)
          : subscription.endDate,
        invoiceNumber,
        failureReason: dto.failureReason,
        notes: dto.notes,
        processedAt: dto.status === 'completed' ? new Date() : null,
      },
      include: {
        subscription: {
          select: {
            id: true,
            status: true,
          },
        },
        gym: {
          select: {
            id: true,
            name: true,
          },
        },
        plan: {
          select: {
            id: true,
            name: true,
          },
        },
      },
    });

    // If payment is completed, activate the subscription
    if (dto.status === 'completed') {
      await this.prisma.saasGymSubscription.update({
        where: { id: dto.subscriptionId },
        data: {
          paymentStatus: 'paid',
          status: 'active',
          lastPaymentAt: new Date(),
          paymentRef,
          paymentMethod: dto.paymentMethod,
        },
      });
    }

    return payment;
  }

  async updatePaymentHistory(id: number, dto: UpdatePaymentHistoryDto) {
    const payment = await this.getPaymentById(id);

    const updateData: Record<string, any> = {};

    if (dto.status) {
      updateData.status = dto.status;
      if (dto.status === 'completed') {
        updateData.processedAt = new Date();
      }
    }

    if (dto.gatewayRef !== undefined) updateData.gatewayRef = dto.gatewayRef;
    if (dto.failureReason !== undefined) updateData.failureReason = dto.failureReason;
    if (dto.retryCount !== undefined) updateData.retryCount = dto.retryCount;
    if (dto.notes !== undefined) updateData.notes = dto.notes;

    const updatedPayment = await this.prisma.saasPaymentHistory.update({
      where: { id },
      data: updateData,
      include: {
        subscription: true,
        gym: {
          select: {
            id: true,
            name: true,
          },
        },
        plan: {
          select: {
            id: true,
            name: true,
          },
        },
      },
    });

    // If payment status changed to completed, activate the subscription
    if (dto.status === 'completed' && payment.status !== 'completed') {
      await this.prisma.saasGymSubscription.update({
        where: { id: payment.subscriptionId },
        data: {
          paymentStatus: 'paid',
          status: 'active',
          lastPaymentAt: new Date(),
          paymentRef: payment.paymentRef,
          paymentMethod: payment.paymentMethod,
        },
      });
    }

    return updatedPayment;
  }

  async getPaymentStats(gymId?: number) {
    const where: Record<string, any> = gymId ? { gymId } : {};

    const [totalPayments, completedPayments, failedPayments, totalRevenue] =
      await Promise.all([
        this.prisma.saasPaymentHistory.count({ where }),
        this.prisma.saasPaymentHistory.count({
          where: { ...where, status: 'completed' },
        }),
        this.prisma.saasPaymentHistory.count({
          where: { ...where, status: 'failed' },
        }),
        this.prisma.saasPaymentHistory.aggregate({
          where: { ...where, status: 'completed' },
          _sum: { amount: true },
        }),
      ]);

    // Get monthly revenue for the last 6 months
    const sixMonthsAgo = new Date();
    sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);

    const monthlyPayments = await this.prisma.saasPaymentHistory.groupBy({
      by: ['createdAt'],
      where: {
        ...where,
        status: 'completed',
        createdAt: { gte: sixMonthsAgo },
      },
      _sum: { amount: true },
      _count: { id: true },
    });

    return {
      totalPayments,
      completedPayments,
      failedPayments,
      pendingPayments: totalPayments - completedPayments - failedPayments,
      totalRevenue: totalRevenue._sum.amount?.toNumber() || 0,
      successRate:
        totalPayments > 0
          ? Math.round((completedPayments / totalPayments) * 100)
          : 0,
    };
  }

  private async generateInvoiceNumber(): Promise<string> {
    const year = new Date().getFullYear();
    const month = String(new Date().getMonth() + 1).padStart(2, '0');

    // Get the count of invoices this month
    const startOfMonth = new Date(year, new Date().getMonth(), 1);
    const endOfMonth = new Date(year, new Date().getMonth() + 1, 0);

    const count = await this.prisma.saasPaymentHistory.count({
      where: {
        createdAt: {
          gte: startOfMonth,
          lte: endOfMonth,
        },
      },
    });

    const sequence = String(count + 1).padStart(4, '0');
    return `INV-${year}${month}-${sequence}`;
  }

  // ============================================
  // Manual Payment Flow
  // ============================================

  async initiateManualPayment(gymId: number, dto: InitiateManualPaymentDto) {
    // Validate gym exists
    const gym = await this.prisma.gym.findUnique({
      where: { id: gymId },
      select: { id: true, name: true, email: true },
    });
    if (!gym) {
      throw new NotFoundException('Gym not found');
    }

    // Validate plan exists and is active
    const plan = await this.prisma.saasPlan.findUnique({
      where: { id: dto.planId },
    });
    if (!plan) {
      throw new NotFoundException('Plan not found');
    }
    if (!plan.isActive) {
      throw new BadRequestException('Plan is not available');
    }

    const isFree = plan.price.toNumber() === 0;
    const startDate = new Date();
    const endDate = new Date(startDate);
    endDate.setMonth(endDate.getMonth() + (plan.durationMonths || 1));

    const amount = plan.price.toNumber();
    const status = isFree ? 'active' : 'trial';
    const paymentStatus = isFree ? 'paid' : 'pending';

    // Check for existing subscription (renewal vs new)
    const existing = await this.prisma.saasGymSubscription.findUnique({
      where: { gymId },
    });

    let subscription;

    if (existing) {
      // Renewal: update existing subscription with new plan
      subscription = await this.prisma.saasGymSubscription.update({
        where: { gymId },
        data: {
          planId: dto.planId,
          startDate,
          endDate,
          status,
          paymentStatus,
          amount,
          paymentMethod: dto.paymentMethod,
          paymentRef: dto.paymentRef,
          notes: dto.notes,
          trialEndsAt: status === 'trial' ? endDate : null,
          cancelledAt: null,
          cancelReason: null,
        },
        include: { gym: { select: { id: true, name: true, logo: true } }, plan: true },
      });
    } else {
      // New subscription
      subscription = await this.prisma.saasGymSubscription.create({
        data: {
          gymId,
          planId: dto.planId,
          startDate,
          endDate,
          status,
          paymentStatus,
          amount,
          paymentMethod: dto.paymentMethod,
          paymentRef: dto.paymentRef,
          notes: dto.notes,
          trialEndsAt: status === 'trial' ? endDate : null,
        },
        include: { gym: { select: { id: true, name: true, logo: true } }, plan: true },
      });
    }

    // Create payment history record
    const invoiceNumber = await this.generateInvoiceNumber();
    const paymentRef =
      dto.paymentRef ||
      `PAY-${Date.now()}-${Math.random().toString(36).substring(2, 11).toUpperCase()}`;

    const payment = await this.prisma.saasPaymentHistory.create({
      data: {
        subscriptionId: subscription.id,
        gymId,
        planId: dto.planId,
        amount,
        currency: plan.currency,
        status: isFree ? 'completed' : 'pending',
        paymentMethod: dto.paymentMethod,
        paymentRef,
        gateway: 'manual',
        billingPeriodStart: startDate,
        billingPeriodEnd: endDate,
        invoiceNumber,
        notes: dto.notes,
        processedAt: isFree ? new Date() : null,
      },
    });

    // For free plans, send receipt email immediately
    if (isFree) {
      await this.sendPaymentReceiptEmail(subscription.id);
    }

    return { subscription, payment };
  }

  async approvePayment(paymentId: number) {
    const payment = await this.getPaymentById(paymentId);

    if (payment.status === 'completed') {
      throw new BadRequestException('Payment is already completed');
    }

    // Update payment to completed
    const updatedPayment = await this.prisma.saasPaymentHistory.update({
      where: { id: paymentId },
      data: {
        status: 'completed',
        processedAt: new Date(),
      },
      include: {
        subscription: true,
        gym: { select: { id: true, name: true, email: true } },
        plan: { select: { id: true, name: true } },
      },
    });

    // Activate the subscription
    await this.prisma.saasGymSubscription.update({
      where: { id: payment.subscriptionId },
      data: {
        paymentStatus: 'paid',
        status: 'active',
        lastPaymentAt: new Date(),
        paymentRef: payment.paymentRef,
        paymentMethod: payment.paymentMethod,
      },
    });

    // Send receipt email
    await this.sendPaymentReceiptEmail(payment.subscriptionId);

    return updatedPayment;
  }

  private async sendPaymentReceiptEmail(subscriptionId: number) {
    try {
      const subscription = await this.prisma.saasGymSubscription.findUnique({
        where: { id: subscriptionId },
        include: {
          gym: { select: { id: true, name: true, email: true } },
          plan: true,
        },
      });

      if (!subscription || !subscription.gym?.email) return;

      // Find the admin user for this gym
      const admin = await this.prisma.userGymXref.findFirst({
        where: { gymId: subscription.gymId, role: 'admin', isActive: true },
        include: { user: { select: { name: true, email: true } } },
      });

      const recipientEmail = admin?.user?.email || subscription.gym.email;
      const recipientName = admin?.user?.name || subscription.gym.name;

      await this.emailService.sendPaymentReceiptEmail(
        recipientEmail,
        recipientName,
        subscription.gym.name,
        subscription.amount.toNumber(),
        subscription.plan?.currency || 'INR',
        subscription.plan?.name || 'Subscription',
        new Date(),
        undefined,
        new Date(subscription.endDate),
      );
    } catch (error) {
      this.logger.error('Failed to send payment receipt email', error);
    }
  }

  // ============================================
  // Cron: Auto-expire subscriptions
  // ============================================

  @Cron(CronExpression.EVERY_DAY_AT_MIDNIGHT)
  async handleExpiredSubscriptions() {
    this.logger.log('Running subscription expiry check...');

    try {
      const now = new Date();

      const result = await this.prisma.saasGymSubscription.updateMany({
        where: {
          endDate: { lt: now },
          status: { in: ['active', 'trial'] },
        },
        data: {
          status: 'expired',
        },
      });

      if (result.count > 0) {
        this.logger.log(`Expired ${result.count} subscription(s)`);
      } else {
        this.logger.log('No subscriptions to expire');
      }
    } catch (error) {
      this.logger.error('Failed to expire subscriptions', error);
    }
  }
}
