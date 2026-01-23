import { Injectable } from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';
import {
  SuperadminDashboardDto,
  DashboardStatsDto,
  RecentGymDto,
  RecentUserDto,
  RecentTicketDto,
  AdminDashboardDto,
  AdminDashboardStatsDto,
  RecentMemberDto,
  RecentAttendanceDto,
  MemberDashboardDto,
  MemberSubscriptionDto,
  MemberAttendanceStatsDto,
  MemberRecentAttendanceDto,
  ActiveOfferDto,
} from './dto/dashboard.dto';

@Injectable()
export class DashboardService {
  constructor(private readonly prisma: PrismaService) {}

  async getSuperadminDashboard(): Promise<SuperadminDashboardDto> {
    const [stats, recentGyms, recentUsers, recentTickets] = await Promise.all([
      this.getStats(),
      this.getRecentGyms(),
      this.getRecentUsers(),
      this.getRecentTickets(),
    ]);

    return {
      stats,
      recentGyms,
      recentUsers,
      recentTickets,
    };
  }

  private async getStats(): Promise<DashboardStatsDto> {
    // Get current date info for monthly calculations
    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const startOfLastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const endOfLastMonth = new Date(now.getFullYear(), now.getMonth(), 0);
    const today = now.toISOString().split('T')[0]; // YYYY-MM-DD format

    // Execute all queries in parallel for better performance
    const [
      totalGyms,
      activeGyms,
      totalUsers,
      activeUsers,
      trainerRole,
      memberRole,
      activeMemberships,
      revenueData,
      lastMonthRevenue,
      presentToday,
      totalTickets,
      openTickets,
    ] = await Promise.all([
      // Total gyms
      this.prisma.gym.count(),
      // Active gyms
      this.prisma.gym.count({ where: { isActive: true } }),
      // Total users
      this.prisma.user.count(),
      // Active users
      this.prisma.user.count({ where: { status: 'active' } }),
      // Get trainer role lookup
      this.prisma.lookup.findFirst({
        where: {
          code: 'trainer',
          lookupType: { code: 'USER_ROLE' },
        },
      }),
      // Get member role lookup
      this.prisma.lookup.findFirst({
        where: {
          code: 'member',
          lookupType: { code: 'USER_ROLE' },
        },
      }),
      // Active memberships
      this.prisma.membership.count({ where: { status: 'active' } }),
      // Total revenue and monthly revenue
      this.prisma.membership.aggregate({
        _sum: { finalAmount: true },
        where: { paymentStatus: 'paid' },
      }),
      // Last month revenue for growth calculation
      this.prisma.membership.aggregate({
        _sum: { finalAmount: true },
        where: {
          paymentStatus: 'paid',
          paidAt: {
            gte: startOfLastMonth,
            lte: endOfLastMonth,
          },
        },
      }),
      // Present today count
      this.prisma.attendance.count({
        where: {
          date: today,
          status: 'present',
        },
      }),
      // Total support tickets
      this.prisma.supportTicket.count(),
      // Open support tickets
      this.prisma.supportTicket.count({
        where: {
          status: { in: ['open', 'in_progress'] },
        },
      }),
    ]);

    // Count trainers and members
    const [totalTrainers, totalMembers] = await Promise.all([
      trainerRole
        ? this.prisma.user.count({ where: { roleId: trainerRole.id } })
        : 0,
      memberRole
        ? this.prisma.user.count({ where: { roleId: memberRole.id } })
        : 0,
    ]);

    // Get this month's revenue
    const thisMonthRevenue = await this.prisma.membership.aggregate({
      _sum: { finalAmount: true },
      where: {
        paymentStatus: 'paid',
        paidAt: {
          gte: startOfMonth,
        },
      },
    });

    // Calculate revenue values
    const totalRevenue = Number(revenueData._sum.finalAmount) || 0;
    const monthlyRevenue = Number(thisMonthRevenue._sum.finalAmount) || 0;
    const lastMonthRevenueValue = Number(lastMonthRevenue._sum.finalAmount) || 0;

    // Calculate monthly growth percentage
    let monthlyGrowth = 0;
    if (lastMonthRevenueValue > 0) {
      monthlyGrowth =
        ((monthlyRevenue - lastMonthRevenueValue) / lastMonthRevenueValue) * 100;
    } else if (monthlyRevenue > 0) {
      monthlyGrowth = 100; // 100% growth if no revenue last month but have revenue this month
    }

    return {
      totalGyms,
      activeGyms,
      totalUsers,
      activeUsers,
      totalTrainers: typeof totalTrainers === 'number' ? totalTrainers : 0,
      totalMembers: typeof totalMembers === 'number' ? totalMembers : 0,
      activeMemberships,
      totalRevenue,
      monthlyRevenue,
      monthlyGrowth: Math.round(monthlyGrowth * 10) / 10, // Round to 1 decimal
      presentToday,
      totalTickets,
      openTickets,
    };
  }

  private async getRecentGyms(limit = 5): Promise<RecentGymDto[]> {
    const gyms = await this.prisma.gym.findMany({
      take: limit,
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        name: true,
        city: true,
        state: true,
        isActive: true,
        createdAt: true,
      },
    });

    return gyms.map((gym) => ({
      id: gym.id,
      name: gym.name,
      city: gym.city || undefined,
      state: gym.state || undefined,
      isActive: gym.isActive,
      createdAt: gym.createdAt,
    }));
  }

  private async getRecentUsers(limit = 5): Promise<RecentUserDto[]> {
    const users = await this.prisma.user.findMany({
      take: limit,
      orderBy: { createdAt: 'desc' },
      include: {
        role: {
          select: {
            code: true,
            name: true,
          },
        },
      },
    });

    return users.map((user) => ({
      id: user.id,
      name: user.name,
      email: user.email,
      avatar: user.avatar || undefined,
      role: user.role?.code || 'member',
      status: user.status,
      createdAt: user.createdAt,
    }));
  }

  private async getRecentTickets(limit = 5): Promise<RecentTicketDto[]> {
    const tickets = await this.prisma.supportTicket.findMany({
      take: limit,
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        ticketNumber: true,
        subject: true,
        category: true,
        priority: true,
        status: true,
        createdAt: true,
      },
    });

    return tickets;
  }

  // Admin Dashboard Methods
  async getAdminDashboard(userId: number): Promise<AdminDashboardDto> {
    // Get admin's gym IDs
    const gymIds = await this.getAdminGymIds(userId);

    const [stats, recentMembers, recentAttendance, recentTickets] =
      await Promise.all([
        this.getAdminStats(gymIds),
        this.getRecentMembers(gymIds),
        this.getRecentAttendance(gymIds),
        this.getRecentTicketsForGyms(gymIds),
      ]);

    return {
      stats,
      recentMembers,
      recentAttendance,
      recentTickets,
    };
  }

  private async getAdminGymIds(userId: number): Promise<number[]> {
    // Get gyms from both userGymXref and direct gymId field
    const [gymXrefs, user] = await Promise.all([
      this.prisma.userGymXref.findMany({
        where: {
          userId,
          isActive: true,
        },
        select: {
          gymId: true,
        },
      }),
      this.prisma.user.findUnique({
        where: { id: userId },
        select: { gymId: true },
      }),
    ]);

    const gymIds = new Set(gymXrefs.map((xref) => xref.gymId));
    if (user?.gymId) {
      gymIds.add(user.gymId);
    }

    return [...gymIds];
  }

  private async getAdminStats(gymIds: number[]): Promise<AdminDashboardStatsDto> {
    if (gymIds.length === 0) {
      return {
        totalMembers: 0,
        activeMembers: 0,
        totalTrainers: 0,
        activeMemberships: 0,
        totalRevenue: 0,
        totalCashRevenue: 0,
        monthlyRevenue: 0,
        lastMonthRevenue: 0,
        monthlyGrowth: 0,
        presentToday: 0,
        openTickets: 0,
        expiringThisWeek: 0,
      };
    }

    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const startOfLastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const endOfLastMonth = new Date(now.getFullYear(), now.getMonth(), 0);
    const today = now.toISOString().split('T')[0];
    const endOfWeek = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);

    // Get role lookups
    const [trainerRole, memberRole] = await Promise.all([
      this.prisma.lookup.findFirst({
        where: {
          code: 'trainer',
          lookupType: { code: 'USER_ROLE' },
        },
      }),
      this.prisma.lookup.findFirst({
        where: {
          code: 'member',
          lookupType: { code: 'USER_ROLE' },
        },
      }),
    ]);

    // Get user IDs in admin's gyms (from both userGymXref and direct gymId field)
    const [gymUserXrefs, directGymUsers] = await Promise.all([
      this.prisma.userGymXref.findMany({
        where: {
          gymId: { in: gymIds },
          isActive: true,
        },
        select: {
          userId: true,
        },
      }),
      this.prisma.user.findMany({
        where: {
          gymId: { in: gymIds },
        },
        select: {
          id: true,
        },
      }),
    ]);
    const userIdsInGyms = [...new Set([
      ...gymUserXrefs.map((x) => x.userId),
      ...directGymUsers.map((u) => u.id),
    ])];

    // Execute all queries in parallel
    const [
      totalMembers,
      activeMembers,
      totalTrainers,
      activeMemberships,
      revenueData,
      cashRevenueData,
      lastMonthRevenue,
      thisMonthRevenue,
      presentToday,
      openTickets,
      expiringThisWeek,
    ] = await Promise.all([
      // Total members in gym
      memberRole
        ? this.prisma.user.count({
            where: {
              id: { in: userIdsInGyms },
              roleId: memberRole.id,
            },
          })
        : 0,
      // Active members
      memberRole
        ? this.prisma.user.count({
            where: {
              id: { in: userIdsInGyms },
              roleId: memberRole.id,
              status: 'active',
            },
          })
        : 0,
      // Total trainers in gym
      trainerRole
        ? this.prisma.user.count({
            where: {
              id: { in: userIdsInGyms },
              roleId: trainerRole.id,
            },
          })
        : 0,
      // Active memberships in gym
      this.prisma.membership.count({
        where: {
          userId: { in: userIdsInGyms },
          status: 'active',
        },
      }),
      // Total revenue
      this.prisma.membership.aggregate({
        _sum: { finalAmount: true },
        where: {
          userId: { in: userIdsInGyms },
          paymentStatus: 'paid',
        },
      }),
      // Total cash revenue
      this.prisma.membership.aggregate({
        _sum: { finalAmount: true },
        where: {
          userId: { in: userIdsInGyms },
          paymentStatus: 'paid',
          paymentMethod: 'cash',
        },
      }),
      // Last month revenue
      this.prisma.membership.aggregate({
        _sum: { finalAmount: true },
        where: {
          userId: { in: userIdsInGyms },
          paymentStatus: 'paid',
          paidAt: {
            gte: startOfLastMonth,
            lte: endOfLastMonth,
          },
        },
      }),
      // This month revenue
      this.prisma.membership.aggregate({
        _sum: { finalAmount: true },
        where: {
          userId: { in: userIdsInGyms },
          paymentStatus: 'paid',
          paidAt: {
            gte: startOfMonth,
          },
        },
      }),
      // Present today
      this.prisma.attendance.count({
        where: {
          userId: { in: userIdsInGyms },
          date: today,
          status: 'present',
        },
      }),
      // Open tickets
      this.prisma.supportTicket.count({
        where: {
          userId: { in: userIdsInGyms },
          status: { in: ['open', 'in_progress'] },
        },
      }),
      // Expiring this week
      this.prisma.membership.count({
        where: {
          userId: { in: userIdsInGyms },
          status: 'active',
          endDate: {
            gte: now,
            lte: endOfWeek,
          },
        },
      }),
    ]);

    // Calculate revenue values
    const totalRevenue = Number(revenueData?._sum?.finalAmount ?? 0) || 0;
    const totalCashRevenue = Number(cashRevenueData?._sum?.finalAmount ?? 0) || 0;
    const monthlyRevenue = Number(thisMonthRevenue?._sum?.finalAmount ?? 0) || 0;
    const lastMonthRevenueValue = Number(lastMonthRevenue?._sum?.finalAmount ?? 0) || 0;

    // Calculate monthly growth
    let monthlyGrowth = 0;
    if (lastMonthRevenueValue > 0) {
      monthlyGrowth =
        ((monthlyRevenue - lastMonthRevenueValue) / lastMonthRevenueValue) * 100;
    } else if (monthlyRevenue > 0) {
      monthlyGrowth = 100;
    }

    return {
      totalMembers: typeof totalMembers === 'number' ? totalMembers : 0,
      activeMembers: typeof activeMembers === 'number' ? activeMembers : 0,
      totalTrainers: typeof totalTrainers === 'number' ? totalTrainers : 0,
      activeMemberships,
      totalRevenue,
      totalCashRevenue,
      monthlyRevenue,
      lastMonthRevenue: lastMonthRevenueValue,
      monthlyGrowth: Math.round(monthlyGrowth * 10) / 10,
      presentToday,
      openTickets,
      expiringThisWeek,
    };
  }

  private async getRecentMembers(
    gymIds: number[],
    limit = 5,
  ): Promise<RecentMemberDto[]> {
    if (gymIds.length === 0) return [];

    const memberRole = await this.prisma.lookup.findFirst({
      where: {
        code: 'member',
        lookupType: { code: 'USER_ROLE' },
      },
    });

    if (!memberRole) return [];

    // Get members directly associated with the gym via gymId field
    const members = await this.prisma.user.findMany({
      where: {
        gymId: { in: gymIds },
        roleId: memberRole.id,
      },
      take: limit,
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        name: true,
        email: true,
        avatar: true,
        status: true,
        createdAt: true,
      },
    });

    return members.map((member) => ({
      id: member.id,
      name: member.name,
      email: member.email,
      avatar: member.avatar || undefined,
      status: member.status,
      createdAt: member.createdAt,
    }));
  }

  private async getRecentAttendance(
    gymIds: number[],
    limit = 5,
  ): Promise<RecentAttendanceDto[]> {
    if (gymIds.length === 0) return [];

    // Get attendance for admin's gyms (via direct gymId field on attendance)
    const attendance = await this.prisma.attendance.findMany({
      where: {
        gymId: { in: gymIds },
      },
      take: limit,
      orderBy: { createdAt: 'desc' },
      include: {
        user: {
          select: {
            name: true,
          },
        },
      },
    });

    return attendance.map((record) => ({
      id: record.id,
      userName: record.user.name,
      date: record.date,
      checkIn: record.checkInTime.toLocaleTimeString('en-US', {
        hour: '2-digit',
        minute: '2-digit',
        hour12: true,
      }),
      checkOut: record.checkOutTime
        ? record.checkOutTime.toLocaleTimeString('en-US', {
            hour: '2-digit',
            minute: '2-digit',
            hour12: true,
          })
        : undefined,
      status: record.status,
    }));
  }

  private async getRecentTicketsForGyms(
    gymIds: number[],
    limit = 5,
  ): Promise<RecentTicketDto[]> {
    if (gymIds.length === 0) return [];

    // Get tickets for admin's gyms (via direct gymId field on ticket)
    const tickets = await this.prisma.supportTicket.findMany({
      where: {
        gymId: { in: gymIds },
      },
      take: limit,
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        ticketNumber: true,
        subject: true,
        category: true,
        priority: true,
        status: true,
        createdAt: true,
      },
    });

    return tickets;
  }

  // Member Dashboard Methods
  async getMemberDashboard(userId: number): Promise<MemberDashboardDto> {
    const [user, subscription, attendanceStats, recentAttendance, activeOffers] =
      await Promise.all([
        this.getMemberUser(userId),
        this.getMemberSubscription(userId),
        this.getMemberAttendanceStats(userId),
        this.getMemberRecentAttendance(userId),
        this.getMemberActiveOffers(userId),
      ]);

    return {
      attendanceCode: user?.attendanceCode || '----',
      subscription,
      attendanceStats,
      recentAttendance,
      activeOffers,
    };
  }

  private async getMemberUser(userId: number) {
    return this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        attendanceCode: true,
      },
    });
  }

  private async getMemberSubscription(
    userId: number,
  ): Promise<MemberSubscriptionDto | undefined> {
    const membership = await this.prisma.membership.findFirst({
      where: {
        userId,
        status: 'active',
      },
      include: {
        plan: {
          select: {
            name: true,
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    if (!membership) return undefined;

    const now = new Date();
    const startDate = new Date(membership.startDate);
    const endDate = new Date(membership.endDate);

    // Calculate days remaining
    const diffTime = endDate.getTime() - now.getTime();
    const daysRemaining = Math.max(0, Math.ceil(diffTime / (1000 * 60 * 60 * 24)));

    // Calculate progress percentage
    let progress = 0;
    if (now >= endDate) {
      progress = 100;
    } else if (now <= startDate) {
      progress = 0;
    } else {
      const total = endDate.getTime() - startDate.getTime();
      const elapsed = now.getTime() - startDate.getTime();
      progress = Math.round((elapsed / total) * 100);
    }

    // Check if ending soon (within 14 days)
    const isEndingSoon = daysRemaining > 0 && daysRemaining <= 14;

    return {
      id: membership.id,
      planName: membership.plan?.name || 'Unknown Plan',
      status: membership.status,
      startDate: membership.startDate.toISOString().split('T')[0],
      endDate: membership.endDate.toISOString().split('T')[0],
      daysRemaining,
      progress,
      isEndingSoon,
    };
  }

  private async getMemberAttendanceStats(
    userId: number,
  ): Promise<MemberAttendanceStatsDto> {
    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const startOfWeek = new Date(now);
    startOfWeek.setDate(now.getDate() - now.getDay()); // Sunday
    startOfWeek.setHours(0, 0, 0, 0);

    const startOfMonthStr = startOfMonth.toISOString().split('T')[0];
    const startOfWeekStr = startOfWeek.toISOString().split('T')[0];

    const [thisMonth, thisWeek, total] = await Promise.all([
      this.prisma.attendance.count({
        where: {
          userId,
          date: { gte: startOfMonthStr },
          status: 'present',
        },
      }),
      this.prisma.attendance.count({
        where: {
          userId,
          date: { gte: startOfWeekStr },
          status: 'present',
        },
      }),
      this.prisma.attendance.count({
        where: {
          userId,
          status: 'present',
        },
      }),
    ]);

    // Calculate current streak
    const currentStreak = await this.calculateCurrentStreak(userId);

    return {
      thisMonth,
      thisWeek,
      total,
      currentStreak,
    };
  }

  private async calculateCurrentStreak(userId: number): Promise<number> {
    // Get all attendance records sorted by date descending
    const attendanceRecords = await this.prisma.attendance.findMany({
      where: {
        userId,
        status: 'present',
      },
      orderBy: { date: 'desc' },
      select: { date: true },
      take: 60, // Check last 60 records max
    });

    if (attendanceRecords.length === 0) return 0;

    let streak = 0;
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const todayStr = today.toISOString().split('T')[0];

    // Check if there's attendance today or yesterday to start counting
    const lastAttendanceDate = attendanceRecords[0].date;
    const lastDate = new Date(lastAttendanceDate);
    lastDate.setHours(0, 0, 0, 0);

    const diffDays = Math.floor(
      (today.getTime() - lastDate.getTime()) / (1000 * 60 * 60 * 24),
    );

    // If last attendance was more than 1 day ago, streak is 0
    if (diffDays > 1) return 0;

    // Count consecutive days
    const uniqueDates = [...new Set(attendanceRecords.map((r) => r.date))];
    let expectedDate = new Date(uniqueDates[0]);

    for (const dateStr of uniqueDates) {
      const currentDate = new Date(dateStr);
      currentDate.setHours(0, 0, 0, 0);
      expectedDate.setHours(0, 0, 0, 0);

      const dayDiff = Math.floor(
        (expectedDate.getTime() - currentDate.getTime()) / (1000 * 60 * 60 * 24),
      );

      if (dayDiff <= 1) {
        streak++;
        expectedDate = new Date(currentDate);
        expectedDate.setDate(expectedDate.getDate() - 1);
      } else {
        break;
      }
    }

    return streak;
  }

  private async getMemberRecentAttendance(
    userId: number,
    limit = 5,
  ): Promise<MemberRecentAttendanceDto[]> {
    const attendance = await this.prisma.attendance.findMany({
      where: { userId },
      take: limit,
      orderBy: { date: 'desc' },
      select: {
        id: true,
        date: true,
        checkInTime: true,
        checkOutTime: true,
        status: true,
      },
    });

    return attendance.map((record) => ({
      id: record.id,
      date: record.date,
      checkIn: record.checkInTime.toLocaleTimeString('en-US', {
        hour: '2-digit',
        minute: '2-digit',
        hour12: true,
      }),
      checkOut: record.checkOutTime
        ? record.checkOutTime.toLocaleTimeString('en-US', {
            hour: '2-digit',
            minute: '2-digit',
            hour12: true,
          })
        : undefined,
      status: record.status,
    }));
  }

  private async getMemberActiveOffers(
    userId: number,
    limit = 3,
  ): Promise<ActiveOfferDto[]> {
    const now = new Date();

    // Get active offers
    const offers = await this.prisma.offer.findMany({
      where: {
        isActive: true,
        validFrom: { lte: now },
        validTo: { gte: now },
      },
      take: limit,
      orderBy: { validTo: 'asc' },
      select: {
        id: true,
        name: true,
        description: true,
        discountType: true,
        discountValue: true,
        code: true,
        validTo: true,
      },
    });

    return offers.map((offer) => ({
      id: offer.id,
      title: offer.name,
      description: offer.description || undefined,
      discountPercentage:
        offer.discountType === 'percentage'
          ? Number(offer.discountValue)
          : 0,
      code: offer.code || undefined,
      endDate: offer.validTo.toISOString().split('T')[0],
    }));
  }
}
