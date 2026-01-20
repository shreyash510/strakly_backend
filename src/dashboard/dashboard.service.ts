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
    const gymXrefs = await this.prisma.userGymXref.findMany({
      where: {
        userId,
        isActive: true,
      },
      select: {
        gymId: true,
      },
    });

    return gymXrefs.map((xref) => xref.gymId);
  }

  private async getAdminStats(gymIds: number[]): Promise<AdminDashboardStatsDto> {
    if (gymIds.length === 0) {
      return {
        totalMembers: 0,
        activeMembers: 0,
        totalTrainers: 0,
        activeMemberships: 0,
        totalRevenue: 0,
        monthlyRevenue: 0,
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

    // Get user IDs in admin's gyms
    const gymUserXrefs = await this.prisma.userGymXref.findMany({
      where: {
        gymId: { in: gymIds },
        isActive: true,
      },
      select: {
        userId: true,
      },
    });
    const userIdsInGyms = [...new Set(gymUserXrefs.map((x) => x.userId))];

    // Execute all queries in parallel
    const [
      totalMembers,
      activeMembers,
      totalTrainers,
      activeMemberships,
      revenueData,
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
          gymId: { in: gymIds },
          status: 'active',
        },
      }),
      // Total revenue
      this.prisma.membership.aggregate({
        _sum: { finalAmount: true },
        where: {
          gymId: { in: gymIds },
          paymentStatus: 'paid',
        },
      }),
      // Last month revenue
      this.prisma.membership.aggregate({
        _sum: { finalAmount: true },
        where: {
          gymId: { in: gymIds },
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
          gymId: { in: gymIds },
          paymentStatus: 'paid',
          paidAt: {
            gte: startOfMonth,
          },
        },
      }),
      // Present today
      this.prisma.attendance.count({
        where: {
          gymId: { in: gymIds },
          date: today,
          status: 'present',
        },
      }),
      // Open tickets
      this.prisma.supportTicket.count({
        where: {
          gymId: { in: gymIds },
          status: { in: ['open', 'in_progress'] },
        },
      }),
      // Expiring this week
      this.prisma.membership.count({
        where: {
          gymId: { in: gymIds },
          status: 'active',
          endDate: {
            gte: now,
            lte: endOfWeek,
          },
        },
      }),
    ]);

    // Calculate revenue values
    const totalRevenue = Number(revenueData._sum.finalAmount) || 0;
    const monthlyRevenue = Number(thisMonthRevenue._sum.finalAmount) || 0;
    const lastMonthRevenueValue = Number(lastMonthRevenue._sum.finalAmount) || 0;

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
      monthlyRevenue,
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

    // Get user IDs in admin's gyms
    const gymUserXrefs = await this.prisma.userGymXref.findMany({
      where: {
        gymId: { in: gymIds },
        isActive: true,
      },
      select: {
        userId: true,
      },
    });
    const userIdsInGyms = [...new Set(gymUserXrefs.map((x) => x.userId))];

    const members = await this.prisma.user.findMany({
      where: {
        id: { in: userIdsInGyms },
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
      checkIn: record.checkIn,
      checkOut: record.checkOut || undefined,
      status: record.status,
    }));
  }

  private async getRecentTicketsForGyms(
    gymIds: number[],
    limit = 5,
  ): Promise<RecentTicketDto[]> {
    if (gymIds.length === 0) return [];

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
}
