import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ConflictException,
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
  ApproveExpenseDto,
  RejectExpenseDto,
  MarkExpensePaidDto,
  CreateExpenseCategoryDto,
} from './dto/expense.dto';

export interface ExpenseFilters extends PaginationParams {
  category?: number;
  categoryCode?: string;
  paymentStatus?: string;
  approvalStatus?: string;
  staffId?: number;
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
  branchId?: number | null;
}

const STAFF_ROLES = ['manager', 'trainer'];

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
      reason: e.reason,
      amount: Number(e.amount),
      currency: e.currency,
      expenseDate: e.expense_date,
      paymentStatus: e.payment_status,
      paymentMethod: e.payment_method,
      paymentRef: e.payment_ref,
      approvalStatus: e.approval_status,
      staffId: e.staff_id,
      staffName: e.staff_name || null,
      staffRole: e.staff_role || null,
      submittedById: e.submitted_by_id,
      submittedAt: e.submitted_at,
      approvedById: e.approved_by_id,
      approvedAt: e.approved_at,
      rejectedById: e.rejected_by_id,
      rejectedAt: e.rejected_at,
      rejectionReason: e.rejection_reason,
      isRecurring: e.is_recurring || false,
      recurringFrequency: e.recurring_frequency,
      notes: e.notes,
      createdAt: e.created_at,
      updatedAt: e.updated_at,
      createdBy: e.created_by,
      category: category || null,
    };
  }

  async listStaff(gymId: number, opts: { search?: string; limit?: number } = {}) {
    const search = opts.search?.trim() || null;
    const limit = Math.min(Math.max(opts.limit ?? 20, 1), 50);

    return this.tenantService.executeInTenant(gymId, async (client) => {
      const conditions: string[] = [
        `u.role = ANY($1::text[])`,
        `u.status = 'active'`,
        `(u.is_deleted = FALSE OR u.is_deleted IS NULL)`,
      ];
      const values: SqlValue[] = [STAFF_ROLES];
      let idx = 2;

      if (search) {
        conditions.push(
          `(u.name ILIKE $${idx} OR u.email ILIKE $${idx} OR u.phone ILIKE $${idx})`,
        );
        values.push(`%${search}%`);
        idx++;
      }

      values.push(limit);

      const result = await client.query(
        `SELECT u.id, u.name, u.email, u.avatar, u.phone, u.role
           FROM users u
          WHERE ${conditions.join(' AND ')}
          ORDER BY u.name ASC
          LIMIT $${idx}`,
        values,
      );

      const roleLabels: Record<string, string> = {
        manager: 'Manager',
        trainer: 'Trainer',
      };

      return result.rows.map((u: Record<string, any>) => ({
        id: u.id,
        name: u.name,
        email: u.email,
        avatar: u.avatar || undefined,
        phone: u.phone || undefined,
        role: { code: u.role, name: roleLabels[u.role] || u.role },
      }));
    });
  }

  private async loadStaff(gymId: number, staffId: number) {
    return this.tenantService.executeInTenant(gymId, async (client) => {
      const result = await client.query(
        `SELECT id, name, role
           FROM users
          WHERE id = $1
            AND role = ANY($2::text[])
            AND status = 'active'
            AND (is_deleted = FALSE OR is_deleted IS NULL)
          LIMIT 1`,
        [staffId, STAFF_ROLES],
      );
      return result.rows as Array<{ id: number; name: string; role: string }>;
    });
  }

  private async writeHistory(
    gymId: number,
    expenseId: number,
    action: string,
    actorId: number,
    notes?: string | null,
    oldValues?: Record<string, any> | null,
    newValues?: Record<string, any> | null,
  ) {
    await this.tenantService.executeInTenant(gymId, async (client) => {
      await client.query(
        `INSERT INTO expense_approval_history
           (expense_id, action, actor_id, notes, old_values, new_values)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [
          expenseId,
          action,
          actorId,
          notes || null,
          oldValues ? JSON.stringify(oldValues) : null,
          newValues ? JSON.stringify(newValues) : null,
        ],
      );
    });
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
        if (filters.approvalStatus && filters.approvalStatus !== 'all') {
          whereClause += ` AND e.approval_status = $${paramIndex++}`;
          values.push(filters.approvalStatus);
        }
        if (filters.staffId) {
          whereClause += ` AND e.staff_id = $${paramIndex++}`;
          values.push(filters.staffId);
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
          whereClause += ` AND (e.title ILIKE $${paramIndex} OR e.description ILIKE $${paramIndex} OR e.reason ILIKE $${paramIndex})`;
          values.push(`%${filters.search}%`);
          paramIndex++;
        }
        if (filters.branchId) {
          whereClause += ` AND (e.branch_id = $${paramIndex++} OR e.branch_id IS NULL)`;
          values.push(filters.branchId);
        }

        const limitParamIdx = paramIndex++;
        const offsetParamIdx = paramIndex;
        const [expensesResult, countResult] = await Promise.all([
          client.query(
            `SELECT e.*, ec.name as category_name, ec.icon as category_icon, ec.color as category_color,
                    pu.name as staff_name, pu.role as staff_role
               FROM expenses e
               LEFT JOIN expense_categories ec ON ec.id = e.category_id
               LEFT JOIN users pu ON pu.id = e.staff_id
              WHERE ${whereClause}
              ORDER BY e.expense_date DESC, e.created_at DESC
              LIMIT $${limitParamIdx} OFFSET $${offsetParamIdx}`,
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
          `SELECT e.*, ec.name as category_name, ec.icon as category_icon, ec.color as category_color,
                  pu.name as staff_name, pu.role as staff_role
             FROM expenses e
             LEFT JOIN expense_categories ec ON ec.id = e.category_id
             LEFT JOIN users pu ON pu.id = e.staff_id
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

  async create(
    dto: CreateExpenseDto,
    gymId: number,
    userId: number,
    branchId?: number | null,
    userRole?: string,
  ) {
    // Validate staff member if provided
    let staffName: string | null = null;
    if (dto.staffId) {
      const staffRows = await this.loadStaff(gymId, dto.staffId);
      if (!staffRows.length) {
        throw new BadRequestException(
          'staffId must reference an active staff member assigned to this gym',
        );
      }
      staffName = staffRows[0].name;
    }

    const gym = await this.prisma.gym.findUnique({
      where: { id: gymId },
      select: { currency: true },
    });
    const currency = dto.currency || gym?.currency || 'USD';

    const title = dto.title || (staffName
      ? `${staffName} — ${dto.reason.slice(0, 60)}`
      : dto.reason.slice(0, 80));

    // Admin submissions auto-approve (admin has approval authority, and
    // the self-approval block would otherwise leave their own entries stuck).
    const autoApprove = userRole === 'admin';

    const expense = await this.tenantService.executeInTenant(
      gymId,
      async (client) => {
        const result = await client.query(
          `INSERT INTO expenses (
             category_id, title, description, reason,
             amount, currency, expense_date,
             staff_id, payment_status, payment_method, payment_ref,
             approval_status, submitted_by_id, submitted_at,
             approved_by_id, approved_at,
             is_recurring, recurring_frequency, notes,
             created_by, branch_id, created_at, updated_at
           ) VALUES (
             $1, $2, $3, $4, $5, $6, $7, $8,
             'pending', NULL, NULL,
             $9, $10, NOW(),
             $11, $12,
             $13, $14, $15, $16, $17, NOW(), NOW()
           )
           RETURNING *`,
          [
            dto.categoryId,
            title,
            dto.description || null,
            dto.reason,
            dto.amount,
            currency,
            dto.expenseDate,
            dto.staffId || null,
            autoApprove ? 'approved' : 'pending_approval',
            userId,
            autoApprove ? userId : null,
            autoApprove ? new Date() : null,
            dto.isRecurring || false,
            dto.recurringFrequency || null,
            dto.notes || null,
            userId,
            branchId ?? null,
          ],
        );
        return result.rows[0];
      },
    );

    await this.writeHistory(gymId, expense.id, 'submitted', userId, null, null, {
      amount: dto.amount,
      staffId: dto.staffId || null,
      reason: dto.reason,
      expenseDate: dto.expenseDate,
    });

    if (autoApprove) {
      await this.writeHistory(
        gymId,
        expense.id,
        'approved',
        userId,
        'Auto-approved on creation by admin',
      );
    }

    return this.findOne(expense.id, gymId);
  }

  async update(id: number, gymId: number, dto: UpdateExpenseDto, userId: number) {
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

    if (existing.approval_status === 'rejected') {
      throw new ConflictException('Rejected expenses cannot be edited — create a new one');
    }

    // If staffId is changing, validate it
    if (dto.staffId && dto.staffId !== existing.staff_id) {
      const staffRows = await this.loadStaff(gymId, dto.staffId);
      if (!staffRows.length) {
        throw new BadRequestException(
          'staffId must reference an active staff member assigned to this gym',
        );
      }
    }

    const setClauses: string[] = [];
    const values: SqlValue[] = [];
    let paramIndex = 1;

    const fieldMap: Record<string, string> = {
      categoryId: 'category_id',
      staffId: 'staff_id',
      title: 'title',
      description: 'description',
      reason: 'reason',
      amount: 'amount',
      expenseDate: 'expense_date',
      isRecurring: 'is_recurring',
      recurringFrequency: 'recurring_frequency',
      notes: 'notes',
    };

    const oldValues: Record<string, any> = {};
    const newValues: Record<string, any> = {};

    for (const [dtoKey, dbCol] of Object.entries(fieldMap)) {
      const val = (dto as Record<string, any>)[dtoKey];
      if (val !== undefined) {
        setClauses.push(`${dbCol} = $${paramIndex++}`);
        values.push(val);
        oldValues[dbCol] = existing[dbCol];
        newValues[dbCol] = val;
      }
    }

    if (setClauses.length === 0) {
      return this.findOne(id, gymId);
    }

    // Edits to an already-approved expense kick it back to pending_approval
    if (existing.approval_status === 'approved') {
      setClauses.push(`approval_status = 'pending_approval'`);
      setClauses.push(`approved_at = NULL`);
      setClauses.push(`approved_by_id = NULL`);
      setClauses.push(`submitted_by_id = $${paramIndex++}`);
      values.push(userId);
      setClauses.push(`submitted_at = NOW()`);
    }

    setClauses.push(`updated_at = NOW()`);

    await this.tenantService.executeInTenant(gymId, async (client) => {
      await client.query(
        `UPDATE expenses SET ${setClauses.join(', ')} WHERE id = $${paramIndex}`,
        [...values, id],
      );
    });

    await this.writeHistory(gymId, id, 'edited', userId, null, oldValues, newValues);

    return this.findOne(id, gymId);
  }

  async approve(id: number, gymId: number, dto: ApproveExpenseDto, userId: number) {
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

    if (!existing) throw new NotFoundException('Expense not found');
    if (existing.approval_status !== 'pending_approval') {
      throw new ConflictException(
        `Cannot approve — expense is already ${existing.approval_status}`,
      );
    }

    await this.tenantService.executeInTenant(gymId, async (client) => {
      await client.query(
        `UPDATE expenses
            SET approval_status = 'approved',
                approved_by_id  = $1,
                approved_at     = NOW(),
                rejected_by_id  = NULL,
                rejected_at     = NULL,
                rejection_reason = NULL,
                updated_at      = NOW()
          WHERE id = $2`,
        [userId, id],
      );
    });

    await this.writeHistory(gymId, id, 'approved', userId, dto.notes || null);
    return this.findOne(id, gymId);
  }

  async reject(id: number, gymId: number, dto: RejectExpenseDto, userId: number) {
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

    if (!existing) throw new NotFoundException('Expense not found');
    if (existing.approval_status !== 'pending_approval') {
      throw new ConflictException(
        `Cannot reject — expense is already ${existing.approval_status}`,
      );
    }

    await this.tenantService.executeInTenant(gymId, async (client) => {
      await client.query(
        `UPDATE expenses
            SET approval_status   = 'rejected',
                rejected_by_id    = $1,
                rejected_at       = NOW(),
                rejection_reason  = $2,
                updated_at        = NOW()
          WHERE id = $3`,
        [userId, dto.rejectionReason, id],
      );
    });

    await this.writeHistory(gymId, id, 'rejected', userId, dto.rejectionReason);
    return this.findOne(id, gymId);
  }

  async markPaid(id: number, gymId: number, dto: MarkExpensePaidDto, userId: number) {
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

    if (!existing) throw new NotFoundException('Expense not found');
    if (existing.approval_status !== 'approved') {
      throw new ConflictException('Expense must be approved before it can be paid');
    }
    if (existing.payment_status === 'paid') {
      throw new ConflictException('Expense is already marked as paid');
    }

    await this.tenantService.executeInTenant(gymId, async (client) => {
      await client.query(
        `UPDATE expenses
            SET payment_status = 'paid',
                payment_method = $1,
                payment_ref    = $2,
                paid_by_id     = $3,
                updated_at     = NOW()
          WHERE id = $4`,
        [dto.paymentMethod, dto.paymentRef || null, userId, id],
      );
    });

    await this.writeHistory(gymId, id, 'paid', userId, dto.notes || null, null, {
      paymentMethod: dto.paymentMethod,
      paymentRef: dto.paymentRef,
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

    await this.writeHistory(gymId, id, 'deleted', userId);

    return { success: true, message: 'Expense deleted successfully' };
  }

  async findPending(gymId: number, branchId?: number | null) {
    return this.findAll(gymId, {
      approvalStatus: 'pending_approval',
      branchId: branchId ?? undefined,
      noPagination: true,
      limit: 500,
    });
  }

  async findByStaff(gymId: number, staffId: number) {
    return this.findAll(gymId, {
      staffId,
      noPagination: true,
      limit: 500,
    });
  }

  async getHistory(id: number, gymId: number) {
    return this.tenantService.executeInTenant(gymId, async (client) => {
      const exists = await client.query(
        `SELECT id FROM expenses WHERE id = $1`,
        [id],
      );
      if (!exists.rows.length) throw new NotFoundException('Expense not found');

      const result = await client.query(
        `SELECT h.*, pu.name as actor_name
           FROM expense_approval_history h
           LEFT JOIN users pu ON pu.id = h.actor_id
          WHERE h.expense_id = $1
          ORDER BY h.created_at ASC`,
        [id],
      );
      return result.rows.map((r: Record<string, any>) => ({
        id: r.id,
        action: r.action,
        actorId: r.actor_id,
        actorName: r.actor_name,
        notes: r.notes,
        oldValues: r.old_values,
        newValues: r.new_values,
        createdAt: r.created_at,
      }));
    });
  }

  async getStats(gymId: number, year?: number, month?: number, branchId?: number | null) {
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
        const branchFilter = branchId ? ` AND (e.branch_id = ${branchId} OR e.branch_id IS NULL)` : '';
        const deletedFilter = `(e.is_deleted = FALSE OR e.is_deleted IS NULL)`;

        const [
          totalResult,
          thisMonthResult,
          lastMonthResult,
          pendingResult,
          paidResult,
          pendingApprovalResult,
          categoryBreakdownResult,
        ] = await Promise.all([
          client.query(
            `SELECT COALESCE(SUM(e.amount), 0) as sum
             FROM expenses e
             WHERE ${deletedFilter}${branchFilter}
               AND EXTRACT(YEAR FROM e.expense_date) = $1`,
            [targetYear],
          ),
          client.query(
            `SELECT COALESCE(SUM(e.amount), 0) as sum
             FROM expenses e
             WHERE ${deletedFilter}${branchFilter}
               AND EXTRACT(YEAR FROM e.expense_date) = $1
               AND EXTRACT(MONTH FROM e.expense_date) = $2`,
            [targetYear, currentMonth],
          ),
          client.query(
            `SELECT COALESCE(SUM(e.amount), 0) as sum
             FROM expenses e
             WHERE ${deletedFilter}${branchFilter}
               AND EXTRACT(YEAR FROM e.expense_date) = $1
               AND EXTRACT(MONTH FROM e.expense_date) = $2`,
            [prevMonthYear, prevMonth],
          ),
          client.query(
            `SELECT COUNT(*) as count
             FROM expenses e
             WHERE ${deletedFilter}${branchFilter}
               AND e.payment_status = 'pending'`,
          ),
          client.query(
            `SELECT COUNT(*) as count
             FROM expenses e
             WHERE ${deletedFilter}${branchFilter}
               AND e.payment_status = 'paid'`,
          ),
          client.query(
            `SELECT COUNT(*) as count
             FROM expenses e
             WHERE ${deletedFilter}${branchFilter}
               AND e.approval_status = 'pending_approval'`,
          ),
          client.query(
            `SELECT ec.id, ec.name, ec.icon, ec.color, COALESCE(SUM(e.amount), 0) as total
             FROM expenses e
             LEFT JOIN expense_categories ec ON ec.id = e.category_id
             WHERE ${deletedFilter}${branchFilter}
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
          pendingApprovalCount: parseInt(pendingApprovalResult.rows[0].count, 10),
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
        `SELECT id, name, code, icon, color, sort_order, is_system, is_active, created_at, updated_at
         FROM expense_categories
         WHERE is_active = TRUE
         ORDER BY sort_order ASC, name ASC`,
      );

      return result.rows.map((c: Record<string, any>) => ({
        id: c.id,
        name: c.name,
        code: c.code,
        icon: c.icon,
        color: c.color,
        sortOrder: c.sort_order,
        isSystem: c.is_system,
        isActive: c.is_active,
        createdAt: c.created_at,
        updatedAt: c.updated_at,
      }));
    });
  }

  async createCategory(dto: CreateExpenseCategoryDto, gymId: number) {
    return this.tenantService.executeInTenant(gymId, async (client) => {
      const result = await client.query(
        `INSERT INTO expense_categories (name, code, icon, color, sort_order, created_at, updated_at)
         VALUES ($1, $2, $3, $4, $5, NOW(), NOW())
         RETURNING *`,
        [dto.name, dto.code, dto.icon || null, dto.color || null, dto.sortOrder || 0],
      );

      const c = result.rows[0];
      return {
        id: c.id,
        name: c.name,
        code: c.code,
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
      reason: `${staffName} salary — ${this.getMonthName(s.month)} ${s.year}`,
      amount: Number(s.net_amount),
      currency: s.currency || 'USD',
      expenseDate: expenseDate.toISOString().split('T')[0],
      paymentStatus: s.payment_status || 'pending',
      paymentMethod: s.payment_method || null,
      paymentRef: s.payment_ref || null,
      approvalStatus: 'approved',
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
          if (filters.approvalStatus && filters.approvalStatus !== 'all') {
            whereClause += ` AND e.approval_status = $${paramIndex++}`;
            values.push(filters.approvalStatus);
          }
          if (filters.staffId) {
            whereClause += ` AND e.staff_id = $${paramIndex++}`;
            values.push(filters.staffId);
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
            whereClause += ` AND (e.title ILIKE $${paramIndex} OR e.description ILIKE $${paramIndex} OR e.reason ILIKE $${paramIndex})`;
            values.push(`%${filters.search}%`);
            paramIndex++;
          }
          if (filters.branchId) {
            whereClause += ` AND (e.branch_id = $${paramIndex++} OR e.branch_id IS NULL)`;
            values.push(filters.branchId);
          }

          const expensesResult = await client.query(
            `SELECT e.*, ec.name as category_name, ec.code as category_code,
                    ec.icon as category_icon, ec.color as category_color,
                    pu.name as staff_name, pu.role as staff_role
               FROM expenses e
               LEFT JOIN expense_categories ec ON ec.id = e.category_id
               LEFT JOIN users pu ON pu.id = e.staff_id
              WHERE ${whereClause}
              ORDER BY e.expense_date DESC, e.created_at DESC`,
            values,
          );
          expenseRows = expensesResult.rows;
        }

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
            salaryWhere += ` AND (u.name ILIKE $${salaryIdx})`;
            salaryValues.push(`%${filters.search}%`);
            salaryIdx++;
          }

          const salariesResult = await client.query(
            `SELECT ss.*, u.name as staff_name
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

    const mappedSalaries = result.salaryRows.map((s: Record<string, any>) =>
      this.mapSalaryToExpense(s),
    );

    const merged = [...mappedExpenses, ...mappedSalaries].sort((a, b) => {
      const dateA = new Date(a.expenseDate).getTime();
      const dateB = new Date(b.expenseDate).getTime();
      return dateB - dateA;
    });

    const total = merged.length;
    const startIndex = (page - 1) * limit;
    const paginated = merged.slice(startIndex, startIndex + limit);

    return {
      data: paginated,
      pagination: createPaginationMeta(total, page, limit, false),
    };
  }

  async getUnifiedStats(gymId: number, year?: number, month?: number, branchId?: number | null) {
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
        const branchFilter = branchId ? ` AND (e.branch_id = ${branchId} OR e.branch_id IS NULL)` : '';
        const deletedFilter = `(e.is_deleted = FALSE OR e.is_deleted IS NULL)`;
        const salaryDeletedFilter = `(ss.is_deleted = FALSE OR ss.is_deleted IS NULL)`;

        const [
          totalResult,
          thisMonthResult,
          lastMonthResult,
          pendingResult,
          paidResult,
          pendingApprovalResult,
          categoryBreakdownResult,
          salaryTotalResult,
          salaryThisMonthResult,
          salaryLastMonthResult,
        ] = await Promise.all([
          client.query(
            `SELECT COALESCE(SUM(e.amount), 0) as sum
             FROM expenses e
             WHERE ${deletedFilter}${branchFilter}
               AND EXTRACT(YEAR FROM e.expense_date) = $1`,
            [targetYear],
          ),
          client.query(
            `SELECT COALESCE(SUM(e.amount), 0) as sum
             FROM expenses e
             WHERE ${deletedFilter}${branchFilter}
               AND EXTRACT(YEAR FROM e.expense_date) = $1
               AND EXTRACT(MONTH FROM e.expense_date) = $2`,
            [targetYear, currentMonth],
          ),
          client.query(
            `SELECT COALESCE(SUM(e.amount), 0) as sum
             FROM expenses e
             WHERE ${deletedFilter}${branchFilter}
               AND EXTRACT(YEAR FROM e.expense_date) = $1
               AND EXTRACT(MONTH FROM e.expense_date) = $2`,
            [prevMonthYear, prevMonth],
          ),
          client.query(
            `SELECT COUNT(*) as count
             FROM expenses e
             WHERE ${deletedFilter}${branchFilter}
               AND e.payment_status = 'pending'`,
          ),
          client.query(
            `SELECT COUNT(*) as count
             FROM expenses e
             WHERE ${deletedFilter}${branchFilter}
               AND e.payment_status = 'paid'`,
          ),
          client.query(
            `SELECT COUNT(*) as count
             FROM expenses e
             WHERE ${deletedFilter}${branchFilter}
               AND e.approval_status = 'pending_approval'`,
          ),
          client.query(
            `SELECT ec.id, ec.name, ec.icon, ec.color, COALESCE(SUM(e.amount), 0) as total
             FROM expenses e
             LEFT JOIN expense_categories ec ON ec.id = e.category_id
             WHERE ${deletedFilter}${branchFilter}
               AND EXTRACT(YEAR FROM e.expense_date) = $1
             GROUP BY ec.id, ec.name, ec.icon, ec.color
             ORDER BY total DESC
             LIMIT 10`,
            [targetYear],
          ),
          client.query(
            `SELECT COALESCE(SUM(ss.net_amount), 0) as sum
             FROM staff_salaries ss
             WHERE ${salaryDeletedFilter}
               AND ss.year = $1`,
            [targetYear],
          ),
          client.query(
            `SELECT COALESCE(SUM(ss.net_amount), 0) as sum
             FROM staff_salaries ss
             WHERE ${salaryDeletedFilter}
               AND ss.year = $1 AND ss.month = $2`,
            [targetYear, currentMonth],
          ),
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

        const categoryBreakdown = categoryBreakdownResult.rows.map(
          (r: Record<string, any>) => ({
            id: r.id,
            name: r.name,
            icon: r.icon,
            color: r.color,
            total: parseFloat(r.total),
          }),
        );

        if (salaryTotal > 0) {
          categoryBreakdown.push({
            id: null,
            name: 'Employee Salary',
            icon: 'WalletIcon',
            color: '#F97316',
            total: salaryTotal,
          });
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
          pendingApprovalCount: parseInt(pendingApprovalResult.rows[0].count, 10),
          categoryBreakdown,
        };
      },
    );

    return stats;
  }
}
