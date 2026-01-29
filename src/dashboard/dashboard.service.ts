import { Injectable } from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';
import { TenantService } from '../tenant/tenant.service';
import {
  SuperadminDashboardDto,
  DashboardStatsDto,
  RecentGymDto,
  RecentUserDto,
  RecentTicketDto,
  AdminDashboardDto,
  AdminDashboardStatsDto,
  RecentClientDto,
  RecentAttendanceDto,
  ClientDashboardDto,
  ClientSubscriptionDto,
  ClientAttendanceStatsDto,
  ClientRecentAttendanceDto,
  ActiveOfferDto,
} from './dto/dashboard.dto';

@Injectable()
export class DashboardService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tenantService: TenantService,
  ) {}

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
    // Get stats from public schema
    const [
      totalGyms,
      activeGyms,
      totalTickets,
      openTickets,
      totalAdminUsers,
      activeAdminUsers,
      totalContactRequests,
      unreadContactRequests,
      totalSubscriptions,
      activeSubscriptions,
      trialSubscriptions,
      expiredSubscriptions,
    ] = await Promise.all([
      // Gyms
      this.prisma.gym.count(),
      this.prisma.gym.count({ where: { isActive: true } }),
      // Support tickets
      this.prisma.supportTicket.count(),
      this.prisma.supportTicket.count({
        where: {
          status: { in: ['open', 'in_progress'] },
        },
      }),
      // Admin users from public schema
      this.prisma.user.count({ where: { isDeleted: false } }),
      this.prisma.user.count({ where: { isDeleted: false, status: 'active' } }),
      // Contact requests
      this.prisma.contactRequest.count(),
      this.prisma.contactRequest.count({ where: { status: 'new' } }),
      // SaaS subscriptions
      this.prisma.saasGymSubscription.count(),
      this.prisma.saasGymSubscription.count({ where: { status: 'active' } }),
      this.prisma.saasGymSubscription.count({ where: { status: 'trial' } }),
      this.prisma.saasGymSubscription.count({ where: { status: 'expired' } }),
    ]);

    return {
      totalGyms,
      activeGyms,
      totalUsers: totalAdminUsers,
      activeUsers: activeAdminUsers,
      totalTickets,
      openTickets,
      totalContactRequests,
      unreadContactRequests,
      totalSubscriptions,
      activeSubscriptions,
      trialSubscriptions,
      expiredSubscriptions,
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
    // Get recent staff users from public.users with their gym assignments
    const recentStaff = await this.prisma.user.findMany({
      take: limit,
      orderBy: { createdAt: 'desc' },
      where: { isDeleted: false },
      select: {
        id: true,
        name: true,
        email: true,
        avatar: true,
        status: true,
        createdAt: true,
        gymAssignments: {
          where: { isActive: true },
          take: 1,
          select: { role: true },
        },
      },
    });

    return recentStaff.map((user) => ({
      id: user.id,
      name: user.name,
      email: user.email,
      avatar: user.avatar || undefined,
      role: user.gymAssignments[0]?.role || 'staff',
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
  async getAdminDashboard(userId: number, gymId: number, branchId: number | null = null): Promise<AdminDashboardDto> {
    const [stats, recentClients, recentAttendance, recentTickets] = await Promise.all([
      this.getAdminStats(gymId, branchId),
      this.getRecentClients(gymId, branchId),
      this.getRecentAttendance(gymId, branchId),
      this.getRecentTicketsForGym(gymId),
    ]);

    return {
      stats,
      recentClients,
      recentAttendance,
      recentTickets,
    };
  }

  private async getAdminStats(gymId: number, branchId: number | null = null): Promise<AdminDashboardStatsDto> {
    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const startOfLastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const endOfLastMonth = new Date(now.getFullYear(), now.getMonth(), 0);
    const today = now.toISOString().split('T')[0];
    const endOfWeek = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);

    const stats = await this.tenantService.executeInTenant(gymId, async (client) => {
      // Build branch filter clause
      const userBranchFilter = branchId !== null ? ` AND branch_id = ${branchId}` : '';
      const membershipBranchFilter = branchId !== null ? ` AND branch_id = ${branchId}` : '';
      const attendanceBranchFilter = branchId !== null ? ` AND branch_id = ${branchId}` : '';

      const [
        totalMembersResult,
        activeMembersResult,
        totalTrainersResult,
        activeMembershipsResult,
        revenueResult,
        cashRevenueResult,
        lastMonthRevenueResult,
        thisMonthRevenueResult,
        presentTodayResult,
        expiringThisWeekResult,
      ] = await Promise.all([
        client.query(`SELECT COUNT(*) as count FROM users WHERE role = 'client'${userBranchFilter}`),
        client.query(`SELECT COUNT(*) as count FROM users WHERE role = 'client' AND status = 'active'${userBranchFilter}`),
        client.query(`SELECT COUNT(*) as count FROM users WHERE role = 'trainer'${userBranchFilter}`),
        client.query(`SELECT COUNT(*) as count FROM memberships WHERE status = 'active'${membershipBranchFilter}`),
        client.query(`SELECT COALESCE(SUM(final_amount), 0) as sum FROM memberships WHERE payment_status = 'paid'${membershipBranchFilter}`),
        client.query(`SELECT COALESCE(SUM(final_amount), 0) as sum FROM memberships WHERE payment_status = 'paid' AND payment_method = 'cash'${membershipBranchFilter}`),
        client.query(
          `SELECT COALESCE(SUM(final_amount), 0) as sum FROM memberships WHERE payment_status = 'paid' AND paid_at >= $1 AND paid_at <= $2${membershipBranchFilter}`,
          [startOfLastMonth, endOfLastMonth]
        ),
        client.query(
          `SELECT COALESCE(SUM(final_amount), 0) as sum FROM memberships WHERE payment_status = 'paid' AND paid_at >= $1${membershipBranchFilter}`,
          [startOfMonth]
        ),
        client.query(`SELECT COUNT(*) as count FROM attendance WHERE date = $1 AND status = 'present'${attendanceBranchFilter}`, [today]),
        client.query(
          `SELECT COUNT(*) as count FROM memberships WHERE status = 'active' AND end_date >= $1 AND end_date <= $2${membershipBranchFilter}`,
          [now, endOfWeek]
        ),
      ]);

      return {
        totalMembers: parseInt(totalMembersResult.rows[0].count, 10),
        activeMembers: parseInt(activeMembersResult.rows[0].count, 10),
        totalTrainers: parseInt(totalTrainersResult.rows[0].count, 10),
        activeMemberships: parseInt(activeMembershipsResult.rows[0].count, 10),
        totalRevenue: parseFloat(revenueResult.rows[0].sum),
        totalCashRevenue: parseFloat(cashRevenueResult.rows[0].sum),
        lastMonthRevenue: parseFloat(lastMonthRevenueResult.rows[0].sum),
        monthlyRevenue: parseFloat(thisMonthRevenueResult.rows[0].sum),
        presentToday: parseInt(presentTodayResult.rows[0].count, 10),
        expiringThisWeek: parseInt(expiringThisWeekResult.rows[0].count, 10),
      };
    });

    // Get open tickets count from public schema
    const openTickets = await this.prisma.supportTicket.count({
      where: {
        gymId,
        status: { in: ['open', 'in_progress'] },
      },
    });

    // Calculate monthly growth
    let monthlyGrowth = 0;
    if (stats.lastMonthRevenue > 0) {
      monthlyGrowth = ((stats.monthlyRevenue - stats.lastMonthRevenue) / stats.lastMonthRevenue) * 100;
    } else if (stats.monthlyRevenue > 0) {
      monthlyGrowth = 100;
    }

    return {
      totalMembers: stats.totalMembers,
      activeMembers: stats.activeMembers,
      totalTrainers: stats.totalTrainers,
      activeMemberships: stats.activeMemberships,
      totalRevenue: stats.totalRevenue,
      totalCashRevenue: stats.totalCashRevenue,
      monthlyRevenue: stats.monthlyRevenue,
      lastMonthRevenue: stats.lastMonthRevenue,
      monthlyGrowth: Math.round(monthlyGrowth * 10) / 10,
      presentToday: stats.presentToday,
      openTickets,
      expiringThisWeek: stats.expiringThisWeek,
    };
  }

  private async getRecentClients(gymId: number, branchId: number | null = null, limit = 5): Promise<RecentClientDto[]> {
    const clients = await this.tenantService.executeInTenant(gymId, async (client) => {
      let query = `SELECT id, name, email, avatar, status, created_at FROM users WHERE role = 'client'`;
      const values: any[] = [];

      if (branchId !== null) {
        query += ` AND branch_id = $1`;
        values.push(branchId);
      }

      query += ` ORDER BY created_at DESC LIMIT $${values.length + 1}`;
      values.push(limit);

      const result = await client.query(query, values);
      return result.rows;
    });

    return clients.map((c: any) => ({
      id: c.id,
      name: c.name,
      email: c.email,
      avatar: c.avatar || undefined,
      status: c.status,
      createdAt: c.created_at,
    }));
  }

  private async getRecentAttendance(gymId: number, branchId: number | null = null, limit = 5): Promise<RecentAttendanceDto[]> {
    const attendance = await this.tenantService.executeInTenant(gymId, async (client) => {
      let query = `SELECT a.id, a.date, a.check_in_time, a.check_out_time, a.status, u.name as user_name
         FROM attendance a
         JOIN users u ON u.id = a.user_id`;
      const values: any[] = [];

      if (branchId !== null) {
        query += ` WHERE a.branch_id = $1`;
        values.push(branchId);
      }

      query += ` ORDER BY a.created_at DESC LIMIT $${values.length + 1}`;
      values.push(limit);

      const result = await client.query(query, values);
      return result.rows;
    });

    return attendance.map((record: any) => ({
      id: record.id,
      userName: record.user_name,
      date: record.date,
      checkIn: new Date(record.check_in_time).toLocaleTimeString('en-US', {
        hour: '2-digit',
        minute: '2-digit',
        hour12: true,
      }),
      checkOut: record.check_out_time
        ? new Date(record.check_out_time).toLocaleTimeString('en-US', {
            hour: '2-digit',
            minute: '2-digit',
            hour12: true,
          })
        : undefined,
      status: record.status,
    }));
  }

  private async getRecentTicketsForGym(gymId: number, limit = 5): Promise<RecentTicketDto[]> {
    const tickets = await this.prisma.supportTicket.findMany({
      where: { gymId },
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

  // Client Dashboard Methods
  async getClientDashboard(userId: number, gymId: number): Promise<ClientDashboardDto> {
    const [user, subscription, attendanceStats, recentAttendance, activeOffers] = await Promise.all([
      this.getClientUser(userId, gymId),
      this.getClientSubscription(userId, gymId),
      this.getClientAttendanceStats(userId, gymId),
      this.getClientRecentAttendance(userId, gymId),
      this.getClientActiveOffers(gymId),
    ]);

    // Get gym info from public schema
    const gym = await this.prisma.gym.findUnique({
      where: { id: gymId },
      select: {
        id: true,
        name: true,
        logo: true,
        phone: true,
        email: true,
        address: true,
        city: true,
        state: true,
      },
    });

    return {
      attendanceCode: user?.attendance_code || '----',
      gym: gym ? {
        id: gym.id,
        name: gym.name,
        logo: gym.logo || undefined,
        phone: gym.phone || undefined,
        email: gym.email || undefined,
        address: gym.address || undefined,
        city: gym.city || undefined,
        state: gym.state || undefined,
      } : undefined,
      subscription,
      attendanceStats,
      recentAttendance,
      activeOffers,
    };
  }

  private async getClientUser(userId: number, gymId: number) {
    return this.tenantService.executeInTenant(gymId, async (client) => {
      const result = await client.query(
        `SELECT id, attendance_code FROM users WHERE id = $1`,
        [userId]
      );
      return result.rows[0];
    });
  }

  private async getClientSubscription(userId: number, gymId: number): Promise<ClientSubscriptionDto | undefined> {
    const membership = await this.tenantService.executeInTenant(gymId, async (client) => {
      const result = await client.query(
        `SELECT m.*, p.name as plan_name
         FROM memberships m
         LEFT JOIN plans p ON p.id = m.plan_id
         WHERE m.user_id = $1 AND m.status = 'active'
         ORDER BY m.created_at DESC LIMIT 1`,
        [userId]
      );
      return result.rows[0];
    });

    if (!membership) return undefined;

    const now = new Date();
    const startDate = new Date(membership.start_date);
    const endDate = new Date(membership.end_date);

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
      planName: membership.plan_name || 'Unknown Plan',
      status: membership.status,
      startDate: startDate.toISOString().split('T')[0],
      endDate: endDate.toISOString().split('T')[0],
      daysRemaining,
      progress,
      isEndingSoon,
    };
  }

  private async getClientAttendanceStats(userId: number, gymId: number): Promise<ClientAttendanceStatsDto> {
    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const startOfWeek = new Date(now);
    startOfWeek.setDate(now.getDate() - now.getDay()); // Sunday
    startOfWeek.setHours(0, 0, 0, 0);

    const startOfMonthStr = startOfMonth.toISOString().split('T')[0];
    const startOfWeekStr = startOfWeek.toISOString().split('T')[0];

    const stats = await this.tenantService.executeInTenant(gymId, async (client) => {
      const [thisMonthResult, thisWeekResult, totalResult] = await Promise.all([
        client.query(
          `SELECT COUNT(*) as count FROM attendance WHERE user_id = $1 AND date >= $2 AND status = 'present'`,
          [userId, startOfMonthStr]
        ),
        client.query(
          `SELECT COUNT(*) as count FROM attendance WHERE user_id = $1 AND date >= $2 AND status = 'present'`,
          [userId, startOfWeekStr]
        ),
        client.query(
          `SELECT COUNT(*) as count FROM attendance WHERE user_id = $1 AND status = 'present'`,
          [userId]
        ),
      ]);

      return {
        thisMonth: parseInt(thisMonthResult.rows[0].count, 10),
        thisWeek: parseInt(thisWeekResult.rows[0].count, 10),
        total: parseInt(totalResult.rows[0].count, 10),
      };
    });

    // Calculate current streak
    const currentStreak = await this.calculateCurrentStreak(userId, gymId);

    return {
      thisMonth: stats.thisMonth,
      thisWeek: stats.thisWeek,
      total: stats.total,
      currentStreak,
    };
  }

  private async calculateCurrentStreak(userId: number, gymId: number): Promise<number> {
    // Get all attendance records sorted by date descending
    const attendanceRecords = await this.tenantService.executeInTenant(gymId, async (client) => {
      const result = await client.query(
        `SELECT date FROM attendance WHERE user_id = $1 AND status = 'present' ORDER BY date DESC LIMIT 60`,
        [userId]
      );
      return result.rows;
    });

    if (attendanceRecords.length === 0) return 0;

    let streak = 0;
    const today = new Date();
    today.setHours(0, 0, 0, 0);

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
    const uniqueDates = [...new Set(attendanceRecords.map((r: any) => r.date))] as string[];
    let expectedDate = new Date(uniqueDates[0]);

    for (const dateStr of uniqueDates) {
      const currentDate = new Date(dateStr as string);
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

  private async getClientRecentAttendance(userId: number, gymId: number, limit = 5): Promise<ClientRecentAttendanceDto[]> {
    const attendance = await this.tenantService.executeInTenant(gymId, async (client) => {
      const result = await client.query(
        `SELECT id, date, check_in_time, check_out_time, status FROM attendance WHERE user_id = $1 ORDER BY date DESC LIMIT $2`,
        [userId, limit]
      );
      return result.rows;
    });

    return attendance.map((record: any) => ({
      id: record.id,
      date: record.date,
      checkIn: new Date(record.check_in_time).toLocaleTimeString('en-US', {
        hour: '2-digit',
        minute: '2-digit',
        hour12: true,
      }),
      checkOut: record.check_out_time
        ? new Date(record.check_out_time).toLocaleTimeString('en-US', {
            hour: '2-digit',
            minute: '2-digit',
            hour12: true,
          })
        : undefined,
      status: record.status,
    }));
  }

  private async getClientActiveOffers(gymId: number, limit = 3): Promise<ActiveOfferDto[]> {
    const now = new Date();

    const offers = await this.tenantService.executeInTenant(gymId, async (client) => {
      const result = await client.query(
        `SELECT id, name, description, discount_type, discount_value, code, valid_to
         FROM offers
         WHERE is_active = true AND valid_from <= $1 AND valid_to >= $1
         ORDER BY valid_to ASC LIMIT $2`,
        [now, limit]
      );
      return result.rows;
    });

    return offers.map((offer: any) => ({
      id: offer.id,
      title: offer.name,
      description: offer.description || undefined,
      discountPercentage: offer.discount_type === 'percentage' ? Number(offer.discount_value) : 0,
      code: offer.code || undefined,
      endDate: new Date(offer.valid_to).toISOString().split('T')[0],
    }));
  }
}
