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
import { CreateSalaryDto, UpdateSalaryDto, PaySalaryDto } from './dto/salary.dto';
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
}

@Injectable()
export class SalaryService {
  private readonly logger = new Logger(SalaryService.name);

  constructor(
    private prisma: PrismaService,
    private tenantService: TenantService,
  ) {}

  private formatSalary(s: any, staff?: any, paidBy?: any) {
    return {
      id: s.id,
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

  async create(createSalaryDto: CreateSalaryDto, gymId: number, paidById: number) {
    // Verify staff belongs to the gym (tenant schema)
    const staff = await this.tenantService.executeInTenant(gymId, async (client) => {
      const result = await client.query(
        `SELECT id, name, role FROM users
         WHERE id = $1 AND role IN ('trainer', 'manager')`,
        [createSalaryDto.staffId]
      );
      return result.rows[0];
    });

    if (!staff) {
      throw new NotFoundException('Staff member not found in your gym');
    }

    // Check if salary record already exists for this month/year (public schema with gym_id filter)
    const existingSalary = await this.tenantService.executeInTenant(gymId, async (client) => {
      const result = await client.query(
        `SELECT id FROM public.staff_salaries WHERE staff_id = $1 AND gym_id = $2 AND month = $3 AND year = $4`,
        [createSalaryDto.staffId, gymId, createSalaryDto.month, createSalaryDto.year]
      );
      return result.rows[0];
    });

    if (existingSalary) {
      throw new ConflictException(
        `Salary record already exists for ${staff.name} for ${createSalaryDto.month}/${createSalaryDto.year}`,
      );
    }

    const bonus = createSalaryDto.bonus || 0;
    const deductions = createSalaryDto.deductions || 0;
    const netAmount = createSalaryDto.baseSalary + bonus - deductions;
    const isRecurring = createSalaryDto.isRecurring || false;

    const salary = await this.tenantService.executeInTenant(gymId, async (client) => {
      const result = await client.query(
        `INSERT INTO public.staff_salaries (staff_id, gym_id, month, year, base_salary, bonus, deductions, net_amount, is_recurring, payment_status, notes, created_at, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 'pending', $10, NOW(), NOW())
         RETURNING *`,
        [createSalaryDto.staffId, gymId, createSalaryDto.month, createSalaryDto.year, createSalaryDto.baseSalary, bonus, deductions, netAmount, isRecurring, createSalaryDto.notes || null]
      );
      return result.rows[0];
    });

    return this.findOne(salary.id, gymId);
  }

  async findAll(filters: SalaryFilters, gymId: number): Promise<PaginatedResponse<any>> {
    const { page, limit, skip, take } = getPaginationParams(filters);

    const { salaries, total, userMap } = await this.tenantService.executeInTenant(gymId, async (client) => {
      let whereClause = `s.gym_id = $1`;
      const values: any[] = [gymId];
      let paramIndex = 2;

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
           FROM public.staff_salaries s
           JOIN users u ON u.id = s.staff_id
           WHERE ${whereClause}
           ORDER BY s.year DESC, s.month DESC, s.created_at DESC
           LIMIT $${paramIndex++} OFFSET $${paramIndex}`,
          [...values, take, skip]
        ),
        client.query(
          `SELECT COUNT(*) as count FROM public.staff_salaries s
           JOIN users u ON u.id = s.staff_id
           WHERE ${whereClause}`,
          values
        ),
      ]);

      // Build user map for paidBy lookups (from public.users - admins)
      const paidByIds = salariesResult.rows.filter((s: any) => s.paid_by_id).map((s: any) => s.paid_by_id);
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

    const data = salaries.map((s: any) => this.formatSalary(s, {
      id: s.staff_id,
      name: s.staff_name,
      email: s.staff_email,
      avatar: s.staff_avatar,
      role: s.staff_role,
    }, userMap.get(s.paid_by_id)));

    return {
      data,
      pagination: createPaginationMeta(total, page, limit, false),
    };
  }

  async findByStaffId(staffId: number, gymId: number, year?: number) {
    const currentYear = year || new Date().getFullYear();

    const salaries = await this.tenantService.executeInTenant(gymId, async (client) => {
      const result = await client.query(
        `SELECT s.*, u.name as staff_name, u.email as staff_email, u.avatar as staff_avatar, u.role as staff_role
         FROM public.staff_salaries s
         JOIN users u ON u.id = s.staff_id
         WHERE s.staff_id = $1 AND s.gym_id = $2 AND s.year = $3
         ORDER BY s.year DESC, s.month DESC`,
        [staffId, gymId, currentYear]
      );
      return result.rows;
    });

    // Get paidBy info for paid salaries
    const paidByIds = salaries.filter((s: any) => s.paid_by_id).map((s: any) => s.paid_by_id);
    let paidByMap = new Map();
    if (paidByIds.length > 0) {
      const paidByUsers = await this.prisma.user.findMany({
        where: { id: { in: paidByIds } },
        select: { id: true, name: true, email: true },
      });
      paidByMap = new Map(paidByUsers.map((u: any) => [u.id, u]));
    }

    return salaries.map((s: any) => this.formatSalary(s, {
      id: s.staff_id,
      name: s.staff_name,
      email: s.staff_email,
      avatar: s.staff_avatar,
      role: s.staff_role,
    }, paidByMap.get(s.paid_by_id)));
  }

  async findOne(salaryId: number, gymId: number) {
    const salary = await this.tenantService.executeInTenant(gymId, async (client) => {
      const result = await client.query(
        `SELECT s.*, u.name as staff_name, u.email as staff_email, u.avatar as staff_avatar, u.phone as staff_phone, u.role as staff_role
         FROM public.staff_salaries s
         JOIN users u ON u.id = s.staff_id
         WHERE s.id = $1 AND s.gym_id = $2`,
        [salaryId, gymId]
      );
      return result.rows[0];
    });

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

    return this.formatSalary(salary, {
      id: salary.staff_id,
      name: salary.staff_name,
      email: salary.staff_email,
      avatar: salary.staff_avatar,
      phone: salary.staff_phone,
      role: salary.staff_role,
    }, paidBy);
  }

  async update(salaryId: number, updateSalaryDto: UpdateSalaryDto, gymId: number) {
    const salary = await this.tenantService.executeInTenant(gymId, async (client) => {
      const result = await client.query(
        `SELECT * FROM public.staff_salaries WHERE id = $1 AND gym_id = $2`,
        [salaryId, gymId]
      );
      return result.rows[0];
    });

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
        `UPDATE public.staff_salaries SET base_salary = $1, bonus = $2, deductions = $3, net_amount = $4, is_recurring = $5, notes = $6, updated_at = NOW() WHERE id = $7 AND gym_id = $8`,
        [baseSalary, bonus, deductions, netAmount, isRecurring, updateSalaryDto.notes ?? salary.notes, salaryId, gymId]
      );
    });

    return this.findOne(salaryId, gymId);
  }

  async paySalary(salaryId: number, paySalaryDto: PaySalaryDto, gymId: number, paidById: number) {
    const salary = await this.tenantService.executeInTenant(gymId, async (client) => {
      const result = await client.query(
        `SELECT * FROM public.staff_salaries WHERE id = $1 AND gym_id = $2`,
        [salaryId, gymId]
      );
      return result.rows[0];
    });

    if (!salary) {
      throw new NotFoundException('Salary record not found');
    }

    if (salary.payment_status === 'paid') {
      throw new ForbiddenException('Salary has already been paid');
    }

    await this.tenantService.executeInTenant(gymId, async (client) => {
      await client.query(
        `UPDATE public.staff_salaries SET payment_status = 'paid', payment_method = $1, payment_ref = $2, paid_at = NOW(), paid_by_id = $3, updated_at = NOW() WHERE id = $4 AND gym_id = $5`,
        [paySalaryDto.paymentMethod, paySalaryDto.paymentRef || null, paidById, salaryId, gymId]
      );
    });

    return this.findOne(salaryId, gymId);
  }

  async remove(salaryId: number, gymId: number) {
    const salary = await this.tenantService.executeInTenant(gymId, async (client) => {
      const result = await client.query(
        `SELECT * FROM public.staff_salaries WHERE id = $1 AND gym_id = $2`,
        [salaryId, gymId]
      );
      return result.rows[0];
    });

    if (!salary) {
      throw new NotFoundException('Salary record not found');
    }

    if (salary.payment_status === 'paid') {
      throw new ForbiddenException('Cannot delete a paid salary record');
    }

    await this.tenantService.executeInTenant(gymId, async (client) => {
      await client.query(
        `DELETE FROM public.staff_salaries WHERE id = $1 AND gym_id = $2`,
        [salaryId, gymId]
      );
    });

    return { success: true, message: 'Salary record deleted successfully' };
  }

  async getStats(gymId: number) {
    const currentDate = new Date();
    const currentMonth = currentDate.getMonth() + 1;
    const currentYear = currentDate.getFullYear();

    const stats = await this.tenantService.executeInTenant(gymId, async (client) => {
      const [pendingResult, paidResult, currentMonthResult, staffCountResult] = await Promise.all([
        client.query(
          `SELECT COALESCE(SUM(net_amount), 0) as sum, COUNT(*) as count FROM public.staff_salaries WHERE gym_id = $1 AND payment_status = 'pending'`,
          [gymId]
        ),
        client.query(
          `SELECT COALESCE(SUM(net_amount), 0) as sum, COUNT(*) as count FROM public.staff_salaries WHERE gym_id = $1 AND payment_status = 'paid' AND year = $2`,
          [gymId, currentYear]
        ),
        client.query(
          `SELECT COALESCE(SUM(net_amount), 0) as sum, COUNT(*) as count FROM public.staff_salaries WHERE gym_id = $1 AND month = $2 AND year = $3`,
          [gymId, currentMonth, currentYear]
        ),
        client.query(
          `SELECT COUNT(*) as count FROM users
           WHERE status = 'active' AND role IN ('trainer', 'manager')`
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
    });

    return stats;
  }

  async getStaffList(gymId: number) {
    return this.tenantService.executeInTenant(gymId, async (client) => {
      const result = await client.query(
        `SELECT id, name, email, avatar, phone, role
         FROM users
         WHERE status = 'active' AND role IN ('trainer', 'manager')
         ORDER BY name ASC`
      );

      return result.rows.map((u: any) => ({
        id: u.id,
        name: u.name,
        email: u.email,
        avatar: u.avatar,
        phone: u.phone,
        role: { code: u.role, name: u.role === 'trainer' ? 'Trainer' : 'Manager' },
      }));
    });
  }

  /**
   * Generate recurring salaries for all gyms
   * Runs at midnight on the 1st of each month
   */
  @Cron('0 0 1 * *')
  async generateRecurringSalaries(): Promise<{ created: number; skipped: number; errors: number }> {
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

    // Find all recurring salaries from the previous month
    const recurringSalaries = await this.prisma.$queryRaw<any[]>`
      SELECT s.*, g.tenant_schema_name
      FROM staff_salaries s
      JOIN gyms g ON g.id = s.gym_id
      WHERE s.is_recurring = true
        AND s.month = ${prevMonth}
        AND s.year = ${prevYear}
    `;

    let created = 0;
    let skipped = 0;
    let errors = 0;

    for (const salary of recurringSalaries) {
      try {
        // Check if salary already exists for current month
        const existing = await this.prisma.staffSalary.findFirst({
          where: {
            staffId: salary.staff_id,
            gymId: salary.gym_id,
            month: currentMonth,
            year: currentYear,
          },
        });

        if (existing) {
          skipped++;
          continue;
        }

        // Check if staff is still active in the gym
        const staffActive = await this.tenantService.executeInTenant(salary.gym_id, async (client) => {
          const result = await client.query(
            `SELECT id FROM users WHERE id = $1 AND status = 'active' AND role IN ('trainer', 'manager')`,
            [salary.staff_id]
          );
          return result.rows.length > 0;
        });

        if (!staffActive) {
          skipped++;
          continue;
        }

        // Create new salary record for current month
        await this.prisma.staffSalary.create({
          data: {
            staffId: salary.staff_id,
            gymId: salary.gym_id,
            month: currentMonth,
            year: currentYear,
            baseSalary: salary.base_salary,
            bonus: salary.bonus,
            deductions: salary.deductions,
            netAmount: salary.net_amount,
            isRecurring: true,
            paymentStatus: 'pending',
            notes: `Auto-generated recurring salary`,
          },
        });

        created++;
      } catch (error) {
        this.logger.error(`Error creating recurring salary for staff ${salary.staff_id}:`, error);
        errors++;
      }
    }

    this.logger.log(`Recurring salaries completed: ${created} created, ${skipped} skipped, ${errors} errors`);
    return { created, skipped, errors };
  }
}
