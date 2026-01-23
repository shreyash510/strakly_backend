import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  ConflictException,
} from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';
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
  gymId?: number;
}

@Injectable()
export class SalaryService {
  constructor(private prisma: PrismaService) {}

  async create(createSalaryDto: CreateSalaryDto, gymId: number, paidById: number) {
    // Verify staff belongs to the gym
    const staff = await this.prisma.user.findFirst({
      where: {
        id: createSalaryDto.staffId,
        gymId,
        role: {
          code: { in: ['trainer', 'manager'] },
        },
      },
      include: {
        role: { select: { code: true, name: true } },
      },
    });

    if (!staff) {
      throw new NotFoundException('Staff member not found in your gym');
    }

    // Check if salary record already exists for this month/year
    const existingSalary = await this.prisma.staffSalary.findUnique({
      where: {
        staffId_gymId_month_year: {
          staffId: createSalaryDto.staffId,
          gymId,
          month: createSalaryDto.month,
          year: createSalaryDto.year,
        },
      },
    });

    if (existingSalary) {
      throw new ConflictException(
        `Salary record already exists for ${staff.name} for ${createSalaryDto.month}/${createSalaryDto.year}`,
      );
    }

    // Calculate net amount
    const bonus = createSalaryDto.bonus || 0;
    const deductions = createSalaryDto.deductions || 0;
    const netAmount = createSalaryDto.baseSalary + bonus - deductions;

    const salary = await this.prisma.staffSalary.create({
      data: {
        staffId: createSalaryDto.staffId,
        gymId,
        month: createSalaryDto.month,
        year: createSalaryDto.year,
        baseSalary: createSalaryDto.baseSalary,
        bonus,
        deductions,
        netAmount,
        notes: createSalaryDto.notes,
      },
    });

    return this.findOne(salary.id, gymId);
  }

  async findAll(
    filters: SalaryFilters,
    gymId: number,
  ): Promise<PaginatedResponse<any>> {
    const { page, limit, skip, take, noPagination } = getPaginationParams(filters);

    const where: any = { gymId };

    if (filters.staffId) {
      where.staffId = filters.staffId;
    }

    if (filters.month) {
      where.month = filters.month;
    }

    if (filters.year) {
      where.year = filters.year;
    }

    if (filters.paymentStatus && filters.paymentStatus !== 'all') {
      where.paymentStatus = filters.paymentStatus;
    }

    if (filters.search) {
      // Search by staff name
      const staffUsers = await this.prisma.user.findMany({
        where: {
          gymId,
          name: { contains: filters.search, mode: 'insensitive' },
        },
        select: { id: true },
      });
      where.staffId = { in: staffUsers.map((u) => u.id) };
    }

    const total = await this.prisma.staffSalary.count({ where });

    const salaries = await this.prisma.staffSalary.findMany({
      where,
      orderBy: [{ year: 'desc' }, { month: 'desc' }, { createdAt: 'desc' }],
      skip,
      take,
    });

    // Batch fetch staff info
    const staffIds = salaries.map((s) => s.staffId);
    const paidByIds = salaries.filter((s) => s.paidById).map((s) => s.paidById as number);
    const allUserIds = [...new Set([...staffIds, ...paidByIds])];

    const users = await this.prisma.user.findMany({
      where: { id: { in: allUserIds } },
      select: {
        id: true,
        name: true,
        email: true,
        avatar: true,
        role: { select: { code: true, name: true } },
      },
    });

    const userMap = new Map(users.map((u) => [u.id, u]));

    const salariesWithStaffInfo = salaries.map((salary) => ({
      ...salary,
      baseSalary: Number(salary.baseSalary),
      bonus: Number(salary.bonus),
      deductions: Number(salary.deductions),
      netAmount: Number(salary.netAmount),
      staff: userMap.get(salary.staffId) || null,
      paidBy: salary.paidById ? userMap.get(salary.paidById) || null : null,
    }));

    return {
      data: salariesWithStaffInfo,
      pagination: createPaginationMeta(total, page, limit, noPagination),
    };
  }

  async findOne(salaryId: number, gymId: number) {
    const salary = await this.prisma.staffSalary.findUnique({
      where: { id: salaryId },
    });

    if (!salary) {
      throw new NotFoundException('Salary record not found');
    }

    if (salary.gymId !== gymId) {
      throw new ForbiddenException('You can only view salary records from your gym');
    }

    // Fetch staff and paidBy info
    const userIds = [salary.staffId];
    if (salary.paidById) userIds.push(salary.paidById);

    const users = await this.prisma.user.findMany({
      where: { id: { in: userIds } },
      select: {
        id: true,
        name: true,
        email: true,
        avatar: true,
        phone: true,
        role: { select: { code: true, name: true } },
      },
    });

    const userMap = new Map(users.map((u) => [u.id, u]));

    return {
      ...salary,
      baseSalary: Number(salary.baseSalary),
      bonus: Number(salary.bonus),
      deductions: Number(salary.deductions),
      netAmount: Number(salary.netAmount),
      staff: userMap.get(salary.staffId) || null,
      paidBy: salary.paidById ? userMap.get(salary.paidById) || null : null,
    };
  }

  async update(salaryId: number, updateSalaryDto: UpdateSalaryDto, gymId: number) {
    const salary = await this.prisma.staffSalary.findUnique({
      where: { id: salaryId },
    });

    if (!salary) {
      throw new NotFoundException('Salary record not found');
    }

    if (salary.gymId !== gymId) {
      throw new ForbiddenException('You can only update salary records from your gym');
    }

    if (salary.paymentStatus === 'paid') {
      throw new ForbiddenException('Cannot update a paid salary record');
    }

    // Recalculate net amount if any amount fields are updated
    const baseSalary = updateSalaryDto.baseSalary ?? Number(salary.baseSalary);
    const bonus = updateSalaryDto.bonus ?? Number(salary.bonus);
    const deductions = updateSalaryDto.deductions ?? Number(salary.deductions);
    const netAmount = baseSalary + bonus - deductions;

    await this.prisma.staffSalary.update({
      where: { id: salaryId },
      data: {
        ...updateSalaryDto,
        netAmount,
      },
    });

    return this.findOne(salaryId, gymId);
  }

  async paySalary(salaryId: number, paySalaryDto: PaySalaryDto, gymId: number, paidById: number) {
    const salary = await this.prisma.staffSalary.findUnique({
      where: { id: salaryId },
    });

    if (!salary) {
      throw new NotFoundException('Salary record not found');
    }

    if (salary.gymId !== gymId) {
      throw new ForbiddenException('You can only pay salary records from your gym');
    }

    if (salary.paymentStatus === 'paid') {
      throw new ForbiddenException('Salary has already been paid');
    }

    await this.prisma.staffSalary.update({
      where: { id: salaryId },
      data: {
        paymentStatus: 'paid',
        paymentMethod: paySalaryDto.paymentMethod,
        paymentRef: paySalaryDto.paymentRef,
        paidAt: new Date(),
        paidById,
        notes: paySalaryDto.notes || salary.notes,
      },
    });

    return this.findOne(salaryId, gymId);
  }

  async remove(salaryId: number, gymId: number) {
    const salary = await this.prisma.staffSalary.findUnique({
      where: { id: salaryId },
    });

    if (!salary) {
      throw new NotFoundException('Salary record not found');
    }

    if (salary.gymId !== gymId) {
      throw new ForbiddenException('You can only delete salary records from your gym');
    }

    if (salary.paymentStatus === 'paid') {
      throw new ForbiddenException('Cannot delete a paid salary record');
    }

    await this.prisma.staffSalary.delete({
      where: { id: salaryId },
    });

    return { success: true, message: 'Salary record deleted successfully' };
  }

  async getStats(gymId: number) {
    const currentDate = new Date();
    const currentMonth = currentDate.getMonth() + 1;
    const currentYear = currentDate.getFullYear();

    const [totalPending, totalPaid, currentMonthStats, staffCount] = await Promise.all([
      // Total pending amount
      this.prisma.staffSalary.aggregate({
        where: { gymId, paymentStatus: 'pending' },
        _sum: { netAmount: true },
        _count: true,
      }),
      // Total paid this year
      this.prisma.staffSalary.aggregate({
        where: { gymId, paymentStatus: 'paid', year: currentYear },
        _sum: { netAmount: true },
        _count: true,
      }),
      // Current month stats
      this.prisma.staffSalary.aggregate({
        where: { gymId, month: currentMonth, year: currentYear },
        _sum: { netAmount: true },
        _count: true,
      }),
      // Staff count (trainers + managers)
      this.prisma.user.count({
        where: {
          gymId,
          status: 'active',
          role: { code: { in: ['trainer', 'manager'] } },
        },
      }),
    ]);

    return {
      pendingAmount: Number(totalPending._sum.netAmount || 0),
      pendingCount: totalPending._count,
      paidThisYear: Number(totalPaid._sum.netAmount || 0),
      paidCountThisYear: totalPaid._count,
      currentMonthTotal: Number(currentMonthStats._sum.netAmount || 0),
      currentMonthCount: currentMonthStats._count,
      totalStaff: staffCount,
    };
  }

  async getStaffList(gymId: number) {
    // Get all staff (trainers and managers) for the gym
    const staff = await this.prisma.user.findMany({
      where: {
        gymId,
        status: 'active',
        role: { code: { in: ['trainer', 'manager'] } },
      },
      select: {
        id: true,
        name: true,
        email: true,
        avatar: true,
        phone: true,
        role: { select: { code: true, name: true } },
      },
      orderBy: { name: 'asc' },
    });

    return staff;
  }
}
