import {
  Injectable,
  NotFoundException,
  Logger,
} from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';
import { TenantService } from '../tenant/tenant.service';
import {
  PaginationParams,
  PaginatedResponse,
  getPaginationParams,
  createPaginationMeta,
} from '../common/pagination.util';
import { SqlValue } from '../common/types';
import {
  CreateExpenseDto,
  UpdateExpenseDto,
  CreateExpenseCategoryDto,
} from './dto/expense.dto';

export interface ExpenseFilters extends PaginationParams {
  category?: number;
  categoryCode?: string;
  paymentStatus?: string;
  dateFrom?: string;
  dateTo?: string;
  startDate?: string;
  endDate?: string;
  isRecurring?: boolean;
  search?: string;
  month?: number;
  year?: number;
  paymentMethod?: string;
  noPagination?: boolean;
}

@Injectable()
export class ExpensesService {
  private readonly logger = new Logger(ExpensesService.name);

  constructor(
    private prisma: PrismaService,
    private tenantService: TenantService,
  ) {}

  private formatExpense(
    e: Record<string, any>,
    category?: Record<string, any> | null,
  ) {
    return {
      id: e.id,
      categoryId: e.category_id,
      title: e.title,
      description: e.description,
      amount: Number(e.amount),
      currency: e.currency,
      expenseDate: e.expense_date,
      paymentStatus: e.payment_status,
      paymentMethod: e.payment_method,
      paymentRef: e.payment_ref,
      isRecurring: e.is_recurring || false,
      recurringFrequency: e.recurring_frequency,
      notes: e.notes,
      createdAt: e.created_at,
      updatedAt: e.updated_at,
      createdBy: e.created_by,
      category: category || null,
    };
  }

  async findAll(
    gymId: number,
    filters: ExpenseFilters,
  ): Promise<PaginatedResponse<Record<string, any>>> {
    const { page, limit, skip, take } = getPaginationParams(filters);

    const { expenses, total } = await this.tenantService.executeInTenant(
      gymId,
      async (client) => {
        let whereClause = `(e.is_deleted = FALSE OR e.is_deleted IS NULL)`;
        const values: SqlValue[] = [];
        let paramIndex = 1;

        if (filters.category) {
          whereClause += ` AND e.category_id = $${paramIndex++}`;
          values.push(filters.category);
        }
        if (filters.paymentStatus && filters.paymentStatus !== 'all') {
          whereClause += ` AND e.payment_status = $${paramIndex++}`;
          values.push(filters.paymentStatus);
        }
        if (filters.dateFrom) {
          whereClause += ` AND e.expense_date >= $${paramIndex++}`;
          values.push(filters.dateFrom);
        }
        if (filters.dateTo) {
          whereClause += ` AND e.expense_date <= $${paramIndex++}`;
          values.push(filters.dateTo);
        }
        if (filters.isRecurring !== undefined) {
          whereClause += ` AND e.is_recurring = $${paramIndex++}`;
          values.push(filters.isRecurring);
        }
        if (filters.search) {
          whereClause += ` AND (e.title ILIKE $${paramIndex} OR e.description ILIKE $${paramIndex})`;
          values.push(`%${filters.search}%`);
          paramIndex++;
        }

        const [expensesResult, countResult] = await Promise.all([
          client.query(
            `SELECT e.*, ec.name as category_name, ec.icon as category_icon, ec.color as category_color
             FROM expenses e
             LEFT JOIN expense_categories ec ON ec.id = e.category_id
             WHERE ${whereClause}
             ORDER BY e.expense_date DESC, e.created_at DESC
             LIMIT $${paramIndex++} OFFSET $${paramIndex}`,
            [...values, take, skip],
          ),
          client.query(
            `SELECT COUNT(*) as count FROM expenses e
             WHERE ${whereClause}`,
            values,
          ),
        ]);

        return {
          expenses: expensesResult.rows,
          total: parseInt(countResult.rows[0].count, 10),
        };
      },
    );

    const data = expenses.map((e: Record<string, any>) =>
      this.formatExpense(e, {
        id: e.category_id,
        name: e.category_name,
        icon: e.category_icon,
        color: e.category_color,
      }),
    );

    return {
      data,
      pagination: createPaginationMeta(total, page, limit, false),
    };
  }

  async findOne(id: number, gymId: number) {
    const expense = await this.tenantService.executeInTenant(
      gymId,
      async (client) => {
        const result = await client.query(
          `SELECT e.*, ec.name as category_name, ec.icon as category_icon, ec.color as category_color
           FROM expenses e
           LEFT JOIN expense_categories ec ON ec.id = e.category_id
           WHERE e.id = $1 AND (e.is_deleted = FALSE OR e.is_deleted IS NULL)`,
          [id],
        );
        return result.rows[0];
      },
    );

    if (!expense) {
      throw new NotFoundException('Expense not found');
    }

    return this.formatExpense(expense, {
      id: expense.category_id,
      name: expense.category_name,
      icon: expense.category_icon,
      color: expense.category_color,
    });
  }

  async create(dto: CreateExpenseDto, gymId: number, userId: number) {
    // Get gym currency as default
    const gym = await this.prisma.gym.findUnique({
      where: { id: gymId },
      select: { currency: true },
    });
    const currency = dto.currency || gym?.currency || 'USD';
    const expenseDate = dto.expenseDate || new Date().toISOString().split('T')[0];

    const expense = await this.tenantService.executeInTenant(
      gymId,
      async (client) => {
        const result = await client.query(
          `INSERT INTO expenses (
            category_id, title, description, amount, currency, expense_date,
            payment_status, payment_method, payment_ref,
            is_recurring, recurring_frequency, notes, created_by, created_at, updated_at
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, NOW(), NOW())
          RETURNING *`,
          [
            dto.categoryId || null,
            dto.title,
            dto.description || null,
            dto.amount,
            currency,
            expenseDate,
            dto.paymentStatus || 'pending',
            dto.paymentMethod || null,
            dto.paymentRef || null,
            dto.isRecurring || false,
            dto.recurringFrequency || null,
            dto.notes || null,
            userId,
          ],
        );
        return result.rows[0];
      },
    );

    return this.findOne(expense.id, gymId);
  }

  async update(id: number, gymId: number, dto: UpdateExpenseDto) {
    const existing = await this.tenantService.executeInTenant(
      gymId,
      async (client) => {
        const result = await client.query(
          `SELECT * FROM expenses WHERE id = $1 AND (is_deleted = FALSE OR is_deleted IS NULL)`,
          [id],
        );
        return result.rows[0];
      },
    );

    if (!existing) {
      throw new NotFoundException('Expense not found');
    }

    const setClauses: string[] = [];
    const values: SqlValue[] = [];
    let paramIndex = 1;

    const fieldMap: Record<string, string> = {
      categoryId: 'category_id',
      title: 'title',
      description: 'description',
      amount: 'amount',
      expenseDate: 'expense_date',
      paymentStatus: 'payment_status',
      paymentMethod: 'payment_method',
      paymentRef: 'payment_ref',
      isRecurring: 'is_recurring',
      recurringFrequency: 'recurring_frequency',
      notes: 'notes',
    };

    for (const [dtoKey, dbCol] of Object.entries(fieldMap)) {
      if ((dto as Record<string, any>)[dtoKey] !== undefined) {
        setClauses.push(`${dbCol} = $${paramIndex++}`);
        values.push((dto as Record<string, any>)[dtoKey]);
      }
    }

    if (setClauses.length === 0) {
      return this.findOne(id, gymId);
    }

    setClauses.push(`updated_at = NOW()`);

    await this.tenantService.executeInTenant(gymId, async (client) => {
      await client.query(
        `UPDATE expenses SET ${setClauses.join(', ')} WHERE id = $${paramIndex}`,
        [...values, id],
      );
    });

    return this.findOne(id, gymId);
  }

  async remove(id: number, gymId: number, userId: number) {
    const existing = await this.tenantService.executeInTenant(
      gymId,
      async (client) => {
        const result = await client.query(
          `SELECT * FROM expenses WHERE id = $1 AND (is_deleted = FALSE OR is_deleted IS NULL)`,
          [id],
        );
        return result.rows[0];
      },
    );

    if (!existing) {
      throw new NotFoundException('Expense not found');
    }

    await this.tenantService.executeInTenant(gymId, async (client) => {
      await client.query(
        `UPDATE expenses SET is_deleted = TRUE, deleted_at = NOW(), deleted_by = $2, updated_at = NOW() WHERE id = $1`,
        [id, userId],
      );
    });

    return { success: true, message: 'Expense deleted successfully' };
  }

  async getStats(gymId: number, year?: number, month?: number) {
    const currentDate = new Date();
    const targetYear = year || currentDate.getFullYear();
    const currentMonth = month || currentDate.getMonth() + 1;

    let prevMonth = currentMonth - 1;
    let prevMonthYear = targetYear;
    if (prevMonth === 0) {
      prevMonth = 12;
      prevMonthYear = targetYear - 1;
    }

    const stats = await this.tenantService.executeInTenant(
      gymId,
      async (client) => {
        const deletedFilter = `(e.is_deleted = FALSE OR e.is_deleted IS NULL)`;

        const [
          totalResult,
          thisMonthResult,
          lastMonthResult,
          pendingResult,
          paidResult,
          categoryBreakdownResult,
        ] = await Promise.all([
          // Total expenses for the year
          client.query(
            `SELECT COALESCE(SUM(e.amount), 0) as sum
             FROM expenses e
             WHERE ${deletedFilter}
               AND EXTRACT(YEAR FROM e.expense_date) = $1`,
            [targetYear],
          ),
          // This month total
          client.query(
            `SELECT COALESCE(SUM(e.amount), 0) as sum
             FROM expenses e
             WHERE ${deletedFilter}
               AND EXTRACT(YEAR FROM e.expense_date) = $1
               AND EXTRACT(MONTH FROM e.expense_date) = $2`,
            [targetYear, currentMonth],
          ),
          // Last month total
          client.query(
            `SELECT COALESCE(SUM(e.amount), 0) as sum
             FROM expenses e
             WHERE ${deletedFilter}
               AND EXTRACT(YEAR FROM e.expense_date) = $1
               AND EXTRACT(MONTH FROM e.expense_date) = $2`,
            [prevMonthYear, prevMonth],
          ),
          // Pending count
          client.query(
            `SELECT COUNT(*) as count
             FROM expenses e
             WHERE ${deletedFilter}
               AND e.payment_status = 'pending'`,
          ),
          // Paid count
          client.query(
            `SELECT COUNT(*) as count
             FROM expenses e
             WHERE ${deletedFilter}
               AND e.payment_status = 'paid'`,
          ),
          // Category breakdown (top categories by amount)
          client.query(
            `SELECT ec.id, ec.name, ec.icon, ec.color, COALESCE(SUM(e.amount), 0) as total
             FROM expenses e
             LEFT JOIN expense_categories ec ON ec.id = e.category_id
             WHERE ${deletedFilter}
               AND EXTRACT(YEAR FROM e.expense_date) = $1
             GROUP BY ec.id, ec.name, ec.icon, ec.color
             ORDER BY total DESC
             LIMIT 10`,
            [targetYear],
          ),
        ]);

        return {
          totalExpenses: parseFloat(totalResult.rows[0].sum),
          thisMonth: parseFloat(thisMonthResult.rows[0].sum),
          lastMonth: parseFloat(lastMonthResult.rows[0].sum),
          pendingCount: parseInt(pendingResult.rows[0].count, 10),
          paidCount: parseInt(paidResult.rows[0].count, 10),
          categoryBreakdown: categoryBreakdownResult.rows.map(
            (r: Record<string, any>) => ({
              id: r.id,
              name: r.name,
              icon: r.icon,
              color: r.color,
              total: parseFloat(r.total),
            }),
          ),
        };
      },
    );

    return stats;
  }

  async getCategories(gymId: number) {
    return this.tenantService.executeInTenant(gymId, async (client) => {
      const result = await client.query(
        `SELECT id, name, icon, color, created_at, updated_at
         FROM expense_categories
         WHERE (is_deleted = FALSE OR is_deleted IS NULL)
         ORDER BY name ASC`,
      );

      return result.rows.map((c: Record<string, any>) => ({
        id: c.id,
        name: c.name,
        icon: c.icon,
        color: c.color,
        createdAt: c.created_at,
        updatedAt: c.updated_at,
      }));
    });
  }

  async createCategory(dto: CreateExpenseCategoryDto, gymId: number) {
    return this.tenantService.executeInTenant(gymId, async (client) => {
      const result = await client.query(
        `INSERT INTO expense_categories (name, icon, color, created_at, updated_at)
         VALUES ($1, $2, $3, NOW(), NOW())
         RETURNING *`,
        [dto.name, dto.icon || null, dto.color || null],
      );

      const c = result.rows[0];
      return {
        id: c.id,
        name: c.name,
        icon: c.icon,
        color: c.color,
        createdAt: c.created_at,
        updatedAt: c.updated_at,
      };
    });
  }

  private getMonthName(month: number): string {
    const months = [
      'January', 'February', 'March', 'April', 'May', 'June',
      'July', 'August', 'September', 'October', 'November', 'December',
    ];
    return months[month - 1] || '';
  }

  private mapSalaryToExpense(s: Record<string, any>) {
    // Construct a date from month/year (use last day of the month)
    const expenseDate = new Date(s.year, s.month - 1, 28);
    const staffName = s.staff_name || `Staff #${s.staff_id}`;

    return {
      id: `salary_${s.id}`,
      sourceType: 'salary' as const,
      sourceId: s.id,
      categoryId: null,
      categoryName: 'Employee Salary',
      categoryCode: 'employee_salary',
      title: `${staffName} - ${this.getMonthName(s.month)} ${s.year}`,
      description: `${staffName} - ${this.getMonthName(s.month)} ${s.year}`,
      amount: Number(s.net_amount),
      currency: s.currency || 'USD',
      expenseDate: expenseDate.toISOString().split('T')[0],
      paymentStatus: s.payment_status || 'pending',
      paymentMethod: s.payment_method || null,
      paymentRef: s.payment_ref || null,
      isRecurring: s.is_recurring || false,
      recurringFrequency: null,
      notes: s.notes || null,
      createdAt: s.created_at,
      updatedAt: s.updated_at,
      createdBy: s.paid_by_id,
      category: {
        id: null,
        name: 'Employee Salary',
        icon: 'WalletIcon',
        color: '#F97316',
      },
      // Salary-specific fields
      staffId: s.staff_id,
      staffName,
      baseSalary: Number(s.base_salary),
      bonus: Number(s.bonus || 0),
      deductions: Number(s.deductions || 0),
      month: s.month,
      year: s.year,
    };
  }

  async findAllUnified(
    gymId: number,
    filters: ExpenseFilters,
  ): Promise<PaginatedResponse<Record<string, any>>> {
    const { page, limit } = getPaginationParams(filters);

    const onlySalary = filters.categoryCode === 'employee_salary';
    const excludeSalary = filters.category !== undefined || (filters.categoryCode && filters.categoryCode !== 'employee_salary');

    const result = await this.tenantService.executeInTenant(
      gymId,
      async (client) => {
        // ---------- Fetch expenses (unless only salary is requested) ----------
        let expenseRows: Record<string, any>[] = [];
        if (!onlySalary) {
          let whereClause = `(e.is_deleted = FALSE OR e.is_deleted IS NULL)`;
          const values: SqlValue[] = [];
          let paramIndex = 1;

          if (filters.category) {
            whereClause += ` AND e.category_id = $${paramIndex++}`;
            values.push(filters.category);
          }
          if (filters.paymentStatus && filters.paymentStatus !== 'all') {
            whereClause += ` AND e.payment_status = $${paramIndex++}`;
            values.push(filters.paymentStatus);
          }
          if (filters.dateFrom || filters.startDate) {
            whereClause += ` AND e.expense_date >= $${paramIndex++}`;
            values.push(filters.dateFrom || filters.startDate!);
          }
          if (filters.dateTo || filters.endDate) {
            whereClause += ` AND e.expense_date <= $${paramIndex++}`;
            values.push(filters.dateTo || filters.endDate!);
          }
          if (filters.isRecurring !== undefined) {
            whereClause += ` AND e.is_recurring = $${paramIndex++}`;
            values.push(filters.isRecurring);
          }
          if (filters.search) {
            whereClause += ` AND (e.title ILIKE $${paramIndex} OR e.description ILIKE $${paramIndex})`;
            values.push(`%${filters.search}%`);
            paramIndex++;
          }

          const expensesResult = await client.query(
            `SELECT e.*, ec.name as category_name, ec.code as category_code, ec.icon as category_icon, ec.color as category_color
             FROM expenses e
             LEFT JOIN expense_categories ec ON ec.id = e.category_id
             WHERE ${whereClause}
             ORDER BY e.expense_date DESC, e.created_at DESC`,
            values,
          );
          expenseRows = expensesResult.rows;
        }

        // ---------- Fetch salaries (unless another category is selected) ----------
        let salaryRows: Record<string, any>[] = [];
        if (!excludeSalary) {
          let salaryWhere = `(ss.is_deleted = FALSE OR ss.is_deleted IS NULL)`;
          const salaryValues: SqlValue[] = [];
          let salaryIdx = 1;

          if (filters.dateFrom || filters.startDate) {
            const fromDate = filters.dateFrom || filters.startDate!;
            salaryWhere += ` AND (ss.year > EXTRACT(YEAR FROM $${salaryIdx}::date) OR (ss.year = EXTRACT(YEAR FROM $${salaryIdx}::date) AND ss.month >= EXTRACT(MONTH FROM $${salaryIdx}::date)))`;
            salaryValues.push(fromDate);
            salaryIdx++;
          }
          if (filters.dateTo || filters.endDate) {
            const toDate = filters.dateTo || filters.endDate!;
            salaryWhere += ` AND (ss.year < EXTRACT(YEAR FROM $${salaryIdx}::date) OR (ss.year = EXTRACT(YEAR FROM $${salaryIdx}::date) AND ss.month <= EXTRACT(MONTH FROM $${salaryIdx}::date)))`;
            salaryValues.push(toDate);
            salaryIdx++;
          }
          if (filters.paymentStatus && filters.paymentStatus !== 'all') {
            salaryWhere += ` AND ss.payment_status = $${salaryIdx++}`;
            salaryValues.push(filters.paymentStatus);
          }
          if (filters.search) {
            salaryWhere += ` AND (u.full_name ILIKE $${salaryIdx})`;
            salaryValues.push(`%${filters.search}%`);
            salaryIdx++;
          }

          const salariesResult = await client.query(
            `SELECT ss.*, u.full_name as staff_name
             FROM staff_salaries ss
             LEFT JOIN users u ON u.id = ss.staff_id
             WHERE ${salaryWhere}
             ORDER BY ss.year DESC, ss.month DESC, ss.created_at DESC`,
            salaryValues,
          );
          salaryRows = salariesResult.rows;
        }

        return { expenseRows, salaryRows };
      },
    );

    // Map expenses to unified shape
    const mappedExpenses = result.expenseRows.map((e: Record<string, any>) => ({
      ...this.formatExpense(e, {
        id: e.category_id,
        name: e.category_name,
        icon: e.category_icon,
        color: e.category_color,
      }),
      sourceType: 'expense' as const,
      sourceId: e.id,
      categoryName: e.category_name,
      categoryCode: e.category_code,
    }));

    // Map salaries to unified shape
    const mappedSalaries = result.salaryRows.map((s: Record<string, any>) =>
      this.mapSalaryToExpense(s),
    );

    // Merge and sort by date DESC
    const merged = [...mappedExpenses, ...mappedSalaries].sort((a, b) => {
      const dateA = new Date(a.expenseDate).getTime();
      const dateB = new Date(b.expenseDate).getTime();
      return dateB - dateA;
    });

    // Apply pagination
    const total = merged.length;
    const startIndex = (page - 1) * limit;
    const paginated = merged.slice(startIndex, startIndex + limit);

    return {
      data: paginated,
      pagination: createPaginationMeta(total, page, limit, false),
    };
  }

  async getUnifiedStats(gymId: number, year?: number, month?: number) {
    const currentDate = new Date();
    const targetYear = year || currentDate.getFullYear();
    const currentMonth = month || currentDate.getMonth() + 1;

    let prevMonth = currentMonth - 1;
    let prevMonthYear = targetYear;
    if (prevMonth === 0) {
      prevMonth = 12;
      prevMonthYear = targetYear - 1;
    }

    const stats = await this.tenantService.executeInTenant(
      gymId,
      async (client) => {
        const deletedFilter = `(e.is_deleted = FALSE OR e.is_deleted IS NULL)`;
        const salaryDeletedFilter = `(ss.is_deleted = FALSE OR ss.is_deleted IS NULL)`;

        const [
          totalResult,
          thisMonthResult,
          lastMonthResult,
          pendingResult,
          paidResult,
          categoryBreakdownResult,
          // Salary queries
          salaryTotalResult,
          salaryThisMonthResult,
          salaryLastMonthResult,
        ] = await Promise.all([
          // Total expenses for the year
          client.query(
            `SELECT COALESCE(SUM(e.amount), 0) as sum
             FROM expenses e
             WHERE ${deletedFilter}
               AND EXTRACT(YEAR FROM e.expense_date) = $1`,
            [targetYear],
          ),
          // This month total
          client.query(
            `SELECT COALESCE(SUM(e.amount), 0) as sum
             FROM expenses e
             WHERE ${deletedFilter}
               AND EXTRACT(YEAR FROM e.expense_date) = $1
               AND EXTRACT(MONTH FROM e.expense_date) = $2`,
            [targetYear, currentMonth],
          ),
          // Last month total
          client.query(
            `SELECT COALESCE(SUM(e.amount), 0) as sum
             FROM expenses e
             WHERE ${deletedFilter}
               AND EXTRACT(YEAR FROM e.expense_date) = $1
               AND EXTRACT(MONTH FROM e.expense_date) = $2`,
            [prevMonthYear, prevMonth],
          ),
          // Pending count
          client.query(
            `SELECT COUNT(*) as count
             FROM expenses e
             WHERE ${deletedFilter}
               AND e.payment_status = 'pending'`,
          ),
          // Paid count
          client.query(
            `SELECT COUNT(*) as count
             FROM expenses e
             WHERE ${deletedFilter}
               AND e.payment_status = 'paid'`,
          ),
          // Category breakdown (top categories by amount)
          client.query(
            `SELECT ec.id, ec.name, ec.icon, ec.color, COALESCE(SUM(e.amount), 0) as total
             FROM expenses e
             LEFT JOIN expense_categories ec ON ec.id = e.category_id
             WHERE ${deletedFilter}
               AND EXTRACT(YEAR FROM e.expense_date) = $1
             GROUP BY ec.id, ec.name, ec.icon, ec.color
             ORDER BY total DESC
             LIMIT 10`,
            [targetYear],
          ),
          // Salary total for the year
          client.query(
            `SELECT COALESCE(SUM(ss.net_amount), 0) as sum
             FROM staff_salaries ss
             WHERE ${salaryDeletedFilter}
               AND ss.year = $1`,
            [targetYear],
          ),
          // Salary this month
          client.query(
            `SELECT COALESCE(SUM(ss.net_amount), 0) as sum
             FROM staff_salaries ss
             WHERE ${salaryDeletedFilter}
               AND ss.year = $1 AND ss.month = $2`,
            [targetYear, currentMonth],
          ),
          // Salary last month
          client.query(
            `SELECT COALESCE(SUM(ss.net_amount), 0) as sum
             FROM staff_salaries ss
             WHERE ${salaryDeletedFilter}
               AND ss.year = $1 AND ss.month = $2`,
            [prevMonthYear, prevMonth],
          ),
        ]);

        const salaryTotal = parseFloat(salaryTotalResult.rows[0].sum);
        const salaryThisMonth = parseFloat(salaryThisMonthResult.rows[0].sum);
        const salaryLastMonth = parseFloat(salaryLastMonthResult.rows[0].sum);

        // Build category breakdown including salary
        const categoryBreakdown = categoryBreakdownResult.rows.map(
          (r: Record<string, any>) => ({
            id: r.id,
            name: r.name,
            icon: r.icon,
            color: r.color,
            total: parseFloat(r.total),
          }),
        );

        // Add Employee Salary to category breakdown if there are salaries
        if (salaryTotal > 0) {
          categoryBreakdown.push({
            id: null,
            name: 'Employee Salary',
            icon: 'WalletIcon',
            color: '#F97316',
            total: salaryTotal,
          });
          // Re-sort by total DESC
          categoryBreakdown.sort(
            (a: { total: number }, b: { total: number }) => b.total - a.total,
          );
        }

        return {
          totalExpenses:
            parseFloat(totalResult.rows[0].sum) + salaryTotal,
          thisMonth:
            parseFloat(thisMonthResult.rows[0].sum) + salaryThisMonth,
          lastMonth:
            parseFloat(lastMonthResult.rows[0].sum) + salaryLastMonth,
          pendingCount: parseInt(pendingResult.rows[0].count, 10),
          paidCount: parseInt(paidResult.rows[0].count, 10),
          categoryBreakdown,
        };
      },
    );

    return stats;
  }
}
