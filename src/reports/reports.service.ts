import {
  Injectable,
  NotFoundException,
  ForbiddenException,
} from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';
import { TenantService } from '../tenant/tenant.service';
import { SqlValue } from '../common/types';
import { ROLES } from '../common/constants';
import { AttendanceService } from '../attendance/attendance.service';
import {
  ReportFilterDto,
  IncomeExpenseReportDto,
  MembershipSalesReportDto,
  PaymentDuesReportDto,
} from './dto/reports.dto';
import {
  ClientReportFilterDto,
  ClientProgressReportDto,
  ClientAttendanceReportDto,
  TrainerClientsSummaryDto,
} from './dto/client-reports.dto';
import {
  PdfReportFilterDto,
  FullReportData,
  DashboardSummary,
  TrainerStaffReportItem,
  GymInfo,
} from './dto/pdf-report.dto';

@Injectable()
export class ReportsService {
  constructor(
    private prisma: PrismaService,
    private tenantService: TenantService,
    private attendanceService: AttendanceService,
  ) {}

  async getIncomeExpenseReport(
    gymId: number,
    filters: ReportFilterDto,
    branchId: number | null = null,
  ): Promise<IncomeExpenseReportDto> {
    const currentDate = new Date();
    const year = filters.year || currentDate.getFullYear();
    const month = filters.month;

    // Get membership income
    const membershipIncome = await this.tenantService.executeInTenant(
      gymId,
      async (client) => {
        let whereClause = `payment_status = 'paid'`;
        const values: SqlValue[] = [];
        let paramIndex = 1;

        // Branch filtering
        if (branchId !== null) {
          whereClause += ` AND branch_id = $${paramIndex++}`;
          values.push(branchId);
        }

        if (month) {
          whereClause += ` AND EXTRACT(MONTH FROM paid_at) = $${paramIndex++}`;
          values.push(month);
        }
        whereClause += ` AND EXTRACT(YEAR FROM paid_at) = $${paramIndex++}`;
        values.push(year);

        const result = await client.query(
          `SELECT
            COALESCE(SUM(final_amount), 0) as total,
            COUNT(*) as count
          FROM memberships
          WHERE ${whereClause}`,
          values,
        );
        return {
          total: parseFloat(result.rows[0].total),
          count: parseInt(result.rows[0].count, 10),
        };
      },
    );

    // Get salary expense (from tenant schema)
    const salaryExpense = await this.tenantService.executeInTenant(
      gymId,
      async (client) => {
        let whereClause = `s.payment_status = 'paid'`;
        const values: SqlValue[] = [];
        let paramIndex = 1;

        // Branch filtering via staff's branch_id
        if (branchId !== null) {
          whereClause += ` AND u.branch_id = $${paramIndex++}`;
          values.push(branchId);
        }

        if (month) {
          whereClause += ` AND s.month = $${paramIndex++}`;
          values.push(month);
        }
        whereClause += ` AND s.year = $${paramIndex++}`;
        values.push(year);

        const result = await client.query(
          `SELECT
            COALESCE(SUM(s.net_amount), 0) as total,
            COUNT(*) as count
          FROM staff_salaries s
          JOIN users u ON u.id = s.staff_id
          WHERE ${whereClause}`,
          values,
        );
        return {
          total: parseFloat(result.rows[0]?.total || 0),
          count: parseInt(result.rows[0]?.count || 0, 10),
        };
      },
    );

    const salaryTotal = salaryExpense.total;

    // Get income by month
    const incomeByMonth = await this.tenantService.executeInTenant(
      gymId,
      async (client) => {
        let whereClause = `payment_status = 'paid' AND EXTRACT(YEAR FROM paid_at) = $1`;
        const values: SqlValue[] = [year];
        let paramIndex = 2;

        // Branch filtering
        if (branchId !== null) {
          whereClause += ` AND branch_id = $${paramIndex++}`;
          values.push(branchId);
        }

        const result = await client.query(
          `SELECT
            TO_CHAR(paid_at, 'Mon') as month,
            EXTRACT(MONTH FROM paid_at) as month_num,
            COALESCE(SUM(final_amount), 0) as amount
          FROM memberships
          WHERE ${whereClause}
          GROUP BY TO_CHAR(paid_at, 'Mon'), EXTRACT(MONTH FROM paid_at)
          ORDER BY month_num`,
          values,
        );
        return result.rows.map((r: Record<string, any>) => ({
          month: r.month,
          amount: parseFloat(r.amount),
        }));
      },
    );

    // Get expense by month (from tenant schema)
    const expenseByMonth = await this.tenantService.executeInTenant(
      gymId,
      async (client) => {
        let whereClause = `s.payment_status = 'paid' AND s.year = $1`;
        const values: SqlValue[] = [year];
        let paramIndex = 2;

        // Branch filtering via staff's branch_id
        if (branchId !== null) {
          whereClause += ` AND u.branch_id = $${paramIndex++}`;
          values.push(branchId);
        }

        const result = await client.query(
          `SELECT
            CASE s.month
              WHEN 1 THEN 'Jan' WHEN 2 THEN 'Feb' WHEN 3 THEN 'Mar'
              WHEN 4 THEN 'Apr' WHEN 5 THEN 'May' WHEN 6 THEN 'Jun'
              WHEN 7 THEN 'Jul' WHEN 8 THEN 'Aug' WHEN 9 THEN 'Sep'
              WHEN 10 THEN 'Oct' WHEN 11 THEN 'Nov' WHEN 12 THEN 'Dec'
            END as month,
            s.month as month_num,
            COALESCE(SUM(s.net_amount), 0) as amount
          FROM staff_salaries s
          JOIN users u ON u.id = s.staff_id
          WHERE ${whereClause}
          GROUP BY s.month
          ORDER BY month_num`,
          values,
        );
        return result.rows;
      },
    );

    // Get income by payment method
    const incomeByPaymentMethod = await this.tenantService.executeInTenant(
      gymId,
      async (client) => {
        let whereClause = `payment_status = 'paid' AND EXTRACT(YEAR FROM paid_at) = $1`;
        const values: SqlValue[] = [year];
        let paramIndex = 2;

        // Branch filtering
        if (branchId !== null) {
          whereClause += ` AND branch_id = $${paramIndex++}`;
          values.push(branchId);
        }

        const result = await client.query(
          `SELECT
            COALESCE(payment_method, 'unknown') as method,
            COALESCE(SUM(final_amount), 0) as amount,
            COUNT(*) as count
          FROM memberships
          WHERE ${whereClause}
          GROUP BY payment_method
          ORDER BY amount DESC`,
          values,
        );
        return result.rows.map((r: Record<string, any>) => ({
          method: r.method,
          amount: parseFloat(r.amount),
          count: parseInt(r.count, 10),
        }));
      },
    );

    const totalIncome = membershipIncome.total;
    const totalExpense = salaryTotal;

    return {
      period: month ? `${this.getMonthName(month)} ${year}` : `Year ${year}`,
      income: {
        membershipPayments: membershipIncome.total,
        totalIncome,
      },
      expense: {
        salaryPayments: salaryTotal,
        totalExpense,
      },
      netProfit: totalIncome - totalExpense,
      breakdown: {
        incomeByMonth,
        expenseByMonth: expenseByMonth.map((r: Record<string, any>) => ({
          month: r.month,
          amount: parseFloat(r.amount),
        })),
        incomeByPaymentMethod,
      },
    };
  }

  async getMembershipSalesReport(
    gymId: number,
    filters: ReportFilterDto,
    branchId: number | null = null,
  ): Promise<MembershipSalesReportDto> {
    const currentDate = new Date();
    const year = filters.year || currentDate.getFullYear();
    const month = filters.month;

    // Get sales summary
    const salesSummary = await this.tenantService.executeInTenant(
      gymId,
      async (client) => {
        let whereClause = `m.payment_status = 'paid'`;
        const values: SqlValue[] = [];
        let paramIndex = 1;

        // Branch filtering
        if (branchId !== null) {
          whereClause += ` AND m.branch_id = $${paramIndex++}`;
          values.push(branchId);
        }

        if (month) {
          whereClause += ` AND EXTRACT(MONTH FROM m.paid_at) = $${paramIndex++}`;
          values.push(month);
        }
        whereClause += ` AND EXTRACT(YEAR FROM m.paid_at) = $${paramIndex++}`;
        values.push(year);

        const result = await client.query(
          `SELECT
            COUNT(*) as total_sales,
            COALESCE(SUM(m.final_amount), 0) as total_revenue,
            COALESCE(AVG(m.final_amount), 0) as avg_order_value
          FROM memberships m
          WHERE ${whereClause}`,
          values,
        );

        return {
          totalSales: parseInt(result.rows[0].total_sales, 10),
          totalRevenue: parseFloat(result.rows[0].total_revenue),
          averageOrderValue: parseFloat(result.rows[0].avg_order_value),
        };
      },
    );

    // Get sales by plan
    const salesByPlan = await this.tenantService.executeInTenant(
      gymId,
      async (client) => {
        let whereClause = `m.payment_status = 'paid'`;
        const values: SqlValue[] = [];
        let paramIndex = 1;

        // Branch filtering
        if (branchId !== null) {
          whereClause += ` AND m.branch_id = $${paramIndex++}`;
          values.push(branchId);
        }

        if (month) {
          whereClause += ` AND EXTRACT(MONTH FROM m.paid_at) = $${paramIndex++}`;
          values.push(month);
        }
        whereClause += ` AND EXTRACT(YEAR FROM m.paid_at) = $${paramIndex++}`;
        values.push(year);

        const result = await client.query(
          `SELECT
            p.id as plan_id,
            p.name as plan_name,
            p.code as plan_code,
            COUNT(*) as count,
            COALESCE(SUM(m.final_amount), 0) as revenue
          FROM memberships m
          JOIN plans p ON p.id = m.plan_id
          WHERE ${whereClause}
          GROUP BY p.id, p.name, p.code
          ORDER BY revenue DESC`,
          values,
        );

        const totalRevenue = result.rows.reduce(
          (sum: number, r: Record<string, any>) => sum + parseFloat(r.revenue),
          0,
        );

        return result.rows.map((r: Record<string, any>) => ({
          planId: r.plan_id,
          planName: r.plan_name,
          planCode: r.plan_code,
          count: parseInt(r.count, 10),
          revenue: parseFloat(r.revenue),
          percentage:
            totalRevenue > 0
              ? Math.round((parseFloat(r.revenue) / totalRevenue) * 100)
              : 0,
        }));
      },
    );

    // Get sales by month
    const salesByMonth = await this.tenantService.executeInTenant(
      gymId,
      async (client) => {
        let whereClause = `payment_status = 'paid' AND EXTRACT(YEAR FROM paid_at) = $1`;
        const values: SqlValue[] = [year];
        let paramIndex = 2;

        // Branch filtering
        if (branchId !== null) {
          whereClause += ` AND branch_id = $${paramIndex++}`;
          values.push(branchId);
        }

        const result = await client.query(
          `SELECT
            TO_CHAR(paid_at, 'Mon') as month,
            EXTRACT(MONTH FROM paid_at) as month_num,
            COUNT(*) as count,
            COALESCE(SUM(final_amount), 0) as revenue
          FROM memberships
          WHERE ${whereClause}
          GROUP BY TO_CHAR(paid_at, 'Mon'), EXTRACT(MONTH FROM paid_at)
          ORDER BY month_num`,
          values,
        );
        return result.rows.map((r: Record<string, any>) => ({
          month: r.month,
          count: parseInt(r.count, 10),
          revenue: parseFloat(r.revenue),
        }));
      },
    );

    const topPlan = salesByPlan.length > 0 ? salesByPlan[0] : null;

    return {
      period: month ? `${this.getMonthName(month)} ${year}` : `Year ${year}`,
      summary: {
        ...salesSummary,
        newMemberships: salesSummary.totalSales, // All paid memberships for the period
        renewals: 0, // Would need additional logic to track renewals
      },
      salesByPlan,
      salesByMonth,
      topPerformingPlan: topPlan
        ? {
            planName: topPlan.planName,
            revenue: topPlan.revenue,
            count: topPlan.count,
          }
        : null,
    };
  }

  async getPaymentDuesReport(
    gymId: number,
    branchId: number | null = null,
  ): Promise<PaymentDuesReportDto> {
    // Get membership dues (pending payments)
    const membershipDues = await this.tenantService.executeInTenant(
      gymId,
      async (client) => {
        let query = `SELECT
            m.id,
            u.name as client_name,
            u.email as client_email,
            p.name as plan_name,
            m.final_amount as amount,
            m.start_date as due_date,
            m.created_at
          FROM memberships m
          JOIN users u ON u.id = m.user_id
          JOIN plans p ON p.id = m.plan_id
          WHERE m.payment_status = 'pending'`;
        const values: SqlValue[] = [];

        // Branch filtering
        if (branchId !== null) {
          query += ` AND m.branch_id = $1`;
          values.push(branchId);
        }

        query += ` ORDER BY m.created_at ASC`;

        const result = await client.query(query, values);

        const today = new Date();
        return result.rows.map((r: Record<string, any>) => {
          const dueDate = new Date(r.due_date || r.created_at);
          const diffTime = today.getTime() - dueDate.getTime();
          const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

          return {
            id: r.id,
            clientName: r.client_name,
            clientEmail: r.client_email,
            planName: r.plan_name,
            amount: parseFloat(r.amount),
            dueDate: dueDate.toISOString().split('T')[0],
            daysOverdue: Math.max(0, diffDays),
          };
        });
      },
    );

    // Get salary dues (pending salaries)
    const salaryDuesResult = await this.tenantService.executeInTenant(
      gymId,
      async (client) => {
        let whereClause = `s.payment_status = 'pending'`;
        const values: SqlValue[] = [];
        let paramIndex = 1;

        // Branch filtering via staff's branch_id
        if (branchId !== null) {
          whereClause += ` AND u.branch_id = $${paramIndex++}`;
          values.push(branchId);
        }

        const result = await client.query(
          `SELECT
            s.id,
            u.name as staff_name,
            u.email as staff_email,
            u.role as staff_role,
            s.month,
            s.year,
            s.net_amount as amount
          FROM staff_salaries s
          JOIN users u ON u.id = s.staff_id
          WHERE ${whereClause}
          ORDER BY s.year DESC, s.month DESC`,
          values,
        );

        return result.rows.map((r: Record<string, any>) => ({
          id: r.id,
          staffName: r.staff_name,
          staffEmail: r.staff_email,
          staffRole: r.staff_role === ROLES.TRAINER ? 'Trainer' : 'Manager',
          period: `${this.getMonthName(r.month)} ${r.year}`,
          amount: parseFloat(r.amount),
        }));
      },
    );

    const membershipDuesTotal = membershipDues.reduce(
      (sum: number, d: Record<string, any>) => sum + d.amount,
      0,
    );
    const salaryDuesTotal = salaryDuesResult.reduce(
      (sum: number, d: Record<string, any>) => sum + d.amount,
      0,
    );
    const overdueCount = membershipDues.filter(
      (d: Record<string, any>) => d.daysOverdue > 0,
    ).length;

    return {
      summary: {
        totalDueAmount: membershipDuesTotal + salaryDuesTotal,
        membershipDues: membershipDuesTotal,
        salaryDues: salaryDuesTotal,
        overdueCount,
      },
      membershipDues,
      salaryDues: salaryDuesResult,
    };
  }

  // ============================================
  // DAILY SALES REPORT
  // ============================================

  async getDailySalesReport(
    gymId: number,
    date: string,
    branchId: number | null = null,
  ) {
    const dayStart = `${date} 00:00:00`;
    const dayEnd = `${date} 23:59:59.999`;

    // 1. Get membership payments for the day
    const membershipSales = await this.tenantService.executeInTenant(
      gymId,
      async (client) => {
        let whereClause = `m.payment_status = 'paid' AND (m.is_deleted = FALSE OR m.is_deleted IS NULL) AND m.paid_at >= $1 AND m.paid_at <= $2`;
        const values: SqlValue[] = [dayStart, dayEnd];
        let paramIndex = 3;

        if (branchId !== null) {
          whereClause += ` AND (m.branch_id = $${paramIndex++} OR m.branch_id IS NULL)`;
          values.push(branchId);
        }

        const result = await client.query(
          `SELECT
            m.id,
            u.name as client_name,
            p.name as plan_name,
            m.final_amount as amount,
            m.payment_method,
            m.paid_at
          FROM memberships m
          LEFT JOIN users u ON u.id = m.user_id
          LEFT JOIN plans p ON p.id = m.plan_id
          WHERE ${whereClause}
          ORDER BY m.paid_at DESC`,
          values,
        );

        return result.rows.map((r: Record<string, any>) => ({
          id: r.id,
          clientName: r.client_name || 'Unknown',
          planName: r.plan_name || 'Unknown',
          amount: parseFloat(r.amount || 0),
          paymentMethod: r.payment_method || 'unknown',
          paidAt: r.paid_at,
        }));
      },
    );

    // 2. Get product sales for the day
    const productSales = await this.tenantService.executeInTenant(
      gymId,
      async (client) => {
        let whereClause = `(ps.is_deleted = FALSE OR ps.is_deleted IS NULL) AND ps.sold_at >= $1 AND ps.sold_at <= $2`;
        const values: SqlValue[] = [dayStart, dayEnd];
        let paramIndex = 3;

        if (branchId !== null) {
          whereClause += ` AND (ps.branch_id = $${paramIndex++} OR ps.branch_id IS NULL)`;
          values.push(branchId);
        }

        const result = await client.query(
          `SELECT
            ps.id,
            pr.name as product_name,
            u.name as buyer_name,
            ps.quantity,
            ps.unit_price,
            ps.tax_amount,
            ps.total_amount,
            ps.payment_method,
            ps.sold_at
          FROM product_sales ps
          LEFT JOIN products pr ON ps.product_id = pr.id
          LEFT JOIN users u ON ps.user_id = u.id
          WHERE ${whereClause}
          ORDER BY ps.sold_at DESC`,
          values,
        );

        return result.rows.map((r: Record<string, any>) => ({
          id: r.id,
          productName: r.product_name || 'Unknown',
          buyerName: r.buyer_name || 'Walk-in',
          quantity: parseInt(r.quantity, 10),
          unitPrice: parseFloat(r.unit_price || 0),
          taxAmount: parseFloat(r.tax_amount || 0),
          totalAmount: parseFloat(r.total_amount || 0),
          paymentMethod: r.payment_method || 'unknown',
          soldAt: r.sold_at,
        }));
      },
    );

    // 3. Get salary/expense payments for the day
    const expenses = await this.tenantService.executeInTenant(
      gymId,
      async (client) => {
        let whereClause = `s.payment_status = 'paid' AND (s.is_deleted = FALSE OR s.is_deleted IS NULL) AND s.paid_at >= $1 AND s.paid_at <= $2`;
        const values: SqlValue[] = [dayStart, dayEnd];
        let paramIndex = 3;

        if (branchId !== null) {
          whereClause += ` AND (u.branch_id = $${paramIndex++} OR u.branch_id IS NULL)`;
          values.push(branchId);
        }

        const result = await client.query(
          `SELECT
            s.id,
            u.name as staff_name,
            'salary' as type,
            s.net_amount as amount,
            s.paid_at
          FROM staff_salaries s
          JOIN users u ON u.id = s.staff_id
          WHERE ${whereClause}
          ORDER BY s.paid_at DESC`,
          values,
        );

        return result.rows.map((r: Record<string, any>) => ({
          id: r.id,
          staffName: r.staff_name || 'Unknown',
          type: r.type,
          amount: parseFloat(r.amount || 0),
          paidAt: r.paid_at,
        }));
      },
    );

    // 4. Calculate summaries
    const membershipRevenue = membershipSales.reduce((sum: number, s: any) => sum + s.amount, 0);
    const productRevenue = productSales.reduce((sum: number, s: any) => sum + s.totalAmount, 0);
    const totalRevenue = membershipRevenue + productRevenue;
    const totalExpenses = expenses.reduce((sum: number, e: any) => sum + e.amount, 0);

    // 5. Aggregate payment methods across memberships + product sales
    const methodMap: Record<string, { amount: number; count: number }> = {};
    for (const sale of membershipSales) {
      const method = sale.paymentMethod;
      if (!methodMap[method]) methodMap[method] = { amount: 0, count: 0 };
      methodMap[method].amount += sale.amount;
      methodMap[method].count += 1;
    }
    for (const sale of productSales) {
      const method = sale.paymentMethod;
      if (!methodMap[method]) methodMap[method] = { amount: 0, count: 0 };
      methodMap[method].amount += sale.totalAmount;
      methodMap[method].count += 1;
    }

    const paymentMethodBreakdown = Object.entries(methodMap).map(
      ([method, data]) => ({
        method,
        amount: data.amount,
        count: data.count,
      }),
    );

    return {
      date,
      summary: {
        membershipRevenue,
        productRevenue,
        totalRevenue,
        totalExpenses,
        netProfit: totalRevenue - totalExpenses,
        membershipCount: membershipSales.length,
        productSaleCount: productSales.length,
      },
      paymentMethodBreakdown,
      membershipSales,
      productSales,
      expenses,
    };
  }

  // ============================================
  // TRAINER CLIENT REPORTS
  // ============================================

  /**
   * Verify trainer has access to client
   */
  private async verifyTrainerClientAccess(
    trainerId: number,
    clientId: number,
    gymId: number,
  ): Promise<{ clientName: string; clientEmail: string }> {
    const assignment = await this.tenantService.executeInTenant(
      gymId,
      async (client) => {
        const result = await client.query(
          `SELECT tc.id, c.name as client_name, c.email as client_email
         FROM trainer_client_xref tc
         JOIN users c ON c.id = tc.client_id
         WHERE tc.trainer_id = $1 AND tc.client_id = $2 AND tc.is_active = true`,
          [trainerId, clientId],
        );
        return result.rows[0];
      },
    );

    if (!assignment) {
      throw new ForbiddenException('You do not have access to this client');
    }

    return {
      clientName: assignment.client_name,
      clientEmail: assignment.client_email,
    };
  }

  /**
   * Get progress report for a specific client
   */
  async getClientProgressReport(
    trainerId: number,
    clientId: number,
    gymId: number,
    filters?: ClientReportFilterDto,
    branchId?: number | null,
  ): Promise<ClientProgressReportDto> {
    // Verify trainer has access to this client
    const { clientName, clientEmail } = await this.verifyTrainerClientAccess(
      trainerId,
      clientId,
      gymId,
    );

    const now = new Date();
    const defaultStartDate = new Date(now.getFullYear(), now.getMonth() - 6, 1); // 6 months ago
    const startDate = filters?.startDate
      ? new Date(filters.startDate)
      : defaultStartDate;
    const endDate = filters?.endDate ? new Date(filters.endDate) : now;

    // Get body metrics history
    const metricsData = await this.tenantService.executeInTenant(
      gymId,
      async (client) => {
        let whereClause =
          'user_id = $1 AND measured_at >= $2 AND measured_at <= $3';
        const values: SqlValue[] = [clientId, startDate, endDate];
        let paramIndex = 4;

        if (branchId !== null && branchId !== undefined) {
          whereClause += ` AND branch_id = $${paramIndex++}`;
          values.push(branchId);
        }

        // Get all history records
        const historyResult = await client.query(
          `SELECT id, measured_at, weight, bmi, body_fat, muscle_mass, waist, chest, hips
         FROM body_metrics_history
         WHERE ${whereClause}
         ORDER BY measured_at ASC`,
          values,
        );

        // Get first and last records for comparison
        const firstRecord = historyResult.rows[0];
        const lastRecord = historyResult.rows[historyResult.rows.length - 1];

        // Get current metrics
        const currentMetricsResult = await client.query(
          `SELECT weight, bmi, waist, chest, hips, biceps, thighs, calves, shoulders
         FROM body_metrics WHERE user_id = $1`,
          [clientId],
        );
        const currentMetrics = currentMetricsResult.rows[0];

        return {
          history: historyResult.rows,
          firstRecord,
          lastRecord,
          currentMetrics,
          totalRecords: historyResult.rows.length,
        };
      },
    );

    // Calculate metrics changes
    const startWeight = metricsData.firstRecord?.weight
      ? Number(metricsData.firstRecord.weight)
      : null;
    const currentWeight = metricsData.currentMetrics?.weight
      ? Number(metricsData.currentMetrics.weight)
      : null;
    const weightChange =
      startWeight && currentWeight ? currentWeight - startWeight : null;
    const weightChangePercent =
      startWeight && weightChange ? (weightChange / startWeight) * 100 : null;

    const startBMI = metricsData.firstRecord?.bmi
      ? Number(metricsData.firstRecord.bmi)
      : null;
    const currentBMI = metricsData.currentMetrics?.bmi
      ? Number(metricsData.currentMetrics.bmi)
      : null;

    // Calculate measurement changes
    const measurementFields = [
      'waist',
      'chest',
      'hips',
      'biceps',
      'thighs',
      'calves',
      'shoulders',
    ];
    const measurements = measurementFields.map((field) => {
      const start = metricsData.firstRecord?.[field]
        ? Number(metricsData.firstRecord[field])
        : null;
      const current = metricsData.currentMetrics?.[field]
        ? Number(metricsData.currentMetrics[field])
        : null;
      return {
        name: field.charAt(0).toUpperCase() + field.slice(1),
        start,
        current,
        change: start && current ? current - start : null,
      };
    });

    return {
      clientId,
      clientName,
      clientEmail,
      period: {
        start: startDate.toISOString().split('T')[0],
        end: endDate.toISOString().split('T')[0],
      },
      metrics: {
        startWeight,
        currentWeight,
        weightChange,
        weightChangePercent: weightChangePercent
          ? Math.round(weightChangePercent * 100) / 100
          : null,
        startBMI,
        currentBMI,
        measurements,
      },
      history: metricsData.history.map((h: Record<string, any>) => ({
        id: h.id,
        measuredAt: new Date(h.measured_at).toISOString(),
        weight: h.weight ? Number(h.weight) : null,
        bmi: h.bmi ? Number(h.bmi) : null,
        bodyFat: h.body_fat ? Number(h.body_fat) : null,
        muscleMass: h.muscle_mass ? Number(h.muscle_mass) : null,
        waist: h.waist ? Number(h.waist) : null,
        chest: h.chest ? Number(h.chest) : null,
        hips: h.hips ? Number(h.hips) : null,
      })),
      totalRecords: metricsData.totalRecords,
    };
  }

  /**
   * Get attendance report for a specific client
   */
  async getClientAttendanceReport(
    trainerId: number,
    clientId: number,
    gymId: number,
    filters?: ClientReportFilterDto,
    branchId?: number | null,
  ): Promise<ClientAttendanceReportDto> {
    // Verify trainer has access to this client
    const { clientName, clientEmail } = await this.verifyTrainerClientAccess(
      trainerId,
      clientId,
      gymId,
    );

    const now = new Date();
    const defaultStartDate = new Date(now.getFullYear(), now.getMonth() - 3, 1); // 3 months ago
    const startDate = filters?.startDate
      ? new Date(filters.startDate)
      : defaultStartDate;
    const endDate = filters?.endDate ? new Date(filters.endDate) : now;

    const attendanceData = await this.tenantService.executeInTenant(
      gymId,
      async (client) => {
        let whereClause =
          'user_id = $1 AND check_in_time >= $2 AND check_in_time <= $3';
        const values: SqlValue[] = [clientId, startDate, endDate];
        let paramIndex = 4;

        if (branchId !== null && branchId !== undefined) {
          whereClause += ` AND branch_id = $${paramIndex++}`;
          values.push(branchId);
        }

        // Get all attendance records
        const attendanceResult = await client.query(
          `SELECT id, check_in_time, check_out_time,
                EXTRACT(EPOCH FROM (check_out_time - check_in_time))/60 as duration_minutes
         FROM attendance
         WHERE ${whereClause}
         ORDER BY check_in_time DESC`,
          values,
        );

        // Get weekly pattern (day of week distribution)
        const weeklyPatternResult = await client.query(
          `SELECT
           TRIM(TO_CHAR(check_in_time, 'Day')) as day_name,
           EXTRACT(DOW FROM check_in_time) as day_num,
           COUNT(*) as visits
         FROM attendance
         WHERE ${whereClause}
         GROUP BY day_name, day_num
         ORDER BY day_num`,
          values,
        );

        // Get monthly trend
        const monthlyTrendResult = await client.query(
          `SELECT
           TO_CHAR(check_in_time, 'Mon YYYY') as month,
           EXTRACT(YEAR FROM check_in_time) as year,
           EXTRACT(MONTH FROM check_in_time) as month_num,
           COUNT(*) as visits
         FROM attendance
         WHERE ${whereClause}
         GROUP BY month, year, month_num
         ORDER BY year, month_num`,
          values,
        );

        // Get unique days count
        const uniqueDaysResult = await client.query(
          `SELECT COUNT(DISTINCT DATE(check_in_time)) as unique_days
         FROM attendance
         WHERE ${whereClause}`,
          values,
        );

        return {
          records: attendanceResult.rows,
          weeklyPattern: weeklyPatternResult.rows,
          monthlyTrend: monthlyTrendResult.rows,
          uniqueDays: parseInt(
            uniqueDaysResult.rows[0]?.unique_days || '0',
            10,
          ),
          totalVisits: attendanceResult.rows.length,
        };
      },
    );

    // Calculate streaks
    const { longestStreak, currentStreak } = this.calculateStreaks(
      attendanceData.records.map((r: Record<string, any>) => new Date(r.check_in_time)),
    );

    // Calculate avg visits per week
    const weeksDiff = Math.max(
      1,
      Math.ceil(
        (endDate.getTime() - startDate.getTime()) / (7 * 24 * 60 * 60 * 1000),
      ),
    );
    const avgVisitsPerWeek =
      Math.round((attendanceData.totalVisits / weeksDiff) * 100) / 100;

    // Calculate missed days this month
    const currentMonthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const daysInMonth = new Date(
      now.getFullYear(),
      now.getMonth() + 1,
      0,
    ).getDate();
    const daysPassed = now.getDate();
    const visitsThisMonth = attendanceData.records.filter(
      (r: Record<string, any>) => new Date(r.check_in_time) >= currentMonthStart,
    ).length;
    const missedDaysThisMonth = Math.max(0, daysPassed - visitsThisMonth);

    // Fill in all days of week for pattern
    const dayNames = [
      'Sunday',
      'Monday',
      'Tuesday',
      'Wednesday',
      'Thursday',
      'Friday',
      'Saturday',
    ];
    const weeklyPattern = dayNames.map((day, index) => {
      const found = attendanceData.weeklyPattern.find(
        (p: Record<string, any>) => parseInt(p.day_num, 10) === index,
      );
      return {
        day,
        visits: found ? parseInt(found.visits, 10) : 0,
      };
    });

    return {
      clientId,
      clientName,
      clientEmail,
      period: {
        start: startDate.toISOString().split('T')[0],
        end: endDate.toISOString().split('T')[0],
      },
      summary: {
        totalVisits: attendanceData.totalVisits,
        uniqueDays: attendanceData.uniqueDays,
        avgVisitsPerWeek,
        longestStreak,
        currentStreak,
        missedDaysThisMonth,
      },
      weeklyPattern,
      monthlyTrend: attendanceData.monthlyTrend.map((m: Record<string, any>) => ({
        month: m.month,
        visits: parseInt(m.visits, 10),
      })),
      recentVisits: attendanceData.records.slice(0, 20).map((r: Record<string, any>) => ({
        id: r.id,
        checkInTime: new Date(r.check_in_time).toISOString(),
        checkOutTime: r.check_out_time
          ? new Date(r.check_out_time).toISOString()
          : null,
        duration: r.duration_minutes
          ? Math.round(Number(r.duration_minutes))
          : null,
      })),
    };
  }

  /**
   * Get summary of all trainer's clients
   */
  async getTrainerClientsSummary(
    trainerId: number,
    gymId: number,
    branchId?: number | null,
  ): Promise<TrainerClientsSummaryDto> {
    const summary = await this.tenantService.executeInTenant(
      gymId,
      async (client) => {
        // Get all assigned clients
        const clientsResult = await client.query(
          `SELECT tc.client_id, c.name as client_name
         FROM trainer_client_xref tc
         JOIN users c ON c.id = tc.client_id
         WHERE tc.trainer_id = $1 AND tc.is_active = true`,
          [trainerId],
        );

        const clients = clientsResult.rows;
        const totalClients = clients.length;

        if (totalClients === 0) {
          return {
            totalClients: 0,
            activeThisWeek: 0,
            avgAttendanceRate: 0,
            clientsWithProgress: 0,
            topPerformers: [],
          };
        }

        const clientIds = clients.map((c: Record<string, any>) => c.client_id);

        // Get clients active this week
        const weekAgo = new Date();
        weekAgo.setDate(weekAgo.getDate() - 7);

        let activeQuery = `
        SELECT COUNT(DISTINCT user_id) as active_count
        FROM attendance
        WHERE user_id = ANY($1) AND check_in_time >= $2
      `;
        const activeValues: SqlValue[] = [clientIds, weekAgo];

        if (branchId !== null && branchId !== undefined) {
          activeQuery += ` AND branch_id = $3`;
          activeValues.push(branchId);
        }

        const activeResult = await client.query(activeQuery, activeValues);
        const activeThisWeek = parseInt(
          activeResult.rows[0]?.active_count || '0',
          10,
        );

        // Get average attendance rate (visits in last 30 days / clients)
        const monthAgo = new Date();
        monthAgo.setDate(monthAgo.getDate() - 30);

        let avgQuery = `
        SELECT COUNT(*) as total_visits
        FROM attendance
        WHERE user_id = ANY($1) AND check_in_time >= $2
      `;
        const avgValues: SqlValue[] = [clientIds, monthAgo];

        if (branchId !== null && branchId !== undefined) {
          avgQuery += ` AND branch_id = $3`;
          avgValues.push(branchId);
        }

        const avgResult = await client.query(avgQuery, avgValues);
        const totalVisits = parseInt(
          avgResult.rows[0]?.total_visits || '0',
          10,
        );
        const avgAttendanceRate =
          totalClients > 0
            ? Math.round((totalVisits / (totalClients * 30)) * 100)
            : 0;

        // Get clients with progress (have more than 1 body metrics history record)
        const progressResult = await client.query(
          `SELECT COUNT(DISTINCT user_id) as progress_count
         FROM body_metrics_history
         WHERE user_id = ANY($1)
         GROUP BY user_id
         HAVING COUNT(*) > 1`,
          [clientIds],
        );
        const clientsWithProgress = progressResult.rows.length;

        // Get top performers (best weight loss, most attendance)
        const topPerformers: Array<{
          clientId: number;
          clientName: string;
          metric: string;
          value: string;
        }> = [];

        // Top by attendance this month
        let topAttendanceQuery = `
        SELECT a.user_id, c.name, COUNT(*) as visits
        FROM attendance a
        JOIN users c ON c.id = a.user_id
        WHERE a.user_id = ANY($1) AND a.check_in_time >= $2
      `;
        const topAttValues: SqlValue[] = [clientIds, monthAgo];

        if (branchId !== null && branchId !== undefined) {
          topAttendanceQuery += ` AND a.branch_id = $3`;
          topAttValues.push(branchId);
        }

        topAttendanceQuery += ` GROUP BY a.user_id, c.name ORDER BY visits DESC LIMIT 1`;

        const topAttendanceResult = await client.query(
          topAttendanceQuery,
          topAttValues,
        );
        if (topAttendanceResult.rows[0]) {
          topPerformers.push({
            clientId: topAttendanceResult.rows[0].user_id,
            clientName: topAttendanceResult.rows[0].name,
            metric: 'Most Active',
            value: `${topAttendanceResult.rows[0].visits} visits`,
          });
        }

        // Top by weight loss (comparing first and latest record)
        const weightLossQuery = `
        WITH first_last AS (
          SELECT
            h.user_id,
            c.name,
            FIRST_VALUE(h.weight) OVER (PARTITION BY h.user_id ORDER BY h.measured_at ASC) as first_weight,
            FIRST_VALUE(h.weight) OVER (PARTITION BY h.user_id ORDER BY h.measured_at DESC) as last_weight
          FROM body_metrics_history h
          JOIN users c ON c.id = h.user_id
          WHERE h.user_id = ANY($1) AND h.weight IS NOT NULL
        )
        SELECT DISTINCT user_id, name, first_weight, last_weight,
               (first_weight - last_weight) as weight_lost
        FROM first_last
        WHERE first_weight > last_weight
        ORDER BY weight_lost DESC
        LIMIT 1
      `;
        const weightLossResult = await client.query(weightLossQuery, [
          clientIds,
        ]);
        if (
          weightLossResult.rows[0] &&
          weightLossResult.rows[0].weight_lost > 0
        ) {
          topPerformers.push({
            clientId: weightLossResult.rows[0].user_id,
            clientName: weightLossResult.rows[0].name,
            metric: 'Weight Loss',
            value: `-${Number(weightLossResult.rows[0].weight_lost).toFixed(1)} kg`,
          });
        }

        return {
          totalClients,
          activeThisWeek,
          avgAttendanceRate,
          clientsWithProgress,
          topPerformers,
        };
      },
    );

    return summary;
  }

  /**
   * Calculate attendance streaks
   */
  private calculateStreaks(dates: Date[]): {
    longestStreak: number;
    currentStreak: number;
  } {
    if (dates.length === 0) {
      return { longestStreak: 0, currentStreak: 0 };
    }

    // Sort dates in ascending order and get unique dates
    const uniqueDates = [
      ...new Set(dates.map((d) => d.toISOString().split('T')[0])),
    ].sort();

    let longestStreak = 1;
    let currentStreak = 1;
    let tempStreak = 1;

    for (let i = 1; i < uniqueDates.length; i++) {
      const prevDate = new Date(uniqueDates[i - 1]);
      const currDate = new Date(uniqueDates[i]);
      const diffDays = Math.round(
        (currDate.getTime() - prevDate.getTime()) / (24 * 60 * 60 * 1000),
      );

      if (diffDays === 1) {
        tempStreak++;
        longestStreak = Math.max(longestStreak, tempStreak);
      } else {
        tempStreak = 1;
      }
    }

    // Check if current streak is active (last visit was yesterday or today)
    const today = new Date().toISOString().split('T')[0];
    const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000)
      .toISOString()
      .split('T')[0];
    const lastVisit = uniqueDates[uniqueDates.length - 1];

    if (lastVisit === today || lastVisit === yesterday) {
      // Count backwards from the last visit
      currentStreak = 1;
      for (let i = uniqueDates.length - 2; i >= 0; i--) {
        const prevDate = new Date(uniqueDates[i]);
        const currDate = new Date(uniqueDates[i + 1]);
        const diffDays = Math.round(
          (currDate.getTime() - prevDate.getTime()) / (24 * 60 * 60 * 1000),
        );
        if (diffDays === 1) {
          currentStreak++;
        } else {
          break;
        }
      }
    } else {
      currentStreak = 0;
    }

    return { longestStreak, currentStreak };
  }

  // ============================================
  // PDF REPORT DATA GATHERING
  // ============================================

  async getFullReportData(
    gymId: number,
    filters: PdfReportFilterDto,
    branchId: number | null = null,
  ): Promise<FullReportData> {
    const currentDate = new Date();
    const year = filters.year || currentDate.getFullYear();
    const month = filters.month;

    const reportFilters: ReportFilterDto = { year, month };

    // Calculate date range for attendance (default: last 30 days)
    const endDate = filters.endDate || currentDate.toISOString().split('T')[0];
    const startDate =
      filters.startDate ||
      new Date(currentDate.getTime() - 30 * 24 * 60 * 60 * 1000)
        .toISOString()
        .split('T')[0];

    const [
      incomeExpense,
      membershipSales,
      paymentDues,
      attendanceReport,
      dashboardSummary,
      trainerStaffReport,
      gymInfo,
      branchName,
    ] = await Promise.all([
      this.getIncomeExpenseReport(gymId, reportFilters, branchId),
      this.getMembershipSalesReport(gymId, reportFilters, branchId),
      this.getPaymentDuesReport(gymId, branchId),
      this.attendanceService.getReports(gymId, branchId, startDate, endDate),
      this.getDashboardSummary(gymId, branchId, year, month),
      this.getTrainerStaffReport(gymId, year, branchId),
      this.getGymInfo(gymId),
      this.getBranchName(gymId, branchId),
    ]);

    return {
      gymInfo,
      branchName,
      period: { year, month },
      dashboardSummary,
      incomeExpense,
      membershipSales,
      paymentDues,
      attendanceReport,
      trainerStaffReport,
      generatedAt: new Date().toISOString(),
    };
  }

  private async getDashboardSummary(
    gymId: number,
    branchId: number | null,
    year: number,
    month?: number,
  ): Promise<DashboardSummary> {
    return this.tenantService.executeInTenant(gymId, async (client) => {
      const branchFilter = branchId !== null;
      const branchParam = branchFilter ? [branchId] : [];

      // Active members
      const activeMembersResult = await client.query(
        `SELECT COUNT(*) as count FROM users WHERE role = 'client' AND status = 'active'${branchFilter ? ' AND branch_id = $1' : ''}`,
        branchParam,
      );

      // New members this month
      const firstOfMonth = new Date(year, (month || new Date().getMonth() + 1) - 1, 1)
        .toISOString()
        .split('T')[0];
      const newMembersValues: SqlValue[] = [firstOfMonth];
      if (branchFilter) newMembersValues.push(branchId);
      const newMembersResult = await client.query(
        `SELECT COUNT(*) as count FROM users WHERE role = 'client' AND created_at >= $1${branchFilter ? ' AND branch_id = $2' : ''}`,
        newMembersValues,
      );

      // Expired memberships
      const expiredResult = await client.query(
        `SELECT COUNT(*) as count FROM memberships WHERE status = 'expired'${branchFilter ? ' AND branch_id = $1' : ''}`,
        branchParam,
      );

      // Monthly revenue
      let revenueWhere = `payment_status = 'paid' AND EXTRACT(YEAR FROM paid_at) = $1`;
      const revenueValues: SqlValue[] = [year];
      let paramIdx = 2;
      if (month) {
        revenueWhere += ` AND EXTRACT(MONTH FROM paid_at) = $${paramIdx++}`;
        revenueValues.push(month);
      }
      if (branchFilter) {
        revenueWhere += ` AND branch_id = $${paramIdx++}`;
        revenueValues.push(branchId);
      }
      const revenueResult = await client.query(
        `SELECT COALESCE(SUM(final_amount), 0) as total FROM memberships WHERE ${revenueWhere}`,
        revenueValues,
      );

      // Pending dues
      const pendingResult = await client.query(
        `SELECT COALESCE(SUM(final_amount), 0) as total FROM memberships WHERE payment_status = 'pending'${branchFilter ? ' AND branch_id = $1' : ''}`,
        branchParam,
      );

      // Attendance today
      const today = new Date().toISOString().split('T')[0];
      const attendanceValues: SqlValue[] = [today];
      if (branchFilter) attendanceValues.push(branchId);
      const attendanceResult = await client.query(
        `SELECT COUNT(*) as count FROM attendance WHERE date = $1${branchFilter ? ' AND branch_id = $2' : ''}`,
        attendanceValues,
      );

      return {
        activeMembers: parseInt(activeMembersResult.rows[0].count, 10),
        newMembersThisMonth: parseInt(newMembersResult.rows[0].count, 10),
        expiredMemberships: parseInt(expiredResult.rows[0].count, 10),
        monthlyRevenue: parseFloat(revenueResult.rows[0].total),
        pendingDues: parseFloat(pendingResult.rows[0].total),
        attendanceToday: parseInt(attendanceResult.rows[0].count, 10),
      };
    });
  }

  private async getTrainerStaffReport(
    gymId: number,
    year: number,
    branchId: number | null,
  ): Promise<TrainerStaffReportItem[]> {
    return this.tenantService.executeInTenant(gymId, async (client) => {
      let whereClause = `u.role IN ('trainer', 'manager')`;
      const values: SqlValue[] = [year];
      let paramIndex = 2;

      if (branchId !== null) {
        whereClause += ` AND u.branch_id = $${paramIndex++}`;
        values.push(branchId);
      }

      const result = await client.query(
        `SELECT
          u.id, u.name, u.email, u.role,
          (SELECT COUNT(*) FROM trainer_client_xref tc WHERE tc.trainer_id = u.id AND tc.is_active = true) as client_count,
          (SELECT COALESCE(SUM(s.net_amount), 0) FROM staff_salaries s WHERE s.staff_id = u.id AND s.payment_status = 'paid' AND s.year = $1) as total_salary_paid
        FROM users u
        WHERE ${whereClause}
        ORDER BY u.role, u.name`,
        values,
      );

      return result.rows.map((r: Record<string, any>) => ({
        id: r.id,
        name: r.name,
        email: r.email,
        role: r.role === ROLES.TRAINER ? 'Trainer' : 'Manager',
        clientCount: parseInt(r.client_count, 10),
        totalSalaryPaid: parseFloat(r.total_salary_paid),
      }));
    });
  }

  private async getGymInfo(gymId: number): Promise<GymInfo> {
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
      id: gym?.id || gymId,
      name: gym?.name || 'Gym',
      logo: gym?.logo || null,
      phone: gym?.phone || null,
      email: gym?.email || null,
      address: gym?.address || null,
      city: gym?.city || null,
      state: gym?.state || null,
    };
  }

  private async getBranchName(
    gymId: number,
    branchId: number | null,
  ): Promise<string | null> {
    if (branchId === null) return null;

    const branch = await this.prisma.branch.findFirst({
      where: { id: branchId, gymId },
      select: { name: true },
    });

    return branch?.name || null;
  }

  private getMonthName(month: number): string {
    const months = [
      'January',
      'February',
      'March',
      'April',
      'May',
      'June',
      'July',
      'August',
      'September',
      'October',
      'November',
      'December',
    ];
    return months[month - 1] || '';
  }
}
