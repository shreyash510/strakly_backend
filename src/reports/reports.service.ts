import { Injectable } from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';
import { TenantService } from '../tenant/tenant.service';
import {
  ReportFilterDto,
  IncomeExpenseReportDto,
  MembershipSalesReportDto,
  PaymentDuesReportDto,
} from './dto/reports.dto';

@Injectable()
export class ReportsService {
  constructor(
    private prisma: PrismaService,
    private tenantService: TenantService,
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
        const values: any[] = [];
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
        let whereClause = `payment_status = 'paid'`;
        const values: any[] = [];
        let paramIndex = 1;

        if (month) {
          whereClause += ` AND month = $${paramIndex++}`;
          values.push(month);
        }
        whereClause += ` AND year = $${paramIndex++}`;
        values.push(year);

        const result = await client.query(
          `SELECT
            COALESCE(SUM(net_amount), 0) as total,
            COUNT(*) as count
          FROM staff_salaries
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
        const result = await client.query(
          `SELECT
            TO_CHAR(paid_at, 'Mon') as month,
            EXTRACT(MONTH FROM paid_at) as month_num,
            COALESCE(SUM(final_amount), 0) as amount
          FROM memberships
          WHERE payment_status = 'paid'
            AND EXTRACT(YEAR FROM paid_at) = $1
          GROUP BY TO_CHAR(paid_at, 'Mon'), EXTRACT(MONTH FROM paid_at)
          ORDER BY month_num`,
          [year],
        );
        return result.rows.map((r: any) => ({
          month: r.month,
          amount: parseFloat(r.amount),
        }));
      },
    );

    // Get expense by month (from tenant schema)
    const expenseByMonth = await this.tenantService.executeInTenant(
      gymId,
      async (client) => {
        const result = await client.query(
          `SELECT
            CASE month
              WHEN 1 THEN 'Jan' WHEN 2 THEN 'Feb' WHEN 3 THEN 'Mar'
              WHEN 4 THEN 'Apr' WHEN 5 THEN 'May' WHEN 6 THEN 'Jun'
              WHEN 7 THEN 'Jul' WHEN 8 THEN 'Aug' WHEN 9 THEN 'Sep'
              WHEN 10 THEN 'Oct' WHEN 11 THEN 'Nov' WHEN 12 THEN 'Dec'
            END as month,
            month as month_num,
            COALESCE(SUM(net_amount), 0) as amount
          FROM staff_salaries
          WHERE payment_status = 'paid'
            AND year = $1
          GROUP BY month
          ORDER BY month_num`,
          [year],
        );
        return result.rows;
      },
    );

    // Get income by payment method
    const incomeByPaymentMethod = await this.tenantService.executeInTenant(
      gymId,
      async (client) => {
        const result = await client.query(
          `SELECT
            COALESCE(payment_method, 'unknown') as method,
            COALESCE(SUM(final_amount), 0) as amount,
            COUNT(*) as count
          FROM memberships
          WHERE payment_status = 'paid'
            AND EXTRACT(YEAR FROM paid_at) = $1
          GROUP BY payment_method
          ORDER BY amount DESC`,
          [year],
        );
        return result.rows.map((r: any) => ({
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
        expenseByMonth: expenseByMonth.map((r: any) => ({
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
        const values: any[] = [];
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
        const values: any[] = [];
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
          (sum: number, r: any) => sum + parseFloat(r.revenue),
          0,
        );

        return result.rows.map((r: any) => ({
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
        const result = await client.query(
          `SELECT
            TO_CHAR(paid_at, 'Mon') as month,
            EXTRACT(MONTH FROM paid_at) as month_num,
            COUNT(*) as count,
            COALESCE(SUM(final_amount), 0) as revenue
          FROM memberships
          WHERE payment_status = 'paid'
            AND EXTRACT(YEAR FROM paid_at) = $1
          GROUP BY TO_CHAR(paid_at, 'Mon'), EXTRACT(MONTH FROM paid_at)
          ORDER BY month_num`,
          [year],
        );
        return result.rows.map((r: any) => ({
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

  async getPaymentDuesReport(gymId: number, branchId: number | null = null): Promise<PaymentDuesReportDto> {
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
        const values: any[] = [];

        // Branch filtering
        if (branchId !== null) {
          query += ` AND m.branch_id = $1`;
          values.push(branchId);
        }

        query += ` ORDER BY m.created_at ASC`;

        const result = await client.query(query, values);

        const today = new Date();
        return result.rows.map((r: any) => {
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
          WHERE s.gym_id = $1 AND s.payment_status = 'pending'
          ORDER BY s.year DESC, s.month DESC`,
          [gymId],
        );

        return result.rows.map((r: any) => ({
          id: r.id,
          staffName: r.staff_name,
          staffEmail: r.staff_email,
          staffRole: r.staff_role === 'trainer' ? 'Trainer' : 'Manager',
          period: `${this.getMonthName(r.month)} ${r.year}`,
          amount: parseFloat(r.amount),
        }));
      },
    );

    const membershipDuesTotal = membershipDues.reduce(
      (sum: number, d: any) => sum + d.amount,
      0,
    );
    const salaryDuesTotal = salaryDuesResult.reduce(
      (sum: number, d: any) => sum + d.amount,
      0,
    );
    const overdueCount = membershipDues.filter(
      (d: any) => d.daysOverdue > 0,
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
