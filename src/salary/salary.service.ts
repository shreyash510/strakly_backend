import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  ConflictException,
} from '@nestjs/common';
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

    const salary = await this.tenantService.executeInTenant(gymId, async (client) => {
      const result = await client.query(
        `INSERT INTO public.staff_salaries (staff_id, gym_id, month, year, base_salary, bonus, deductions, net_amount, payment_status, notes, created_at, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'pending', $9, NOW(), NOW())
         RETURNING *`,
        [createSalaryDto.staffId, gymId, createSalaryDto.month, createSalaryDto.year, createSalaryDto.baseSalary, bonus, deductions, netAmount, createSalaryDto.notes || null]
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

    await this.tenantService.executeInTenant(gymId, async (client) => {
      await client.query(
        `UPDATE public.staff_salaries SET base_salary = $1, bonus = $2, deductions = $3, net_amount = $4, notes = $5, updated_at = NOW() WHERE id = $6 AND gym_id = $7`,
        [baseSalary, bonus, deductions, netAmount, updateSalaryDto.notes || salary.notes, salaryId, gymId]
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
}
