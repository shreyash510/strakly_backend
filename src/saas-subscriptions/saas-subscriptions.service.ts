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
  VerifyRazorpayPaymentDto,
} from './dto/saas-subscriptions.dto';
import { RazorpayService } from '../razorpay/razorpay.service';
import { EmailService } from '../email/email.service';
import { NotificationsGateway } from '../notifications/notifications.gateway';
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
    private readonly razorpayService: RazorpayService,
    private readonly notificationsGateway: NotificationsGateway,
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
        durationMonths: dto.durationMonths ?? 1,
        maxClients: dto.maxClients ?? -1,
        maxStaff: dto.maxStaff ?? -1,
        maxBranches: dto.maxBranches ?? 1,
        maxProducts: dto.maxProducts ?? -1,
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
        ...(dto.maxProducts !== undefined && { maxProducts: dto.maxProducts }),
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
        'Cannot delete plan with active subscribers. Deactivate or migrate them first.',
      );
    }

    // Hard-delete: permanently remove plan from database
    await this.prisma.saasPlan.delete({
      where: { id },
    });

    return { message: `Plan "${plan.name}" has been permanently deleted.` };
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
      const months = plan.durationMonths || 1;
      endDate.setMonth(endDate.getMonth() + months);
    }

    const amount = dto.amount ?? plan.price.toNumber();
    const status =
      dto.status || (plan.price.toNumber() === 0 ? 'active' : 'trial');
    const paymentStatus =
      dto.paymentStatus || (plan.price.toNumber() === 0 ? 'paid' : 'pending');

    // Validate date order
    if (endDate <= startDate) {
      throw new BadRequestException('End date must be after start date');
    }

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
    const subscription = await this.findSubscriptionById(id);

    const updateData: Record<string, any> = {};

    // If plan is changing, auto-recalculate dates and amount from the new plan
    if (dto.planId && dto.planId !== subscription.planId) {
      const plan = await this.prisma.saasPlan.findUnique({
        where: { id: dto.planId },
      });
      if (!plan) {
        throw new NotFoundException(`Plan with ID ${dto.planId} not found`);
      }
      updateData.planId = dto.planId;
      updateData.amount = plan.price.toNumber();

      // Auto-calculate new dates from today + plan duration
      const now = new Date();
      const newEndDate = new Date(now);
      newEndDate.setMonth(newEndDate.getMonth() + (plan.durationMonths || 1));
      updateData.startDate = now;
      updateData.endDate = newEndDate;
    }

    // Manual date overrides (only if not already set by plan change)
    if (dto.startDate && !updateData.startDate) updateData.startDate = new Date(dto.startDate);
    if (dto.endDate && !updateData.endDate) updateData.endDate = new Date(dto.endDate);
    if (dto.status) updateData.status = dto.status;
    if (dto.amount !== undefined && !updateData.amount) updateData.amount = dto.amount;
    if (dto.paymentStatus) updateData.paymentStatus = dto.paymentStatus;
    if (dto.paymentMethod !== undefined)
      updateData.paymentMethod = dto.paymentMethod;
    if (dto.paymentRef !== undefined) updateData.paymentRef = dto.paymentRef;
    if (dto.autoRenew !== undefined) updateData.autoRenew = dto.autoRenew;
    if (dto.notes !== undefined) updateData.notes = dto.notes;

    // If payment status CHANGED to paid (was not already paid), auto-extend endDate by plan duration (renewal)
    if (dto.paymentStatus === 'paid') {
      updateData.lastPaymentAt = new Date();

      // Only auto-extend if paymentStatus is actually changing (not already 'paid')
      if (subscription.paymentStatus !== 'paid') {
        const planToUse = updateData.planId
          ? await this.prisma.saasPlan.findUnique({ where: { id: updateData.planId } })
          : subscription.plan;
        const plan = planToUse || subscription.plan;
        if (plan?.durationMonths) {
          const currentEndDate = new Date(subscription.endDate);
          const now = new Date();
          // If subscription already expired, extend from today; otherwise from current endDate
          const baseDate = currentEndDate > now ? currentEndDate : now;
          const newEndDate = new Date(baseDate);
          newEndDate.setMonth(newEndDate.getMonth() + plan.durationMonths);
          updateData.endDate = newEndDate;
          updateData.startDate = baseDate;
        }
      }
    }

    // Validate date order
    const finalStartDate = updateData.startDate || subscription.startDate;
    const finalEndDate = updateData.endDate || subscription.endDate;
    if (finalEndDate && finalStartDate && new Date(finalEndDate) <= new Date(finalStartDate)) {
      throw new BadRequestException('End date must be after start date');
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

  async renewSubscription(id: number, planId?: number) {
    const subscription = await this.findSubscriptionById(id);

    // Use provided planId or fall back to current plan
    let plan = subscription.plan;
    if (planId && planId !== subscription.planId) {
      const newPlan = await this.prisma.saasPlan.findUnique({ where: { id: planId } });
      if (!newPlan) {
        throw new NotFoundException(`Plan with ID ${planId} not found`);
      }
      if (!newPlan.isActive) {
        throw new BadRequestException('Selected plan is not active');
      }
      plan = newPlan;
    }

    if (!plan) {
      throw new BadRequestException('Subscription has no associated plan');
    }

    const now = new Date();
    const currentEndDate = new Date(subscription.endDate);

    // If still active/future, extend from current endDate; otherwise from today
    const baseDate = currentEndDate > now && ['active', 'trial'].includes(subscription.status)
      ? currentEndDate
      : now;

    const newEndDate = new Date(baseDate);
    newEndDate.setMonth(newEndDate.getMonth() + (plan.durationMonths || 1));

    // Update subscription
    const updated = await this.prisma.saasGymSubscription.update({
      where: { id },
      data: {
        planId: plan.id,
        startDate: baseDate,
        endDate: newEndDate,
        status: 'active',
        paymentStatus: 'paid',
        amount: plan.price.toNumber(),
        lastPaymentAt: now,
        cancelledAt: null,
        cancelReason: null,
        trialEndsAt: null,
      },
      include: {
        gym: { select: { id: true, name: true, logo: true } },
        plan: true,
      },
    });

    // Reactivate gym if deactivated
    await this.prisma.gym.update({
      where: { id: updated.gymId },
      data: { isActive: true },
    });

    // Create payment history record
    const invoiceNumber = await this.generateInvoiceNumber();
    await this.prisma.saasPaymentHistory.create({
      data: {
        subscriptionId: id,
        gymId: updated.gymId,
        planId: plan.id,
        amount: plan.price.toNumber(),
        currency: plan.currency,
        status: 'completed',
        paymentMethod: 'manual',
        paymentRef: `RENEW-${Date.now()}`,
        gateway: 'manual',
        billingPeriodStart: baseDate,
        billingPeriodEnd: newEndDate,
        invoiceNumber,
        processedAt: now,
        notes: 'Renewed by superadmin',
      },
    });

    // Notify gym admin(s) about the renewal
    try {
      const adminXrefs = await this.prisma.userGymXref.findMany({
        where: { gymId: updated.gymId, role: 'admin', isActive: true },
        select: { userId: true },
      });

      for (const xref of adminXrefs) {
        await this.prisma.systemNotification.create({
          data: {
            userId: xref.userId,
            type: 'subscription_renewed',
            title: 'Subscription Renewed',
            message: `Your gym subscription has been renewed on the ${plan.name} plan. Valid until ${newEndDate.toLocaleDateString()}.`,
            data: {
              gymId: updated.gymId,
              gymName: updated.gym.name,
              planName: plan.name,
              endDate: newEndDate.toISOString(),
            },
            actionUrl: '/gym-subscription',
            priority: 'normal',
          },
        });

        // Emit real-time notification
        this.notificationsGateway.emitToSuperadmin(xref.userId, {
          id: 0,
          userId: xref.userId,
          type: 'subscription_renewed' as any,
          title: 'Subscription Renewed',
          message: `Your gym subscription has been renewed on the ${plan.name} plan. Valid until ${newEndDate.toLocaleDateString()}.`,
          data: null,
          isRead: false,
          readAt: null,
          actionUrl: '/gym-subscription',
          priority: 'normal' as any,
          expiresAt: null,
          createdAt: now,
          createdBy: null,
        });
      }
    } catch (error) {
      // Don't fail the renewal if notification fails
      const msg = error instanceof Error ? error.message : String(error);
      this.logger.warn(`Failed to notify gym admins about renewal: ${msg}`);
    }

    // Send payment receipt email
    try {
      await this.sendPaymentReceiptEmail(id);
    } catch {
      this.logger.warn(`Failed to send renewal receipt email for subscription ${id}`);
    }

    return updated;
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
      expiredSubscriptions,
      cancelledSubscriptions,
      suspendedSubscriptions,
      monthlyRevenue,
      planDistribution,
    ] = await Promise.all([
      this.prisma.saasGymSubscription.count(),
      this.prisma.saasGymSubscription.count({ where: { status: 'active' } }),
      this.prisma.saasGymSubscription.count({ where: { status: 'trial' } }),
      this.prisma.saasGymSubscription.count({ where: { status: 'expired' } }),
      this.prisma.saasGymSubscription.count({ where: { status: 'cancelled' } }),
      this.prisma.saasGymSubscription.count({ where: { status: 'suspended' } }),
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
      expiredSubscriptions,
      cancelledSubscriptions,
      suspendedSubscriptions,
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
    const amount = plan.price.toNumber();

    // Check for existing subscription (renewal vs new)
    const existing = await this.prisma.saasGymSubscription.findUnique({
      where: { gymId },
    });

    // For renewals: new subscription starts from existing end date (if still active/future)
    // For new subscriptions or expired ones: start from today
    const now = new Date();
    let startDate: Date;
    if (existing && new Date(existing.endDate) > now && ['active', 'trial'].includes(existing.status)) {
      startDate = new Date(existing.endDate);
    } else {
      startDate = now;
    }
    const endDate = new Date(startDate);
    endDate.setMonth(endDate.getMonth() + (plan.durationMonths || 1));

    let subscription;

    // For paid plans with an existing active subscription: DON'T overwrite the subscription yet.
    // Only update it on payment approval. This prevents losing the current plan if payment is rejected.
    const hasActiveExisting = existing && ['active', 'trial'].includes(existing.status);

    if (isFree && existing) {
      // Free plan: activate immediately
      subscription = await this.prisma.saasGymSubscription.update({
        where: { gymId },
        data: {
          planId: dto.planId,
          startDate,
          endDate,
          status: 'active',
          paymentStatus: 'paid',
          amount,
          paymentMethod: dto.paymentMethod,
          paymentRef: dto.paymentRef,
          notes: dto.notes,
          trialEndsAt: null,
          cancelledAt: null,
          cancelReason: null,
        },
        include: { gym: { select: { id: true, name: true, logo: true } }, plan: true },
      });
    } else if (isFree && !existing) {
      // Free plan, new subscription: create and activate immediately
      subscription = await this.prisma.saasGymSubscription.create({
        data: {
          gymId,
          planId: dto.planId,
          startDate,
          endDate,
          status: 'active',
          paymentStatus: 'paid',
          amount,
          paymentMethod: dto.paymentMethod,
          paymentRef: dto.paymentRef,
          notes: dto.notes,
        },
        include: { gym: { select: { id: true, name: true, logo: true } }, plan: true },
      });
    } else if (hasActiveExisting) {
      // Paid plan with active subscription: keep current subscription unchanged
      // Payment record will store the new plan details; subscription updates on approval
      subscription = await this.prisma.saasGymSubscription.findUnique({
        where: { gymId },
        include: { gym: { select: { id: true, name: true, logo: true } }, plan: true },
      });
    } else if (existing) {
      // Paid plan, existing but expired/cancelled: update to pending
      // Don't change subscription status on payment initiation - only update when payment is confirmed
      subscription = await this.prisma.saasGymSubscription.update({
        where: { gymId },
        data: {
          planId: dto.planId,
          startDate,
          endDate,
          paymentStatus: 'pending',
          amount,
          paymentMethod: dto.paymentMethod,
          paymentRef: dto.paymentRef,
          notes: dto.notes,
          cancelledAt: null,
          cancelReason: null,
        },
        include: { gym: { select: { id: true, name: true, logo: true } }, plan: true },
      });
    } else {
      // Paid plan, no existing subscription: create new with pending status
      // Don't change subscription status on payment initiation - only update when payment is confirmed
      subscription = await this.prisma.saasGymSubscription.create({
        data: {
          gymId,
          planId: dto.planId,
          startDate,
          endDate,
          status: 'pending',
          paymentStatus: 'pending',
          amount,
          paymentMethod: dto.paymentMethod,
          paymentRef: dto.paymentRef,
          notes: dto.notes,
        },
        include: { gym: { select: { id: true, name: true, logo: true } }, plan: true },
      });
    }

    // Create payment history record
    const invoiceNumber = await this.generateInvoiceNumber();
    const paymentRef =
      dto.paymentRef ||
      `PAY-${Date.now()}-${Math.random().toString(36).substring(2, 11).toUpperCase()}`;

    // Store proofUrl and previous subscription snapshot in gatewayResponse for reference
    const gatewayResponseData: Record<string, any> = {};
    if (dto.proofUrl) gatewayResponseData.proofUrl = dto.proofUrl;
    if (hasActiveExisting && existing) {
      // Save previous plan info so approval knows what to update
      gatewayResponseData.previousPlanId = existing.planId;
      gatewayResponseData.previousStartDate = existing.startDate;
      gatewayResponseData.previousEndDate = existing.endDate;
      gatewayResponseData.previousAmount = Number(existing.amount);
    }
    const gatewayResponse = Object.keys(gatewayResponseData).length > 0 ? gatewayResponseData : undefined;

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
        gatewayResponse,
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

    // Activate the subscription and update to the new plan from payment
    await this.prisma.saasGymSubscription.update({
      where: { id: payment.subscriptionId },
      data: {
        planId: payment.planId,
        startDate: payment.billingPeriodStart,
        endDate: payment.billingPeriodEnd,
        amount: payment.amount,
        paymentStatus: 'paid',
        status: 'active',
        lastPaymentAt: new Date(),
        paymentRef: payment.paymentRef,
        paymentMethod: payment.paymentMethod,
        trialEndsAt: null,
      },
    });

    // Reactivate gym if it was deactivated
    await this.prisma.gym.update({
      where: { id: payment.subscription.gymId },
      data: { isActive: true },
    });

    // Send receipt email
    await this.sendPaymentReceiptEmail(payment.subscriptionId);

    return updatedPayment;
  }

  async rejectPayment(paymentId: number, reason: string) {
    const payment = await this.getPaymentById(paymentId);

    if (payment.status === 'completed') {
      throw new BadRequestException('Payment is already completed');
    }

    if (payment.status === 'failed') {
      throw new BadRequestException('Payment is already rejected');
    }

    // Update payment to failed with rejection reason
    const updatedPayment = await this.prisma.saasPaymentHistory.update({
      where: { id: paymentId },
      data: {
        status: 'failed',
        failureReason: reason,
        processedAt: new Date(),
      },
      include: {
        subscription: true,
        gym: { select: { id: true, name: true, email: true } },
        plan: { select: { id: true, name: true } },
      },
    });

    // Check if subscription was already active on a different plan (wasn't overwritten)
    const subscription = await this.prisma.saasGymSubscription.findUnique({
      where: { id: payment.subscriptionId },
    });

    // Only suspend if the subscription was actually updated for this payment
    // (i.e., it's on trial/pending status). If it's still active on the original plan, leave it alone.
    if (subscription && !['active'].includes(subscription.status)) {
      await this.prisma.saasGymSubscription.update({
        where: { id: payment.subscriptionId },
        data: {
          paymentStatus: 'failed',
          status: 'suspended',
        },
      });
    }

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
        subscription.plan?.currency || 'USD',
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
  // Razorpay Payment Flow
  // ============================================

  async createRazorpayOrder(gymId: number, planId: number) {
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
      where: { id: planId },
    });
    if (!plan) {
      throw new NotFoundException('Plan not found');
    }
    if (!plan.isActive) {
      throw new BadRequestException('Plan is not available');
    }

    const amount = plan.price.toNumber() * 100; // Convert to smallest currency unit (paise/cents)
    const currency = plan.currency || 'USD';
    const receipt = `rcpt_gym${gymId}_plan${planId}_${Date.now()}`;

    const order = await this.razorpayService.createOrder(amount, currency, receipt, {
      gymId: String(gymId),
      planId: String(planId),
      gymName: gym.name,
    });

    return {
      orderId: order.id,
      amount,
      currency,
      keyId: process.env.RAZORPAY_KEY_ID,
      gymName: gym.name,
      gymEmail: gym.email,
    };
  }

  async verifyRazorpayPayment(gymId: number, dto: VerifyRazorpayPaymentDto) {
    // Verify signature
    const isValid = this.razorpayService.verifyPaymentSignature(
      dto.razorpay_order_id,
      dto.razorpay_payment_id,
      dto.razorpay_signature,
    );

    if (!isValid) {
      throw new BadRequestException('Invalid payment signature');
    }

    // Idempotency: check if this payment was already processed
    const existingPayment = await this.prisma.saasPaymentHistory.findFirst({
      where: { gatewayRef: dto.razorpay_payment_id },
    });
    if (existingPayment) {
      const subscription = await this.prisma.saasGymSubscription.findUnique({
        where: { gymId },
        include: { gym: { select: { id: true, name: true, logo: true } }, plan: true },
      });
      return { subscription, payment: existingPayment };
    }

    // Fetch plan
    const plan = await this.prisma.saasPlan.findUnique({
      where: { id: dto.planId },
    });
    if (!plan) {
      throw new NotFoundException('Plan not found');
    }

    const amount = plan.price.toNumber();

    // Calculate dates (reuse logic from initiateManualPayment)
    const existing = await this.prisma.saasGymSubscription.findUnique({
      where: { gymId },
    });

    const now = new Date();
    let startDate: Date;
    if (existing && new Date(existing.endDate) > now && ['active', 'trial'].includes(existing.status)) {
      startDate = new Date(existing.endDate);
    } else {
      startDate = now;
    }
    const endDate = new Date(startDate);
    endDate.setMonth(endDate.getMonth() + (plan.durationMonths || 1));

    // Create or update subscription
    let subscription;
    if (existing) {
      subscription = await this.prisma.saasGymSubscription.update({
        where: { gymId },
        data: {
          planId: dto.planId,
          startDate,
          endDate,
          status: 'active',
          paymentStatus: 'paid',
          amount,
          paymentMethod: 'razorpay',
          paymentRef: dto.razorpay_payment_id,
          lastPaymentAt: new Date(),
          trialEndsAt: null,
          cancelledAt: null,
          cancelReason: null,
        },
        include: { gym: { select: { id: true, name: true, logo: true } }, plan: true },
      });
    } else {
      subscription = await this.prisma.saasGymSubscription.create({
        data: {
          gymId,
          planId: dto.planId,
          startDate,
          endDate,
          status: 'active',
          paymentStatus: 'paid',
          amount,
          paymentMethod: 'razorpay',
          paymentRef: dto.razorpay_payment_id,
          lastPaymentAt: new Date(),
        },
        include: { gym: { select: { id: true, name: true, logo: true } }, plan: true },
      });
    }

    // Re-activate gym if it was deactivated due to expired subscription
    await this.prisma.gym.update({
      where: { id: gymId },
      data: { isActive: true },
    });

    // Create payment history record
    const invoiceNumber = await this.generateInvoiceNumber();

    const payment = await this.prisma.saasPaymentHistory.create({
      data: {
        subscriptionId: subscription.id,
        gymId,
        planId: dto.planId,
        amount,
        currency: plan.currency || 'USD',
        status: 'completed',
        paymentMethod: 'razorpay',
        paymentRef: dto.razorpay_payment_id,
        gateway: 'razorpay',
        gatewayRef: dto.razorpay_payment_id,
        gatewayResponse: {
          orderId: dto.razorpay_order_id,
          paymentId: dto.razorpay_payment_id,
        },
        billingPeriodStart: startDate,
        billingPeriodEnd: endDate,
        invoiceNumber,
        processedAt: new Date(),
      },
    });

    // Send receipt email
    await this.sendPaymentReceiptEmail(subscription.id);

    return { subscription, payment };
  }

  async handleRazorpayWebhook(body: string, signature: string) {
    // Verify webhook signature
    const isValid = this.razorpayService.verifyWebhookSignature(body, signature);
    if (!isValid) {
      throw new BadRequestException('Invalid webhook signature');
    }

    const event = JSON.parse(body);
    this.logger.log(`Razorpay webhook event: ${event.event}`);

    if (event.event === 'payment.captured') {
      const paymentEntity = event.payload?.payment?.entity;
      if (!paymentEntity) return { status: 'ignored' };

      const paymentId = paymentEntity.id;
      const orderId = paymentEntity.order_id;
      const notes = paymentEntity.notes || {};
      const gymId = notes.gymId ? parseInt(notes.gymId, 10) : null;
      const planId = notes.planId ? parseInt(notes.planId, 10) : null;

      // Check if payment already exists (already processed via verify endpoint)
      const existingPayment = await this.prisma.saasPaymentHistory.findFirst({
        where: { gatewayRef: paymentId },
      });

      if (existingPayment) {
        this.logger.log(`Payment ${paymentId} already processed, skipping webhook`);
        return { status: 'already_processed' };
      }

      // Backup path: create payment and activate subscription if not already done
      if (gymId && planId) {
        const plan = await this.prisma.saasPlan.findUnique({ where: { id: planId } });
        if (!plan) {
          this.logger.warn(`Webhook: Plan ${planId} not found`);
          return { status: 'plan_not_found' };
        }

        const amount = plan.price.toNumber();
        const now = new Date();
        const existing = await this.prisma.saasGymSubscription.findUnique({ where: { gymId } });

        let startDate: Date;
        if (existing && new Date(existing.endDate) > now && ['active', 'trial'].includes(existing.status)) {
          startDate = new Date(existing.endDate);
        } else {
          startDate = now;
        }
        const endDate = new Date(startDate);
        endDate.setMonth(endDate.getMonth() + (plan.durationMonths || 1));

        let subscription;
        if (existing) {
          subscription = await this.prisma.saasGymSubscription.update({
            where: { gymId },
            data: {
              planId,
              startDate,
              endDate,
              status: 'active',
              paymentStatus: 'paid',
              amount,
              paymentMethod: 'razorpay',
              paymentRef: paymentId,
              lastPaymentAt: new Date(),
              trialEndsAt: null,
              cancelledAt: null,
              cancelReason: null,
            },
          });
        } else {
          subscription = await this.prisma.saasGymSubscription.create({
            data: {
              gymId,
              planId,
              startDate,
              endDate,
              status: 'active',
              paymentStatus: 'paid',
              amount,
              paymentMethod: 'razorpay',
              paymentRef: paymentId,
              lastPaymentAt: new Date(),
            },
          });
        }

        const invoiceNumber = await this.generateInvoiceNumber();

        await this.prisma.saasPaymentHistory.create({
          data: {
            subscriptionId: subscription.id,
            gymId,
            planId,
            amount,
            currency: plan.currency || 'USD',
            status: 'completed',
            paymentMethod: 'razorpay',
            paymentRef: paymentId,
            gateway: 'razorpay',
            gatewayRef: paymentId,
            gatewayResponse: { orderId, paymentId, webhook: true },
            billingPeriodStart: startDate,
            billingPeriodEnd: endDate,
            invoiceNumber,
            processedAt: new Date(),
          },
        });

        await this.sendPaymentReceiptEmail(subscription.id);

        this.logger.log(`Webhook: Activated subscription for gym ${gymId}`);
        return { status: 'processed' };
      }

      this.logger.warn(`Webhook: Missing gymId/planId in payment notes`);
      return { status: 'missing_notes' };
    }

    return { status: 'event_ignored' };
  }

  // ============================================
  // Cron: Auto-expire subscriptions
  // ============================================

  @Cron(CronExpression.EVERY_DAY_AT_MIDNIGHT)
  async handleExpiredSubscriptions() {
    this.logger.log('Running subscription expiry check...');

    try {
      const now = new Date();

      // Find all expired subscriptions (including free plans) with their plan info
      const expiredSubscriptions = await this.prisma.saasGymSubscription.findMany({
        where: {
          endDate: { lt: now },
          status: { in: ['active', 'trial'] },
        },
        include: { plan: true },
      });

      if (expiredSubscriptions.length === 0) {
        this.logger.log('No subscriptions to expire');
        return;
      }

      const toExpireIds: number[] = [];

      // Auto-renew free plan subscriptions instead of expiring them
      for (const sub of expiredSubscriptions) {
        if (sub.plan && Number(sub.plan.price) === 0) {
          // Auto-renew: extend endDate by plan duration
          const newEndDate = new Date(sub.endDate);
          newEndDate.setMonth(newEndDate.getMonth() + (sub.plan.durationMonths || 1));
          await this.prisma.saasGymSubscription.update({
            where: { id: sub.id },
            data: { endDate: newEndDate, status: 'active' },
          });
          this.logger.log(`Auto-renewed free plan subscription ${sub.id} for gym ${sub.gymId}`);
          continue; // Skip expiration for free plans
        }
        toExpireIds.push(sub.id);
      }

      if (toExpireIds.length > 0) {
        const result = await this.prisma.saasGymSubscription.updateMany({
          where: { id: { in: toExpireIds } },
          data: { status: 'expired' },
        });

        this.logger.log(`Expired ${result.count} subscription(s)`);

        // Deactivate gyms with expired subscriptions
        const expiredSubs = await this.prisma.saasGymSubscription.findMany({
          where: {
            status: 'expired',
            gym: { isActive: true },
          },
          select: { gymId: true },
        });

        if (expiredSubs.length > 0) {
          const gymIds = expiredSubs.map((s) => s.gymId);
          const deactivated = await this.prisma.gym.updateMany({
            where: { id: { in: gymIds }, isActive: true },
            data: { isActive: false },
          });
          if (deactivated.count > 0) {
            this.logger.log(
              `Deactivated ${deactivated.count} gym(s) with expired subscriptions`,
            );

            // Emit socket events so connected users see the deactivation immediately
            for (const gymId of gymIds) {
              this.notificationsGateway.emitSaasSubscriptionChanged({
                action: 'subscription_expired',
                gymId,
              });
              this.notificationsGateway.emitGymChanged(gymId, {
                action: 'gym_deactivated',
              });
            }
          }
        }
      }
    } catch (error) {
      this.logger.error('Failed to expire subscriptions', error);
    }
  }
}
