import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';
import { TenantService } from '../tenant/tenant.service';
import { DashboardCacheService } from './dashboard-cache.service';
import { SqlValue } from '../common/types';
import { USER_STATUS } from '../common/constants';
import {
  SuperadminDashboardDto,
  DashboardStatsDto,
  RecentGymDto,
  RecentUserDto,
  RecentTicketDto,
  AdminDashboardDto,
  AdminDashboardStatsDto,
  ExpiringMembershipDto,
  RecentClientDto,
  RecentAttendanceDto,
  ClientDashboardDto,
  ClientSubscriptionDto,
  ClientAttendanceStatsDto,
  ClientRecentAttendanceDto,
  ActiveOfferDto,
  ClientFacilityDto,
  ClientAmenityDto,
  UpcomingClassBookingDto,
  UpcomingAppointmentDto,
} from './dto/dashboard.dto';

@Injectable()
export class DashboardService {
  private readonly logger = new Logger(DashboardService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly tenantService: TenantService,
    private readonly dashboardCacheService: DashboardCacheService,
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
      this.prisma.user.count({ where: { isDeleted: false, status: USER_STATUS.ACTIVE } }),
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

  async getPaginatedGyms(
    page = 1,
    limit = 5,
  ): Promise<{
    data: RecentGymDto[];
    pagination: {
      page: number;
      limit: number;
      total: number;
      totalPages: number;
    };
  }> {
    const skip = (page - 1) * limit;

    const [gyms, total] = await Promise.all([
      this.prisma.gym.findMany({
        skip,
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
      }),
      this.prisma.gym.count(),
    ]);

    return {
      data: gyms.map((gym) => ({
        id: gym.id,
        name: gym.name,
        city: gym.city || undefined,
        state: gym.state || undefined,
        isActive: gym.isActive,
        createdAt: gym.createdAt,
      })),
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    };
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
  async getAdminDashboard(
    userId: number,
    gymId: number,
    branchId?: number | null,
  ): Promise<AdminDashboardDto> {
    const cached = this.dashboardCacheService.get(gymId, branchId);
    if (cached) {
      return cached;
    }

    // Cache miss — compute and store
    const result = await this.computeAdminDashboard(gymId, branchId);
    this.dashboardCacheService.set(gymId, result, branchId);
    return result;
  }

  /** Raw computation without cache — used by consumer and scheduler */
  async computeAdminDashboard(
    gymId: number,
    branchId?: number | null,
  ): Promise<AdminDashboardDto> {
    const [stats, newClients, newInquiries, recentTickets, recentAttendance, expiringMemberships] = await Promise.all([
      this.getAdminStats(gymId, branchId),
      this.getNewClients(gymId, 1, 5, branchId),
      this.getNewInquiries(gymId, 1, 5, branchId),
      this.getRecentTicketsForGym(gymId),
      this.getRecentAttendance(gymId, 5),
      this.getExpiringMemberships(gymId, 5, branchId),
    ]);

    return {
      stats,
      newClients,
      newInquiries,
      recentTickets,
      recentAttendance,
      expiringMemberships,
    };
  }

  // Get new clients (status = 'active') with pagination
  async getNewClients(
    gymId: number,
    page: number = 1,
    limit: number = 5,
    branchId?: number | null,
  ) {
    const offset = (page - 1) * limit;

    const result = await this.tenantService.executeInTenant(
      gymId,
      async (client) => {
        const values: SqlValue[] = [];
        let baseWhere = `role = 'client' AND status = 'active' AND (is_deleted = FALSE OR is_deleted IS NULL)`;
        if (branchId) {
          values.push(branchId);
          baseWhere += ` AND branch_id = $${values.length}`;
        }
        const countQuery = `SELECT COUNT(*) as count FROM users WHERE ${baseWhere}`;
        let dataQuery = `SELECT id, name, email, avatar, status, created_at FROM users WHERE ${baseWhere}`;

        dataQuery += ` ORDER BY created_at DESC LIMIT $${values.length + 1} OFFSET $${values.length + 2}`;

        const [countResult, dataResult] = await Promise.all([
          client.query(countQuery, values),
          client.query(dataQuery, [...values, limit, offset]),
        ]);

        return {
          data: dataResult.rows,
          total: parseInt(countResult.rows[0].count, 10),
        };
      },
    );

    const total = result.total;
    const totalPages = Math.ceil(total / limit);

    return {
      data: result.data.map((c: Record<string, any>) => ({
        id: c.id,
        name: c.name,
        email: c.email,
        avatar: c.avatar || undefined,
        status: c.status,
        createdAt: c.created_at,
      })),
      pagination: {
        page,
        limit,
        total,
        totalPages,
        hasNext: page < totalPages,
        hasPrev: page > 1,
      },
    };
  }

  // Get new inquiries (status = 'onboarding' or 'confirm') with pagination
  async getNewInquiries(
    gymId: number,
    page: number = 1,
    limit: number = 5,
    branchId?: number | null,
  ) {
    const offset = (page - 1) * limit;

    const result = await this.tenantService.executeInTenant(
      gymId,
      async (client) => {
        const values: SqlValue[] = [];
        let baseWhere = `role = 'client' AND status IN ('onboarding', 'confirm') AND (is_deleted = FALSE OR is_deleted IS NULL)`;
        if (branchId) {
          values.push(branchId);
          baseWhere += ` AND branch_id = $${values.length}`;
        }
        const countQuery = `SELECT COUNT(*) as count FROM users WHERE ${baseWhere}`;
        let dataQuery = `SELECT id, name, email, avatar, status, created_at FROM users WHERE ${baseWhere}`;

        dataQuery += ` ORDER BY created_at DESC LIMIT $${values.length + 1} OFFSET $${values.length + 2}`;

        const [countResult, dataResult] = await Promise.all([
          client.query(countQuery, values),
          client.query(dataQuery, [...values, limit, offset]),
        ]);

        return {
          data: dataResult.rows,
          total: parseInt(countResult.rows[0].count, 10),
        };
      },
    );

    const total = result.total;
    const totalPages = Math.ceil(total / limit);

    return {
      data: result.data.map((c: Record<string, any>) => ({
        id: c.id,
        name: c.name,
        email: c.email,
        avatar: c.avatar || undefined,
        status: c.status,
        createdAt: c.created_at,
      })),
      pagination: {
        page,
        limit,
        total,
        totalPages,
        hasNext: page < totalPages,
        hasPrev: page > 1,
      },
    };
  }

  private async getAdminStats(
    gymId: number,
    branchId?: number | null,
  ): Promise<AdminDashboardStatsDto> {
    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const startOfLastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const endOfLastMonth = new Date(now.getFullYear(), now.getMonth(), 0);
    const today = now.toISOString().split('T')[0];
    const endOfWeek = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);

    const branchFilter = branchId ? ` AND branch_id = ${branchId}` : '';

    const stats = await this.tenantService.executeInTenant(
      gymId,
      async (client) => {
        // Consolidated: 4 queries instead of 19
        const [
          userStatsResult,
          membershipStatsResult,
          attendanceResult,
          productStatsResult,
        ] = await Promise.all([
          // 1) All user counts in ONE query using FILTER clauses
          client.query(
            `SELECT
              COUNT(*) FILTER (WHERE role = 'client') as total_members,
              COUNT(*) FILTER (WHERE role = 'client' AND status = 'active') as active_members,
              COUNT(*) FILTER (WHERE role = 'trainer') as total_trainers,
              COUNT(*) FILTER (WHERE role = 'client' AND gender = 'male') as male_clients,
              COUNT(*) FILTER (WHERE role = 'client' AND gender = 'female') as female_clients,
              COUNT(*) FILTER (WHERE role = 'client' AND status = 'active' AND created_at >= $1) as new_clients_this_month,
              COUNT(*) FILTER (WHERE role = 'client' AND status IN ('onboarding', 'confirm')) as pending_onboarding,
              COUNT(*) FILTER (WHERE role = 'client' AND status IN ('onboarding', 'confirm') AND created_at >= $1) as new_enquiries_this_month
            FROM users
            WHERE (is_deleted = FALSE OR is_deleted IS NULL)${branchFilter}`,
            [startOfMonth],
          ),
          // 2) All membership counts + revenue in ONE query
          client.query(
            `SELECT
              COUNT(*) FILTER (WHERE status = 'active') as active_memberships,
              COUNT(*) FILTER (WHERE status = 'active' AND end_date >= $1::TIMESTAMP AND end_date <= $2::TIMESTAMP) as expiring_soon,
              COUNT(*) FILTER (WHERE status = 'expired') as expired_memberships,
              COALESCE(SUM(final_amount) FILTER (WHERE payment_status = 'paid'), 0) as total_revenue,
              COALESCE(SUM(final_amount) FILTER (WHERE payment_status = 'paid' AND payment_method = 'cash'), 0) as total_cash_revenue,
              COALESCE(SUM(final_amount) FILTER (WHERE payment_status = 'paid' AND paid_at >= $3 AND paid_at <= $4), 0) as last_month_revenue,
              COALESCE(SUM(final_amount) FILTER (WHERE payment_status = 'paid' AND paid_at >= $5), 0) as this_month_revenue
            FROM memberships
            WHERE (is_deleted = FALSE OR is_deleted IS NULL)${branchFilter}`,
            [now, endOfWeek, startOfLastMonth, endOfLastMonth, startOfMonth],
          ),
          // 3) Attendance: present today
          client.query(
            `SELECT COUNT(*) as count FROM attendance WHERE attendance_date = $1::DATE AND status = 'present'${branchFilter}`,
            [today],
          ),
          // 4) Product sales revenue + product count
          client.query(
            `SELECT
              COALESCE(SUM(s.total_amount), 0) as total_revenue,
              COALESCE(SUM(s.total_amount) FILTER (WHERE s.sold_at >= $1 AND s.sold_at <= $2), 0) as last_month_revenue,
              COALESCE(SUM(s.total_amount) FILTER (WHERE s.sold_at >= $3), 0) as this_month_revenue,
              (SELECT COUNT(*) FROM products WHERE is_deleted = FALSE OR is_deleted IS NULL) as total_products
            FROM product_sales s
            WHERE (s.is_deleted = FALSE OR s.is_deleted IS NULL)${branchFilter}`,
            [startOfLastMonth, endOfLastMonth, startOfMonth],
          ),
        ]);

        const u = userStatsResult.rows[0];
        const m = membershipStatsResult.rows[0];
        const p = productStatsResult.rows[0];

        return {
          totalMembers: parseInt(u.total_members, 10),
          activeMembers: parseInt(u.active_members, 10),
          totalTrainers: parseInt(u.total_trainers, 10),
          activeMemberships: parseInt(m.active_memberships, 10),
          totalRevenue:
            parseFloat(m.total_revenue) + parseFloat(p.total_revenue),
          totalCashRevenue: parseFloat(m.total_cash_revenue),
          lastMonthRevenue:
            parseFloat(m.last_month_revenue) +
            parseFloat(p.last_month_revenue),
          monthlyRevenue:
            parseFloat(m.this_month_revenue) +
            parseFloat(p.this_month_revenue),
          presentToday: parseInt(attendanceResult.rows[0].count, 10),
          expiredMemberships: parseInt(m.expired_memberships, 10),
          pendingOnboardingCount: parseInt(u.pending_onboarding, 10),
          maleClients: parseInt(u.male_clients, 10),
          femaleClients: parseInt(u.female_clients, 10),
          newClientsThisMonth: parseInt(u.new_clients_this_month, 10),
          newEnquiriesThisMonth: parseInt(u.new_enquiries_this_month, 10),
          expiringSoon: parseInt(m.expiring_soon, 10),
          totalProducts: parseInt(p.total_products, 10),
          thisMonthProductSales: parseFloat(p.this_month_revenue),
        };
      },
    );

    // Get last 5 months revenue history (membership + product sales separately)
    const fiveMonthsAgo = new Date(now.getFullYear(), now.getMonth() - 4, 1);
    const [membershipRevenueRows, productSalesRows] = await this.tenantService.executeInTenant(
      gymId,
      async (client) => {
        const [mResult, pResult] = await Promise.all([
          client.query(
            `SELECT
              TO_CHAR(DATE_TRUNC('month', paid_at), 'Mon') as month,
              EXTRACT(MONTH FROM DATE_TRUNC('month', paid_at)) as month_num,
              EXTRACT(YEAR FROM DATE_TRUNC('month', paid_at)) as year_num,
              COALESCE(SUM(final_amount), 0) as revenue
            FROM memberships
            WHERE payment_status = 'paid' AND (is_deleted = FALSE OR is_deleted IS NULL) AND paid_at >= $1${branchFilter}
            GROUP BY month, month_num, year_num
            ORDER BY year_num ASC, month_num ASC`,
            [fiveMonthsAgo],
          ),
          client.query(
            `SELECT
              TO_CHAR(DATE_TRUNC('month', sold_at), 'Mon') as month,
              EXTRACT(MONTH FROM DATE_TRUNC('month', sold_at)) as month_num,
              EXTRACT(YEAR FROM DATE_TRUNC('month', sold_at)) as year_num,
              COALESCE(SUM(total_amount), 0) as revenue
            FROM product_sales
            WHERE (is_deleted = FALSE OR is_deleted IS NULL) AND sold_at >= $1${branchFilter}
            GROUP BY month, month_num, year_num
            ORDER BY year_num ASC, month_num ASC`,
            [fiveMonthsAgo],
          ),
        ]);
        return [mResult.rows, pResult.rows];
      },
    );

    // Build full 5-month arrays (fill missing months with 0)
    const buildMonthlyHistory = (rows: Record<string, any>[]) => {
      const history: { month: string; revenue: number }[] = [];
      for (let i = 4; i >= 0; i--) {
        const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
        const monthLabel = d.toLocaleString('en-US', { month: 'short' });
        const found = rows.find(
          (r) => parseInt(r.month_num) === d.getMonth() + 1 && parseInt(r.year_num) === d.getFullYear(),
        );
        history.push({ month: monthLabel, revenue: found ? parseFloat(found.revenue) : 0 });
      }
      return history;
    };

    const monthlyRevenueHistory = buildMonthlyHistory(membershipRevenueRows);
    const monthlyProductSalesHistory = buildMonthlyHistory(productSalesRows);

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
      monthlyGrowth =
        ((stats.monthlyRevenue - stats.lastMonthRevenue) /
          stats.lastMonthRevenue) *
        100;
    } else if (stats.monthlyRevenue > 0) {
      monthlyGrowth = 100;
    }

    // Week-over-week comparison + daily sparklines (last 7 days)
    const startOfThisWeek = new Date(now);
    startOfThisWeek.setDate(now.getDate() - now.getDay()); // Sunday
    startOfThisWeek.setHours(0, 0, 0, 0);

    const startOfLastWeek = new Date(startOfThisWeek);
    startOfLastWeek.setDate(startOfLastWeek.getDate() - 7);

    const sevenDaysAgo = new Date(now);
    sevenDaysAgo.setDate(now.getDate() - 6);
    sevenDaysAgo.setHours(0, 0, 0, 0);

    const { weekComparison, sparklines } =
      await this.tenantService.executeInTenant(gymId, async (client) => {
        const [weekCompResult, sparkResult] = await Promise.all([
          // Week-over-week counts
          client.query(
            `SELECT
              COUNT(*) FILTER (WHERE role='client' AND status='active' AND created_at >= $1) as this_week_clients,
              COUNT(*) FILTER (WHERE role='client' AND status='active' AND created_at >= $2 AND created_at < $1) as last_week_clients,
              COUNT(*) FILTER (WHERE role='client' AND status IN ('onboarding','confirm') AND created_at >= $1) as this_week_enquiries,
              COUNT(*) FILTER (WHERE role='client' AND status IN ('onboarding','confirm') AND created_at >= $2 AND created_at < $1) as last_week_enquiries
            FROM users
            WHERE (is_deleted = FALSE OR is_deleted IS NULL)${branchFilter}`,
            [startOfThisWeek, startOfLastWeek],
          ),
          // Daily sparkline data for last 7 days
          client.query(
            `WITH days AS (
              SELECT generate_series($1::date, CURRENT_DATE, '1 day'::interval)::date AS day
            )
            SELECT
              d.day,
              COALESCE(c.cnt, 0) as new_clients,
              COALESCE(a.cnt, 0) as attendance,
              COALESCE(e.cnt, 0) as enquiries,
              COALESCE(r.rev, 0) + COALESCE(ps.prod_rev, 0) as revenue,
              COALESCE(ex.cnt, 0) as expired
            FROM days d
            LEFT JOIN (
              SELECT created_at::date AS day, COUNT(*) AS cnt
              FROM users WHERE role='client' AND status='active' AND (is_deleted = FALSE OR is_deleted IS NULL)${branchFilter} AND created_at >= $1
              GROUP BY created_at::date
            ) c ON c.day = d.day
            LEFT JOIN (
              SELECT attendance_date AS day, COUNT(*) AS cnt
              FROM attendance WHERE status='present'${branchFilter} AND attendance_date >= $1
              GROUP BY attendance_date
            ) a ON a.day = d.day
            LEFT JOIN (
              SELECT created_at::date AS day, COUNT(*) AS cnt
              FROM users WHERE role='client' AND status IN ('onboarding','confirm') AND (is_deleted = FALSE OR is_deleted IS NULL)${branchFilter} AND created_at >= $1
              GROUP BY created_at::date
            ) e ON e.day = d.day
            LEFT JOIN (
              SELECT paid_at::date AS day, COALESCE(SUM(final_amount),0) AS rev
              FROM memberships WHERE payment_status='paid' AND (is_deleted=FALSE OR is_deleted IS NULL)${branchFilter} AND paid_at >= $1
              GROUP BY paid_at::date
            ) r ON r.day = d.day
            LEFT JOIN (
              SELECT sold_at::date AS day, COALESCE(SUM(total_amount),0) AS prod_rev
              FROM product_sales WHERE (is_deleted=FALSE OR is_deleted IS NULL)${branchFilter} AND sold_at >= $1
              GROUP BY sold_at::date
            ) ps ON ps.day = d.day
            LEFT JOIN (
              SELECT end_date::date AS day, COUNT(*) AS cnt
              FROM memberships WHERE status='expired' AND (is_deleted = FALSE OR is_deleted IS NULL)${branchFilter} AND end_date >= $1
              GROUP BY end_date::date
            ) ex ON ex.day = d.day
            ORDER BY d.day ASC`,
            [sevenDaysAgo],
          ),
        ]);

        // Week attendance + revenue + expired
        const weekAttendanceResult = await client.query(
          `SELECT
            COUNT(*) FILTER (WHERE attendance_date >= $1::date) as this_week,
            COUNT(*) FILTER (WHERE attendance_date >= $2::date AND attendance_date < $1::date) as last_week
          FROM attendance WHERE status='present'${branchFilter}`,
          [startOfThisWeek, startOfLastWeek],
        );

        const weekRevenueResult = await client.query(
          `SELECT
            COALESCE(
              (SELECT SUM(final_amount) FROM memberships WHERE payment_status='paid' AND (is_deleted=FALSE OR is_deleted IS NULL)${branchFilter} AND paid_at >= $1), 0
            ) + COALESCE(
              (SELECT SUM(total_amount) FROM product_sales WHERE (is_deleted=FALSE OR is_deleted IS NULL)${branchFilter} AND sold_at >= $1), 0
            ) as this_week,
            COALESCE(
              (SELECT SUM(final_amount) FROM memberships WHERE payment_status='paid' AND (is_deleted=FALSE OR is_deleted IS NULL)${branchFilter} AND paid_at >= $2 AND paid_at < $1), 0
            ) + COALESCE(
              (SELECT SUM(total_amount) FROM product_sales WHERE (is_deleted=FALSE OR is_deleted IS NULL)${branchFilter} AND sold_at >= $2 AND sold_at < $1), 0
            ) as last_week`,
          [startOfThisWeek, startOfLastWeek],
        );

        const weekExpiredResult = await client.query(
          `SELECT
            COUNT(*) FILTER (WHERE end_date >= $1::date) as this_week,
            COUNT(*) FILTER (WHERE end_date >= $2::date AND end_date < $1::date) as last_week
          FROM memberships WHERE status='expired' AND (is_deleted = FALSE OR is_deleted IS NULL)${branchFilter}`,
          [startOfThisWeek, startOfLastWeek],
        );

        const endOfWeekDate = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
        const lastWeekEnd = new Date(startOfThisWeek);
        const lastWeekEndPlus7 = new Date(
          startOfThisWeek.getTime() + 7 * 24 * 60 * 60 * 1000,
        );
        const weekExpiringSoonResult = await client.query(
          `SELECT
            COUNT(*) FILTER (WHERE status='active' AND end_date >= CURRENT_DATE AND end_date <= $1::date) as this_week,
            COUNT(*) FILTER (WHERE end_date >= $2::date AND end_date <= $3::date) as last_week
          FROM memberships
          WHERE (is_deleted = FALSE OR is_deleted IS NULL)${branchFilter}`,
          [endOfWeekDate, lastWeekEnd, lastWeekEndPlus7],
        );

        const wc = weekCompResult.rows[0];
        const wa = weekAttendanceResult.rows[0];
        const wr = weekRevenueResult.rows[0];
        const we = weekExpiredResult.rows[0];
        const wes = weekExpiringSoonResult.rows[0];

        return {
          weekComparison: {
            newClients: {
              thisWeek: parseInt(wc.this_week_clients, 10),
              lastWeek: parseInt(wc.last_week_clients, 10),
            },
            attendance: {
              thisWeek: parseInt(wa.this_week, 10),
              lastWeek: parseInt(wa.last_week, 10),
            },
            enquiries: {
              thisWeek: parseInt(wc.this_week_enquiries, 10),
              lastWeek: parseInt(wc.last_week_enquiries, 10),
            },
            revenue: {
              thisWeek: parseFloat(wr.this_week),
              lastWeek: parseFloat(wr.last_week),
            },
            expiringSoon: {
              thisWeek: parseInt(wes.this_week, 10),
              lastWeek: parseInt(wes.last_week, 10),
            },
            expired: {
              thisWeek: parseInt(we.this_week, 10),
              lastWeek: parseInt(we.last_week, 10),
            },
          },
          sparklines: {
            clients: sparkResult.rows.map((r: any) =>
              parseInt(r.new_clients, 10),
            ),
            attendance: sparkResult.rows.map((r: any) =>
              parseInt(r.attendance, 10),
            ),
            enquiries: sparkResult.rows.map((r: any) =>
              parseInt(r.enquiries, 10),
            ),
            revenue: sparkResult.rows.map((r: any) => parseFloat(r.revenue)),
            expiringSoon: sparkResult.rows.map(() => 0), // No daily breakdown for "expiring soon"
            expired: sparkResult.rows.map((r: any) =>
              parseInt(r.expired, 10),
            ),
          },
        };
      });

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
      expiredMemberships: stats.expiredMemberships,
      pendingOnboardingCount: stats.pendingOnboardingCount,
      maleClients: stats.maleClients,
      femaleClients: stats.femaleClients,
      newClientsThisMonth: stats.newClientsThisMonth,
      newEnquiriesThisMonth: stats.newEnquiriesThisMonth,
      expiringSoon: stats.expiringSoon,
      totalProducts: stats.totalProducts,
      thisMonthProductSales: stats.thisMonthProductSales,
      monthlyRevenueHistory,
      monthlyProductSalesHistory,
      weekComparison,
      sparklines,
    };
  }

  private async getRecentClients(
    gymId: number,
    limit = 5,
  ): Promise<RecentClientDto[]> {
    const clients = await this.tenantService.executeInTenant(
      gymId,
      async (client) => {
        let query = `SELECT id, name, email, avatar, status, created_at FROM users WHERE role = 'client' AND (is_deleted = FALSE OR is_deleted IS NULL)`;
        const values: SqlValue[] = [];

        query += ` ORDER BY created_at DESC LIMIT $${values.length + 1}`;
        values.push(limit);

        const result = await client.query(query, values);
        return result.rows;
      },
    );

    return clients.map((c: Record<string, any>) => ({
      id: c.id,
      name: c.name,
      email: c.email,
      avatar: c.avatar || undefined,
      status: c.status,
      createdAt: c.created_at,
    }));
  }

  private async getRecentAttendance(
    gymId: number,
    limit = 5,
  ): Promise<RecentAttendanceDto[]> {
    const today = new Date().toISOString().split('T')[0];

    const attendance = await this.tenantService.executeInTenant(
      gymId,
      async (client) => {
        const values: SqlValue[] = [today];
        let query = `SELECT a.id, a.attendance_date as date, a.check_in_time, a.check_out_time, a.status, u.name as user_name
         FROM attendance a
         JOIN users u ON u.id = a.user_id
         WHERE a.attendance_date = $1::DATE`;

        query += ` ORDER BY a.check_in_time DESC LIMIT $${values.length + 1}`;
        values.push(limit);

        const result = await client.query(query, values);
        return result.rows;
      },
    );

    return attendance.map((record: Record<string, any>) => ({
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

  private async getExpiringMemberships(
    gymId: number,
    limit = 5,
    branchId?: number | null,
  ): Promise<ExpiringMembershipDto[]> {
    const now = new Date();
    const sevenDaysLater = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);

    const memberships = await this.tenantService.executeInTenant(
      gymId,
      async (client) => {
        const values: SqlValue[] = [now, sevenDaysLater];
        let query = `SELECT m.id, m.end_date, p.name as plan_name, u.id as user_id, u.name as user_name, u.avatar
         FROM memberships m
         JOIN users u ON u.id = m.user_id
         LEFT JOIN plans p ON p.id = m.plan_id
         WHERE m.status = 'active' AND m.end_date >= $1::TIMESTAMP AND m.end_date <= $2::TIMESTAMP`;

        if (branchId) {
          values.push(branchId);
          query += ` AND m.branch_id = $${values.length}`;
        }

        query += ` ORDER BY m.end_date ASC LIMIT $${values.length + 1}`;
        values.push(limit);

        const result = await client.query(query, values);
        return result.rows;
      },
    );

    return memberships.map((m: Record<string, any>) => {
      const endDate = new Date(m.end_date);
      const diffMs = endDate.getTime() - now.getTime();
      const daysRemaining = Math.max(
        0,
        Math.ceil(diffMs / (1000 * 60 * 60 * 24)),
      );
      return {
        id: m.id,
        userId: m.user_id,
        userName: m.user_name,
        avatar: m.avatar || undefined,
        planName: m.plan_name || 'Unknown Plan',
        endDate: endDate.toISOString().split('T')[0],
        daysRemaining,
      };
    });
  }

  private async getRecentTicketsForGym(
    gymId: number,
    limit = 5,
  ): Promise<RecentTicketDto[]> {
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
  async getClientDashboard(
    userId: number,
    gymId: number,
  ): Promise<ClientDashboardDto> {
    const [
      user,
      subscription,
      attendanceStats,
      recentAttendance,
      activeOffers,
      upcomingClassBookings,
      upcomingAppointments,
    ] = await Promise.all([
      this.getClientUser(userId, gymId),
      this.getClientSubscription(userId, gymId),
      this.getClientAttendanceStats(userId, gymId),
      this.getClientRecentAttendance(userId, gymId),
      this.getClientActiveOffers(gymId),
      this.getClientUpcomingClassBookings(userId, gymId),
      this.getClientUpcomingAppointments(userId, gymId),
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

    // Get membership facilities and amenities if subscription exists
    let facilities: ClientFacilityDto[] = [];
    let amenities: ClientAmenityDto[] = [];
    if (subscription) {
      const membershipExtras = await this.getClientMembershipFacilities(
        subscription.id,
        gymId,
      );
      facilities = membershipExtras.facilities;
      amenities = membershipExtras.amenities;
    }

    return {
      attendanceCode: user?.attendance_code || '----',
      gym: gym
        ? {
            id: gym.id,
            name: gym.name,
            logo: gym.logo || undefined,
            phone: gym.phone || undefined,
            email: gym.email || undefined,
            address: gym.address || undefined,
            city: gym.city || undefined,
            state: gym.state || undefined,
          }
        : undefined,
      subscription,
      attendanceStats,
      recentAttendance,
      activeOffers,
      facilities,
      amenities,
      upcomingClassBookings,
      upcomingAppointments,
    };
  }

  private async getClientMembershipFacilities(
    membershipId: number,
    gymId: number,
  ): Promise<{ facilities: ClientFacilityDto[]; amenities: ClientAmenityDto[] }> {
    return this.tenantService.executeInTenant(gymId, async (client) => {
      const [facilitiesResult, amenitiesResult] = await Promise.all([
        client.query(
          `SELECT f.id, f.name, f.code, f.description, f.icon
           FROM membership_facilities mf
           JOIN facilities f ON f.id = mf.facility_id
           WHERE mf.membership_id = $1 AND f.is_active = true
           ORDER BY f.display_order`,
          [membershipId],
        ),
        client.query(
          `SELECT a.id, a.name, a.code, a.description, a.icon
           FROM membership_amenities ma
           JOIN amenities a ON a.id = ma.amenity_id
           WHERE ma.membership_id = $1 AND a.is_active = true
           ORDER BY a.display_order`,
          [membershipId],
        ),
      ]);

      return {
        facilities: facilitiesResult.rows.map((f: Record<string, any>) => ({
          id: f.id,
          name: f.name,
          code: f.code,
          description: f.description,
          icon: f.icon,
        })),
        amenities: amenitiesResult.rows.map((a: Record<string, any>) => ({
          id: a.id,
          name: a.name,
          code: a.code,
          description: a.description,
          icon: a.icon,
        })),
      };
    });
  }

  private async getClientUser(userId: number, gymId: number) {
    return this.tenantService.executeInTenant(gymId, async (client) => {
      const result = await client.query(
        `SELECT id, attendance_code FROM users WHERE id = $1`,
        [userId],
      );
      return result.rows[0];
    });
  }

  private async getClientSubscription(
    userId: number,
    gymId: number,
  ): Promise<ClientSubscriptionDto | undefined> {
    const membership = await this.tenantService.executeInTenant(
      gymId,
      async (client) => {
        const result = await client.query(
          `SELECT m.*, p.name as plan_name
         FROM memberships m
         LEFT JOIN plans p ON p.id = m.plan_id
         WHERE m.user_id = $1 AND m.status = 'active'
         ORDER BY m.created_at DESC LIMIT 1`,
          [userId],
        );
        return result.rows[0];
      },
    );

    if (!membership) return undefined;

    const now = new Date();
    const startDate = new Date(membership.start_date);
    const endDate = new Date(membership.end_date);

    // Calculate days remaining
    const diffTime = endDate.getTime() - now.getTime();
    const daysRemaining = Math.max(
      0,
      Math.ceil(diffTime / (1000 * 60 * 60 * 24)),
    );

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

  private async getClientAttendanceStats(
    userId: number,
    gymId: number,
  ): Promise<ClientAttendanceStatsDto> {
    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const startOfWeek = new Date(now);
    startOfWeek.setDate(now.getDate() - now.getDay()); // Sunday
    startOfWeek.setHours(0, 0, 0, 0);

    const startOfMonthStr = startOfMonth.toISOString().split('T')[0];
    const startOfWeekStr = startOfWeek.toISOString().split('T')[0];

    const stats = await this.tenantService.executeInTenant(
      gymId,
      async (client) => {
        const [thisMonthResult, thisWeekResult, totalResult] =
          await Promise.all([
            client.query(
              `SELECT COUNT(*) as count FROM attendance WHERE user_id = $1 AND attendance_date >= $2::DATE AND status = 'present'`,
              [userId, startOfMonthStr],
            ),
            client.query(
              `SELECT COUNT(*) as count FROM attendance WHERE user_id = $1 AND attendance_date >= $2::DATE AND status = 'present'`,
              [userId, startOfWeekStr],
            ),
            client.query(
              `SELECT COUNT(*) as count FROM attendance WHERE user_id = $1 AND status = 'present'`,
              [userId],
            ),
          ]);

        return {
          thisMonth: parseInt(thisMonthResult.rows[0].count, 10),
          thisWeek: parseInt(thisWeekResult.rows[0].count, 10),
          total: parseInt(totalResult.rows[0].count, 10),
        };
      },
    );

    return {
      thisMonth: stats.thisMonth,
      thisWeek: stats.thisWeek,
      total: stats.total,
    };
  }

  private async getClientRecentAttendance(
    userId: number,
    gymId: number,
    limit = 5,
  ): Promise<ClientRecentAttendanceDto[]> {
    const attendance = await this.tenantService.executeInTenant(
      gymId,
      async (client) => {
        const result = await client.query(
          `SELECT id, attendance_date as date, check_in_time, check_out_time, status FROM attendance WHERE user_id = $1 ORDER BY attendance_date DESC LIMIT $2`,
          [userId, limit],
        );
        return result.rows;
      },
    );

    return attendance.map((record: Record<string, any>) => ({
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

  private async getClientActiveOffers(
    gymId: number,
    limit = 3,
  ): Promise<ActiveOfferDto[]> {
    const now = new Date();

    const offers = await this.tenantService.executeInTenant(
      gymId,
      async (client) => {
        const values: (SqlValue | Date)[] = [now];
        let query = `SELECT id, name, description, discount_type, discount_value, code, valid_to
         FROM offers
         WHERE is_active = true AND valid_from <= $1 AND valid_to >= $1`;

        query += ` ORDER BY valid_to ASC LIMIT $${values.length + 1}`;
        values.push(limit);

        const result = await client.query(query, values);
        return result.rows;
      },
    );

    return offers.map((offer: Record<string, any>) => ({
      id: offer.id,
      title: offer.name,
      description: offer.description || undefined,
      discountPercentage:
        offer.discount_type === 'percentage' ? Number(offer.discount_value) : 0,
      code: offer.code || undefined,
      endDate: new Date(offer.valid_to).toISOString().split('T')[0],
    }));
  }

  private async getClientUpcomingClassBookings(
    userId: number,
    gymId: number,
    limit = 5,
  ): Promise<UpcomingClassBookingDto[]> {
    const today = new Date().toISOString().split('T')[0];

    const bookings = await this.tenantService.executeInTenant(
      gymId,
      async (client) => {
        const result = await client.query(
          `SELECT cb.id, ct.name as class_name, cs.start_time, cs.end_time,
                  u.name as trainer_name, cb.status
           FROM class_bookings cb
           JOIN class_sessions cs ON cs.id = cb.class_session_id
           JOIN class_types ct ON ct.id = cs.class_type_id
           LEFT JOIN users u ON u.id = cs.trainer_id
           WHERE cb.user_id = $1
             AND cs.session_date = $2::DATE
             AND cb.status = 'booked'
           ORDER BY cs.start_time ASC
           LIMIT $3`,
          [userId, today, limit],
        );
        return result.rows;
      },
    );

    return bookings.map((b: Record<string, any>) => ({
      id: b.id,
      className: b.class_name,
      startTime: new Date(b.start_time).toLocaleTimeString('en-US', {
        hour: '2-digit',
        minute: '2-digit',
        hour12: true,
      }),
      endTime: new Date(b.end_time).toLocaleTimeString('en-US', {
        hour: '2-digit',
        minute: '2-digit',
        hour12: true,
      }),
      trainerName: b.trainer_name || undefined,
      status: b.status,
    }));
  }

  private async getClientUpcomingAppointments(
    userId: number,
    gymId: number,
    limit = 5,
  ): Promise<UpcomingAppointmentDto[]> {
    const now = new Date();
    const today = now.toISOString().split('T')[0];

    const appointments = await this.tenantService.executeInTenant(
      gymId,
      async (client) => {
        const result = await client.query(
          `SELECT a.id, a.title, a.start_time, a.end_time,
                  u.name as trainer_name, a.status
           FROM appointments a
           LEFT JOIN users u ON u.id = a.trainer_id
           WHERE a.user_id = $1
             AND a.appointment_date = $2::DATE
             AND a.start_time >= $3
             AND a.status IN ('booked', 'confirmed')
           ORDER BY a.start_time ASC
           LIMIT $4`,
          [userId, today, now, limit],
        );
        return result.rows;
      },
    );

    return appointments.map((a: Record<string, any>) => ({
      id: a.id,
      title: a.title,
      startTime: new Date(a.start_time).toLocaleTimeString('en-US', {
        hour: '2-digit',
        minute: '2-digit',
        hour12: true,
      }),
      endTime: new Date(a.end_time).toLocaleTimeString('en-US', {
        hour: '2-digit',
        minute: '2-digit',
        hour12: true,
      }),
      trainerName: a.trainer_name || undefined,
      status: a.status,
    }));
  }
}
