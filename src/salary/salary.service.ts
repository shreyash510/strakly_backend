import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  ConflictException,
  Logger,
} from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PrismaService } from '../database/prisma.service';
import { TenantService } from '../tenant/tenant.service';
import { PaymentsService } from '../payments/payments.service';
import {
  CreateSalaryDto,
  UpdateSalaryDto,
  PaySalaryDto,
} from './dto/salary.dto';
import {
  PaginationParams,
  PaginatedResponse,
  getPaginationParams,
  createPaginationMeta,
} from '../common/pagination.util';

export interface SalaryFilters extends PaginationParams {
  staffId?: number;
  month?: number;
  year?: number;
  paymentStatus?: string;
  branchId?: number | null;
}

@Injectable()
export class SalaryService {
  private readonly logger = new Logger(SalaryService.name);

  constructor(
    private prisma: PrismaService,
    private tenantService: TenantService,
    private paymentsService: PaymentsService,
  ) {}

  private formatSalary(s: any, staff?: any, paidBy?: any) {
    return {
      id: s.id,
      branchId: s.branch_id,
      staffId: s.staff_id,
      month: s.month,
      year: s.year,
      baseSalary: Number(s.base_salary),
      bonus: Number(s.bonus || 0),
      deductions: Number(s.deductions || 0),
      netAmount: Number(s.net_amount),
      isRecurring: s.is_recurring || false,
      paymentStatus: s.payment_status,
      paymentMethod: s.payment_method,
      paymentRef: s.payment_ref,
      paidAt: s.paid_at,
      paidById: s.paid_by_id,
      notes: s.notes,
      createdAt: s.created_at,
      updatedAt: s.updated_at,
      staff: staff || null,
      paidBy: paidBy || null,
    };
  }

  async create(
    createSalaryDto: CreateSalaryDto,
    gymId: number,
    paidById: number,
  ) {
    // Verify staff belongs to the gym (tenant schema)
    const staff = await this.tenantService.executeInTenant(
      gymId,
      async (client) => {
        const result = await client.query(
          `SELECT id, name, role FROM users
         WHERE id = $1 AND role IN ('branch_admin', 'manager', 'trainer')`,
          [createSalaryDto.staffId],
        );
        return result.rows[0];
      },
    );

    if (!staff) {
      throw new NotFoundException('Staff member not found in your gym');
    }

    // Check if salary record already exists for this month/year
    const existingSalary = await this.tenantService.executeInTenant(
      gymId,
      async (client) => {
        const result = await client.query(
          `SELECT id FROM staff_salaries WHERE staff_id = $1 AND month = $2 AND year = $3`,
          [
            createSalaryDto.staffId,
            createSalaryDto.month,
            createSalaryDto.year,
          ],
        );
        return result.rows[0];
      },
    );

    if (existingSalary) {
      throw new ConflictException(
        `Salary record already exists for ${staff.name} for ${createSalaryDto.month}/${createSalaryDto.year}`,
      );
    }

    const bonus = createSalaryDto.bonus || 0;
    const deductions = createSalaryDto.deductions || 0;
    const netAmount = createSalaryDto.baseSalary + bonus - deductions;
    const isRecurring = createSalaryDto.isRecurring || false;

    const salary = await this.tenantService.executeInTenant(
      gymId,
      async (client) => {
        const result = await client.query(
          `INSERT INTO staff_salaries (staff_id, month, year, base_salary, bonus, deductions, net_amount, is_recurring, payment_status, notes, created_at, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'pending', $9, NOW(), NOW())
         RETURNING *`,
          [
            createSalaryDto.staffId,
            createSalaryDto.month,
            createSalaryDto.year,
            createSalaryDto.baseSalary,
            bonus,
            deductions,
            netAmount,
            isRecurring,
            createSalaryDto.notes || null,
          ],
        );
        return result.rows[0];
      },
    );

    return this.findOne(salary.id, gymId);
  }

  async findAll(
    filters: SalaryFilters,
    gymId: number,
  ): Promise<PaginatedResponse<any>> {
    const { page, limit, skip, take } = getPaginationParams(filters);

    const { salaries, total, userMap } =
      await this.tenantService.executeInTenant(gymId, async (client) => {
        let whereClause = `1=1`;
        const values: any[] = [];
        let paramIndex = 1;

        // Branch filtering for non-admin users (filter by staff's branch)
        if (filters.branchId !== undefined && filters.branchId !== null) {
          whereClause += ` AND u.branch_id = $${paramIndex++}`;
          values.push(filters.branchId);
        }

        if (filters.staffId) {
          whereClause += ` AND s.staff_id = $${paramIndex++}`;
          values.push(filters.staffId);
        }
        if (filters.month) {
          whereClause += ` AND s.month = $${paramIndex++}`;
          values.push(filters.month);
        }
        if (filters.year) {
          whereClause += ` AND s.year = $${paramIndex++}`;
          values.push(filters.year);
        }
        if (filters.paymentStatus && filters.paymentStatus !== 'all') {
          whereClause += ` AND s.payment_status = $${paramIndex++}`;
          values.push(filters.paymentStatus);
        }
        if (filters.search) {
          whereClause += ` AND u.name ILIKE $${paramIndex++}`;
          values.push(`%${filters.search}%`);
        }

        const [salariesResult, countResult] = await Promise.all([
          client.query(
            `SELECT s.*, u.name as staff_name, u.email as staff_email, u.avatar as staff_avatar, u.role as staff_role
           FROM staff_salaries s
           JOIN users u ON u.id = s.staff_id
           WHERE ${whereClause}
           ORDER BY s.year DESC, s.month DESC, s.created_at DESC
           LIMIT $${paramIndex++} OFFSET $${paramIndex}`,
            [...values, take, skip],
          ),
          client.query(
            `SELECT COUNT(*) as count FROM staff_salaries s
           JOIN users u ON u.id = s.staff_id
           WHERE ${whereClause}`,
            values,
          ),
        ]);

        // Build user map for paidBy lookups (from public.users - admins)
        const paidByIds = salariesResult.rows
          .filter((s: any) => s.paid_by_id)
          .map((s: any) => s.paid_by_id);
        let paidByMap = new Map();
        if (paidByIds.length > 0) {
          const paidByUsers = await this.prisma.user.findMany({
            where: { id: { in: paidByIds } },
            select: { id: true, name: true, email: true },
          });
          paidByMap = new Map(paidByUsers.map((u: any) => [u.id, u]));
        }

        return {
          salaries: salariesResult.rows,
          total: parseInt(countResult.rows[0].count, 10),
          userMap: paidByMap,
        };
      });

    const data = salaries.map((s: any) =>
      this.formatSalary(
        s,
        {
          id: s.staff_id,
          name: s.staff_name,
          email: s.staff_email,
          avatar: s.staff_avatar,
          role: s.staff_role,
        },
        userMap.get(s.paid_by_id),
      ),
    );

    return {
      data,
      pagination: createPaginationMeta(total, page, limit, false),
    };
  }

  async findByStaffId(staffId: number, gymId: number, year?: number) {
    const currentYear = year || new Date().getFullYear();

    const salaries = await this.tenantService.executeInTenant(
      gymId,
      async (client) => {
        const result = await client.query(
          `SELECT s.*, u.name as staff_name, u.email as staff_email, u.avatar as staff_avatar, u.role as staff_role
         FROM staff_salaries s
         JOIN users u ON u.id = s.staff_id
         WHERE s.staff_id = $1 AND s.year = $2
         ORDER BY s.year DESC, s.month DESC`,
          [staffId, currentYear],
        );
        return result.rows;
      },
    );

    // Get paidBy info for paid salaries
    const paidByIds = salaries
      .filter((s: any) => s.paid_by_id)
      .map((s: any) => s.paid_by_id);
    let paidByMap = new Map();
    if (paidByIds.length > 0) {
      const paidByUsers = await this.prisma.user.findMany({
        where: { id: { in: paidByIds } },
        select: { id: true, name: true, email: true },
      });
      paidByMap = new Map(paidByUsers.map((u: any) => [u.id, u]));
    }

    return salaries.map((s: any) =>
      this.formatSalary(
        s,
        {
          id: s.staff_id,
          name: s.staff_name,
          email: s.staff_email,
          avatar: s.staff_avatar,
          role: s.staff_role,
        },
        paidByMap.get(s.paid_by_id),
      ),
    );
  }

  async findOne(salaryId: number, gymId: number) {
    const salary = await this.tenantService.executeInTenant(
      gymId,
      async (client) => {
        const result = await client.query(
          `SELECT s.*, u.name as staff_name, u.email as staff_email, u.avatar as staff_avatar, u.phone as staff_phone, u.role as staff_role
         FROM staff_salaries s
         JOIN users u ON u.id = s.staff_id
         WHERE s.id = $1`,
          [salaryId],
        );
        return result.rows[0];
      },
    );

    if (!salary) {
      throw new NotFoundException('Salary record not found');
    }

    let paidBy: { id: number; name: string; email: string } | null = null;
    if (salary.paid_by_id) {
      // paidBy is from public.users (admin who paid)
      paidBy = await this.prisma.user.findUnique({
        where: { id: salary.paid_by_id },
        select: { id: true, name: true, email: true },
      });
    }

    return this.formatSalary(
      salary,
      {
        id: salary.staff_id,
        name: salary.staff_name,
        email: salary.staff_email,
        avatar: salary.staff_avatar,
        phone: salary.staff_phone,
        role: salary.staff_role,
      },
      paidBy,
    );
  }

  async update(
    salaryId: number,
    updateSalaryDto: UpdateSalaryDto,
    gymId: number,
  ) {
    const salary = await this.tenantService.executeInTenant(
      gymId,
      async (client) => {
        const result = await client.query(
          `SELECT * FROM staff_salaries WHERE id = $1`,
          [salaryId],
        );
        return result.rows[0];
      },
    );

    if (!salary) {
      throw new NotFoundException('Salary record not found');
    }

    if (salary.payment_status === 'paid') {
      throw new ForbiddenException('Cannot update a paid salary record');
    }

    const baseSalary = updateSalaryDto.baseSalary ?? Number(salary.base_salary);
    const bonus = updateSalaryDto.bonus ?? Number(salary.bonus);
    const deductions = updateSalaryDto.deductions ?? Number(salary.deductions);
    const netAmount = baseSalary + bonus - deductions;
    const isRecurring = updateSalaryDto.isRecurring ?? salary.is_recurring;

    await this.tenantService.executeInTenant(gymId, async (client) => {
      await client.query(
        `UPDATE staff_salaries SET base_salary = $1, bonus = $2, deductions = $3, net_amount = $4, is_recurring = $5, notes = $6, updated_at = NOW() WHERE id = $7`,
        [
          baseSalary,
          bonus,
          deductions,
          netAmount,
          isRecurring,
          updateSalaryDto.notes ?? salary.notes,
          salaryId,
        ],
      );
    });

    return this.findOne(salaryId, gymId);
  }

  async paySalary(
    salaryId: number,
    paySalaryDto: PaySalaryDto,
    gymId: number,
    paidById: number,
  ) {
    const salary = await this.tenantService.executeInTenant(
      gymId,
      async (client) => {
        const result = await client.query(
          `SELECT s.*, u.name as staff_name, u.branch_id as staff_branch_id
           FROM staff_salaries s
           JOIN users u ON u.id = s.staff_id
           WHERE s.id = $1`,
          [salaryId],
        );
        return result.rows[0];
      },
    );

    if (!salary) {
      throw new NotFoundException('Salary record not found');
    }

    if (salary.payment_status === 'paid') {
      throw new ForbiddenException('Salary has already been paid');
    }

    await this.tenantService.executeInTenant(gymId, async (client) => {
      await client.query(
        `UPDATE staff_salaries SET payment_status = 'paid', payment_method = $1, payment_ref = $2, paid_at = NOW(), paid_by_id = $3, updated_at = NOW() WHERE id = $4`,
        [
          paySalaryDto.paymentMethod,
          paySalaryDto.paymentRef || null,
          paidById,
          salaryId,
        ],
      );
    });

    // Create payment record for the salary
    await this.paymentsService.createSalaryPayment(
      salaryId,
      gymId,
      salary.staff_branch_id,
      salary.staff_id,
      salary.staff_name,
      Number(salary.net_amount),
      paySalaryDto.paymentMethod,
      paySalaryDto.paymentRef,
      paidById,
    );

    return this.findOne(salaryId, gymId);
  }

  async remove(salaryId: number, gymId: number) {
    const salary = await this.tenantService.executeInTenant(
      gymId,
      async (client) => {
        const result = await client.query(
          `SELECT * FROM staff_salaries WHERE id = $1`,
          [salaryId],
        );
        return result.rows[0];
      },
    );

    if (!salary) {
      throw new NotFoundException('Salary record not found');
    }

    if (salary.payment_status === 'paid') {
      throw new ForbiddenException('Cannot delete a paid salary record');
    }

    await this.tenantService.executeInTenant(gymId, async (client) => {
      await client.query(`DELETE FROM staff_salaries WHERE id = $1`, [
        salaryId,
      ]);
    });

    return { success: true, message: 'Salary record deleted successfully' };
  }

  async getStats(gymId: number, branchId: number | null = null) {
    const currentDate = new Date();
    const currentMonth = currentDate.getMonth() + 1;
    const currentYear = currentDate.getFullYear();

    const stats = await this.tenantService.executeInTenant(
      gymId,
      async (client) => {
        // Build branch filter for staff
        const branchFilter =
          branchId !== null ? ` AND u.branch_id = ${branchId}` : '';
        const salaryBranchFilter =
          branchId !== null
            ? ` AND s.staff_id IN (SELECT id FROM users WHERE branch_id = ${branchId})`
            : '';

        const [
          pendingResult,
          paidResult,
          currentMonthResult,
          staffCountResult,
        ] = await Promise.all([
          client.query(
            `SELECT COALESCE(SUM(s.net_amount), 0) as sum, COUNT(*) as count FROM staff_salaries s WHERE s.payment_status = 'pending'${salaryBranchFilter}`,
          ),
          client.query(
            `SELECT COALESCE(SUM(s.net_amount), 0) as sum, COUNT(*) as count FROM staff_salaries s WHERE s.payment_status = 'paid' AND s.year = $1${salaryBranchFilter}`,
            [currentYear],
          ),
          client.query(
            `SELECT COALESCE(SUM(s.net_amount), 0) as sum, COUNT(*) as count FROM staff_salaries s WHERE s.month = $1 AND s.year = $2${salaryBranchFilter}`,
            [currentMonth, currentYear],
          ),
          client.query(
            `SELECT COUNT(*) as count FROM users u
           WHERE u.status = 'active' AND u.role IN ('branch_admin', 'manager', 'trainer')${branchFilter}`,
          ),
        ]);

        return {
          pendingAmount: parseFloat(pendingResult.rows[0].sum),
          pendingCount: parseInt(pendingResult.rows[0].count, 10),
          paidThisYear: parseFloat(paidResult.rows[0].sum),
          paidCountThisYear: parseInt(paidResult.rows[0].count, 10),
          currentMonthTotal: parseFloat(currentMonthResult.rows[0].sum),
          currentMonthCount: parseInt(currentMonthResult.rows[0].count, 10),
          totalStaff: parseInt(staffCountResult.rows[0].count, 10),
        };
      },
    );

    return stats;
  }

  async getStaffList(gymId: number, branchId: number | null = null) {
    return this.tenantService.executeInTenant(gymId, async (client) => {
      let query = `SELECT u.id, u.name, u.email, u.avatar, u.phone, u.role, u.branch_id, b.name as branch_name
         FROM users u
         LEFT JOIN branches b ON b.id = u.branch_id
         WHERE u.status = 'active' AND u.role IN ('branch_admin', 'manager', 'trainer')`;
      const values: any[] = [];

      // Branch filtering for non-admin users
      if (branchId !== null) {
        query += ` AND u.branch_id = $1`;
        values.push(branchId);
      }

      query += ` ORDER BY u.name ASC`;

      const result = await client.query(query, values);

      const roleLabels: Record<string, string> = {
        branch_admin: 'Branch Admin',
        manager: 'Manager',
        trainer: 'Trainer',
      };

      return result.rows.map((u: any) => ({
        id: u.id,
        name: u.name,
        email: u.email,
        avatar: u.avatar,
        phone: u.phone,
        branchId: u.branch_id,
        branchName: u.branch_name,
        role: { code: u.role, name: roleLabels[u.role] || u.role },
      }));
    });
  }

  /**
   * Generate recurring salaries for all gyms
   * Runs at midnight on the 1st of each month
   */
  @Cron('0 0 1 * *')
  async generateRecurringSalaries(): Promise<{
    created: number;
    skipped: number;
    errors: number;
  }> {
    this.logger.log('Starting recurring salary generation...');
    const currentDate = new Date();
    const currentMonth = currentDate.getMonth() + 1;
    const currentYear = currentDate.getFullYear();

    // Get the previous month/year to find recurring salaries
    let prevMonth = currentMonth - 1;
    let prevYear = currentYear;
    if (prevMonth === 0) {
      prevMonth = 12;
      prevYear = currentYear - 1;
    }

    // Get all active gyms with tenant schemas
    const gyms = await this.prisma.gym.findMany({
      where: {
        isActive: true,
        tenantSchemaName: { not: null },
      },
      select: { id: true, tenantSchemaName: true },
    });

    let created = 0;
    let skipped = 0;
    let errors = 0;

    for (const gym of gyms) {
      try {
        // Find recurring salaries from previous month in this tenant
        const recurringSalaries = await this.tenantService.executeInTenant(
          gym.id,
          async (client) => {
            const result = await client.query(
              `SELECT * FROM staff_salaries
             WHERE is_recurring = true AND month = $1 AND year = $2`,
              [prevMonth, prevYear],
            );
            return result.rows;
          },
        );

        for (const salary of recurringSalaries) {
          try {
            // Check if salary already exists for current month
            const existing = await this.tenantService.executeInTenant(
              gym.id,
              async (client) => {
                const result = await client.query(
                  `SELECT id FROM staff_salaries WHERE staff_id = $1 AND month = $2 AND year = $3`,
                  [salary.staff_id, currentMonth, currentYear],
                );
                return result.rows[0];
              },
            );

            if (existing) {
              skipped++;
              continue;
            }

            // Check if staff is still active
            const staffActive = await this.tenantService.executeInTenant(
              gym.id,
              async (client) => {
                const result = await client.query(
                  `SELECT id FROM users WHERE id = $1 AND status = 'active' AND role IN ('branch_admin', 'manager', 'trainer')`,
                  [salary.staff_id],
                );
                return result.rows.length > 0;
              },
            );

            if (!staffActive) {
              skipped++;
              continue;
            }

            // Create new salary record for current month
            await this.tenantService.executeInTenant(gym.id, async (client) => {
              await client.query(
                `INSERT INTO staff_salaries (staff_id, month, year, base_salary, bonus, deductions, net_amount, is_recurring, payment_status, notes, created_at, updated_at)
                 VALUES ($1, $2, $3, $4, $5, $6, $7, true, 'pending', 'Auto-generated recurring salary', NOW(), NOW())`,
                [
                  salary.staff_id,
                  currentMonth,
                  currentYear,
                  salary.base_salary,
                  salary.bonus,
                  salary.deductions,
                  salary.net_amount,
                ],
              );
            });

            created++;
          } catch (error) {
            this.logger.error(
              `Error creating recurring salary for staff ${salary.staff_id}:`,
              error,
            );
            errors++;
          }
        }
      } catch (error) {
        this.logger.error(`Error processing gym ${gym.id}:`, error);
        errors++;
      }
    }

    this.logger.log(
      `Recurring salaries completed: ${created} created, ${skipped} skipped, ${errors} errors`,
    );
    return { created, skipped, errors };
  }
}
