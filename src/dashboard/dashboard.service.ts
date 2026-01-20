import { Injectable } from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';
import {
  SuperadminDashboardDto,
  DashboardStatsDto,
  RecentGymDto,
  RecentUserDto,
  RecentTicketDto,
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
}
