import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ConflictException,
  ForbiddenException,
} from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';
import { TenantService } from '../tenant/tenant.service';
import {
  CreateBranchDto,
  UpdateBranchDto,
  BranchLimitResponseDto,
  TransferMemberDto,
  TransferMemberResponseDto,
  MembershipTransferAction,
} from './dto/branch.dto';
import {
  PaginationParams,
  PaginatedResponse,
  getPaginationParams,
  createPaginationMeta,
} from '../common/pagination.util';

export interface BranchFilters extends PaginationParams {
  includeInactive?: boolean;
}

@Injectable()
export class BranchService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tenantService: TenantService,
  ) {}

  async findAll(gymId: number, filters: BranchFilters = {}): Promise<PaginatedResponse<any>> {
    const { page, limit, skip, take, noPagination } = getPaginationParams(filters);

    await this.verifyGymExists(gymId);

    const where: any = { gymId };

    if (!filters.includeInactive) {
      where.isActive = true;
    }

    if (filters.search) {
      where.OR = [
        { name: { contains: filters.search, mode: 'insensitive' } },
        { code: { contains: filters.search, mode: 'insensitive' } },
        { city: { contains: filters.search, mode: 'insensitive' } },
      ];
    }

    const total = await this.prisma.branch.count({ where });

    const branches = await this.prisma.branch.findMany({
      where,
      orderBy: [
        { isDefault: 'desc' },
        { name: 'asc' },
      ],
      skip,
      take,
    });

    return {
      data: branches,
      pagination: createPaginationMeta(total, page, limit, noPagination),
    };
  }

  async findOne(gymId: number, branchId: number) {
    const branch = await this.prisma.branch.findFirst({
      where: { id: branchId, gymId },
    });

    if (!branch) {
      throw new NotFoundException(`Branch with ID ${branchId} not found in this gym`);
    }

    return branch;
  }

  async create(gymId: number, dto: CreateBranchDto) {
    await this.verifyGymExists(gymId);

    const limitCheck = await this.validateBranchLimit(gymId);
    if (!limitCheck.canAdd) {
      throw new ForbiddenException(
        `Branch limit reached. Your ${limitCheck.plan || 'current'} plan allows ${limitCheck.max} branch(es). Please upgrade to add more branches.`,
      );
    }

    const existingBranch = await this.prisma.branch.findUnique({
      where: {
        gymId_code: { gymId, code: dto.code.toUpperCase() },
      },
    });

    if (existingBranch) {
      throw new ConflictException(`Branch with code "${dto.code}" already exists for this gym`);
    }

    return this.prisma.branch.create({
      data: {
        gymId,
        name: dto.name,
        code: dto.code.toUpperCase(),
        phone: dto.phone,
        email: dto.email,
        address: dto.address,
        city: dto.city,
        state: dto.state,
        zipCode: dto.zipCode,
        isActive: dto.isActive ?? true,
        isDefault: false,
      },
    });
  }

  async update(gymId: number, branchId: number, dto: UpdateBranchDto) {
    const branch = await this.findOne(gymId, branchId);

    if (dto.code && dto.code.toUpperCase() !== branch.code) {
      const existingBranch = await this.prisma.branch.findUnique({
        where: {
          gymId_code: { gymId, code: dto.code.toUpperCase() },
        },
      });

      if (existingBranch) {
        throw new ConflictException(`Branch with code "${dto.code}" already exists for this gym`);
      }
    }

    return this.prisma.branch.update({
      where: { id: branchId },
      data: {
        name: dto.name,
        code: dto.code ? dto.code.toUpperCase() : undefined,
        phone: dto.phone,
        email: dto.email,
        address: dto.address,
        city: dto.city,
        state: dto.state,
        zipCode: dto.zipCode,
        isActive: dto.isActive,
      },
    });
  }

  async remove(gymId: number, branchId: number) {
    const branch = await this.findOne(gymId, branchId);

    if (branch.isDefault) {
      throw new BadRequestException('Cannot delete the default branch. Set another branch as default first.');
    }

    await this.prisma.branch.update({
      where: { id: branchId },
      data: { isActive: false },
    });

    return { success: true, message: 'Branch deleted successfully' };
  }

  async setDefaultBranch(gymId: number, branchId: number) {
    const branch = await this.findOne(gymId, branchId);

    if (!branch.isActive) {
      throw new BadRequestException('Cannot set an inactive branch as default');
    }

    await this.prisma.branch.updateMany({
      where: { gymId, isDefault: true },
      data: { isDefault: false },
    });

    return this.prisma.branch.update({
      where: { id: branchId },
      data: { isDefault: true },
    });
  }

  async getDefaultBranch(gymId: number) {
    const branch = await this.prisma.branch.findFirst({
      where: { gymId, isDefault: true, isActive: true },
    });

    if (!branch) {
      return this.prisma.branch.findFirst({
        where: { gymId, isActive: true },
        orderBy: { createdAt: 'asc' },
      });
    }

    return branch;
  }

  async validateBranchLimit(gymId: number): Promise<BranchLimitResponseDto> {
    const subscription = await this.prisma.saasGymSubscription.findUnique({
      where: { gymId },
      include: { plan: true },
    });

    const currentCount = await this.prisma.branch.count({
      where: { gymId, isActive: true },
    });

    const maxBranches = (subscription?.plan as any)?.maxBranches ?? 1;

    return {
      current: currentCount,
      max: maxBranches,
      canAdd: currentCount < maxBranches,
      plan: subscription?.plan?.name,
    };
  }

  async createDefaultBranch(gymId: number, gym: any) {
    return this.prisma.branch.create({
      data: {
        gymId,
        name: gym.name,
        code: 'MAIN',
        phone: gym.phone,
        email: gym.email,
        address: gym.address,
        city: gym.city,
        state: gym.state,
        zipCode: gym.zipCode,
        isDefault: true,
        isActive: true,
      },
    });
  }

  async branchExists(gymId: number, branchId: number): Promise<boolean> {
    const count = await this.prisma.branch.count({
      where: { id: branchId, gymId },
    });
    return count > 0;
  }

  async getBranchCount(gymId: number): Promise<number> {
    return this.prisma.branch.count({
      where: { gymId, isActive: true },
    });
  }

  private async verifyGymExists(gymId: number) {
    const gym = await this.prisma.gym.findUnique({
      where: { id: gymId },
    });

    if (!gym) {
      throw new NotFoundException(`Gym with ID ${gymId} not found`);
    }

    return gym;
  }

  async transferMember(
    gymId: number,
    dto: TransferMemberDto,
  ): Promise<TransferMemberResponseDto> {
    await this.verifyGymExists(gymId);

    const fromBranch = await this.prisma.branch.findFirst({
      where: { id: dto.fromBranchId, gymId },
    });
    if (!fromBranch) {
      throw new NotFoundException(`Source branch with ID ${dto.fromBranchId} not found`);
    }

    const toBranch = await this.prisma.branch.findFirst({
      where: { id: dto.toBranchId, gymId, isActive: true },
    });
    if (!toBranch) {
      throw new NotFoundException(`Destination branch with ID ${dto.toBranchId} not found or is inactive`);
    }

    if (dto.fromBranchId === dto.toBranchId) {
      throw new BadRequestException('Source and destination branches cannot be the same');
    }

    const member = await this.tenantService.executeInTenant(gymId, async (client) => {
      const result = await client.query(
        `SELECT id, name, email, branch_id FROM users WHERE id = $1 AND role = 'client'`,
        [dto.memberId],
      );
      return result.rows[0];
    });

    if (!member) {
      throw new NotFoundException(`Member with ID ${dto.memberId} not found`);
    }

    if (member.branch_id && member.branch_id !== dto.fromBranchId) {
      throw new BadRequestException(
        `Member is not in the specified source branch. Current branch: ${member.branch_id}`,
      );
    }

    let membershipsAffected = 0;
    let attendanceRecordsUpdated = 0;
    const membershipAction = dto.membershipAction || MembershipTransferAction.TRANSFER;

    await this.tenantService.executeInTenant(gymId, async (client) => {
      await client.query(
        `UPDATE users SET branch_id = $1, updated_at = NOW() WHERE id = $2`,
        [dto.toBranchId, dto.memberId],
      );

      if (membershipAction === MembershipTransferAction.CANCEL) {
        const cancelResult = await client.query(
          `UPDATE memberships
           SET status = 'cancelled', cancelled_at = NOW(), cancellation_reason = 'Branch transfer', updated_at = NOW()
           WHERE user_id = $1 AND status IN ('active', 'pending')
           RETURNING id`,
          [dto.memberId],
        );
        membershipsAffected = cancelResult.rowCount || 0;
      } else if (membershipAction === MembershipTransferAction.TRANSFER) {
        const transferResult = await client.query(
          `UPDATE memberships
           SET branch_id = $1, updated_at = NOW()
           WHERE user_id = $2 AND status IN ('active', 'pending')
           RETURNING id`,
          [dto.toBranchId, dto.memberId],
        );
        membershipsAffected = transferResult.rowCount || 0;
      }

      const attendanceResult = await client.query(
        `UPDATE attendance
         SET branch_id = $1, updated_at = NOW()
         WHERE user_id = $2 AND check_in_time IS NULL AND date >= CURRENT_DATE
         RETURNING id`,
        [dto.toBranchId, dto.memberId],
      );
      attendanceRecordsUpdated = attendanceResult.rowCount || 0;
    });

    return {
      success: true,
      message: `Member ${member.name} transferred from ${fromBranch.name} to ${toBranch.name}`,
      memberId: dto.memberId,
      fromBranchId: dto.fromBranchId,
      toBranchId: dto.toBranchId,
      membershipsAffected,
      attendanceRecordsUpdated,
    };
  }

  async getMemberBranch(gymId: number, memberId: number): Promise<any | null> {
    const member = await this.tenantService.executeInTenant(gymId, async (client) => {
      const result = await client.query(
        `SELECT id, name, email, branch_id FROM users WHERE id = $1 AND role = 'client'`,
        [memberId],
      );
      return result.rows[0];
    });

    if (!member) {
      throw new NotFoundException(`Member with ID ${memberId} not found`);
    }

    if (!member.branch_id) {
      return null;
    }

    return this.prisma.branch.findFirst({
      where: { id: member.branch_id, gymId },
    });
  }

  async migrateExistingGyms(): Promise<{ migrated: number; skipped: number; errors: string[] }> {
    const gyms = await this.prisma.gym.findMany({
      where: {
        branches: { none: {} },
        tenantSchemaName: { not: null },
      },
    });

    let migrated = 0;
    let skipped = 0;
    const errors: string[] = [];

    for (const gym of gyms) {
      try {
        const branch = await this.prisma.branch.create({
          data: {
            gymId: gym.id,
            name: gym.name,
            code: 'MAIN',
            phone: gym.phone,
            email: gym.email,
            address: gym.address,
            city: gym.city,
            state: gym.state,
            zipCode: gym.zipCode,
            isDefault: true,
            isActive: true,
          },
        });

        const schemaExists = await this.tenantService.tenantSchemaExists(gym.id);
        if (schemaExists) {
          await this.tenantService.executeInTenant(gym.id, async (client) => {
            await client.query(`UPDATE users SET branch_id = $1 WHERE branch_id IS NULL`, [branch.id]);
            await client.query(`UPDATE plans SET branch_id = $1 WHERE branch_id IS NULL`, [branch.id]);
            await client.query(`UPDATE offers SET branch_id = $1 WHERE branch_id IS NULL`, [branch.id]);
            await client.query(`UPDATE memberships SET branch_id = $1 WHERE branch_id IS NULL`, [branch.id]);
            await client.query(`UPDATE attendance SET branch_id = $1 WHERE branch_id IS NULL`, [branch.id]);
            await client.query(`UPDATE staff_salaries SET branch_id = $1 WHERE branch_id IS NULL`, [branch.id]);
          });
        }

        await this.prisma.userGymXref.updateMany({
          where: { gymId: gym.id, role: 'admin' },
          data: { branchId: null },
        });

        await this.prisma.userGymXref.updateMany({
          where: { gymId: gym.id, role: { not: 'admin' }, branchId: null },
          data: { branchId: branch.id },
        });

        migrated++;
      } catch (error: any) {
        errors.push(`Gym ${gym.id} (${gym.name}): ${error.message}`);
      }
    }

    skipped = gyms.length - migrated - errors.length;

    return { migrated, skipped, errors };
  }
}
