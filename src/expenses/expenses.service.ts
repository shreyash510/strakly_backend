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
}
