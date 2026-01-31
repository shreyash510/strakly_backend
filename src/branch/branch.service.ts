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

  /**
   * Get all branches for a gym
   */
  async findAll(gymId: number, filters: BranchFilters = {}): Promise<PaginatedResponse<any>> {
    const { page, limit, skip, take, noPagination } = getPaginationParams(filters);

    // Verify gym exists
    await this.verifyGymExists(gymId);

    const where: any = { gymId };

    // Handle active filter
    if (!filters.includeInactive) {
      where.isActive = true;
    }

    // Apply search filter
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
        { isDefault: 'desc' }, // Default branch first
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

  /**
   * Get a single branch by ID with stats
   */
  async findOne(gymId: number, branchId: number) {
    const branch = await this.prisma.branch.findFirst({
      where: { id: branchId, gymId },
    });

    if (!branch) {
      throw new NotFoundException(`Branch with ID ${branchId} not found in this gym`);
    }

    // Get all counts from tenant schema
    const counts = await this.tenantService.executeInTenant(gymId, async (client) => {
      const [membersResult, staffResult, facilitiesResult, amenitiesResult] = await Promise.all([
        client.query(
          `SELECT COUNT(*) as count FROM users WHERE branch_id = $1 AND role = 'client' AND status = 'active'`,
          [branchId]
        ),
        client.query(
          `SELECT COUNT(*) as count FROM users WHERE branch_id = $1 AND role IN ('branch_admin', 'manager', 'trainer') AND status = 'active'`,
          [branchId]
        ),
        client.query(
          `SELECT COUNT(*) as count FROM facilities WHERE (branch_id = $1 OR branch_id IS NULL) AND is_active = true`,
          [branchId]
        ),
        client.query(
          `SELECT COUNT(*) as count FROM amenities WHERE (branch_id = $1 OR branch_id IS NULL) AND is_active = true`,
          [branchId]
        ),
      ]);

      return {
        membersCount: parseInt(membersResult.rows[0]?.count || '0', 10),
        staffCount: parseInt(staffResult.rows[0]?.count || '0', 10),
        facilitiesCount: parseInt(facilitiesResult.rows[0]?.count || '0', 10),
        amenitiesCount: parseInt(amenitiesResult.rows[0]?.count || '0', 10),
      };
    });

    return {
      ...branch,
      ...counts,
    };
  }

  /**
   * Create a new branch
   */
  async create(gymId: number, dto: CreateBranchDto) {
    // Verify gym exists
    await this.verifyGymExists(gymId);

    // Check branch limit
    const limitCheck = await this.validateBranchLimit(gymId);
    if (!limitCheck.canAdd) {
      throw new ForbiddenException(
        `Branch limit reached. Your ${limitCheck.plan || 'current'} plan allows ${limitCheck.max} branch(es). Please upgrade to add more branches.`,
      );
    }

    // Check if code already exists for this gym
    const existingBranch = await this.prisma.branch.findUnique({
      where: {
        gymId_code: { gymId, code: dto.code.toUpperCase() },
      },
    });

    if (existingBranch) {
      throw new ConflictException(`Branch with code "${dto.code}" already exists for this gym`);
    }

    // Create the branch
    const branch = await this.prisma.branch.create({
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
        isDefault: false, // New branches are never default
      },
    });

    return branch;
  }

  /**
   * Update a branch
   */
  async update(gymId: number, branchId: number, dto: UpdateBranchDto) {
    const branch = await this.findOne(gymId, branchId);

    // If updating code, check it's unique
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

  /**
   * Delete a branch (soft delete by deactivating)
   */
  async remove(gymId: number, branchId: number) {
    const branch = await this.findOne(gymId, branchId);

    // Cannot delete the default branch
    if (branch.isDefault) {
      throw new BadRequestException('Cannot delete the default branch. Set another branch as default first.');
    }

    // Check if branch has any active data (users, memberships, etc.)
    // This is a simple check - you may want to add more thorough validation

    // Soft delete by setting isActive to false
    await this.prisma.branch.update({
      where: { id: branchId },
      data: { isActive: false },
    });

    return { success: true, message: 'Branch deleted successfully' };
  }

  /**
   * Set a branch as the default branch for a gym
   */
  async setDefaultBranch(gymId: number, branchId: number) {
    const branch = await this.findOne(gymId, branchId);

    if (!branch.isActive) {
      throw new BadRequestException('Cannot set an inactive branch as default');
    }

    // Remove default from all other branches
    await this.prisma.branch.updateMany({
      where: { gymId, isDefault: true },
      data: { isDefault: false },
    });

    // Set this branch as default
    return this.prisma.branch.update({
      where: { id: branchId },
      data: { isDefault: true },
    });
  }

  /**
   * Get the default branch for a gym
   */
  async getDefaultBranch(gymId: number) {
    const branch = await this.prisma.branch.findFirst({
      where: { gymId, isDefault: true, isActive: true },
    });

    if (!branch) {
      // If no default, get the first active branch
      return this.prisma.branch.findFirst({
        where: { gymId, isActive: true },
        orderBy: { createdAt: 'asc' },
      });
    }

    return branch;
  }

  /**
   * Validate branch limit based on subscription plan
   */
  async validateBranchLimit(gymId: number): Promise<BranchLimitResponseDto> {
    const subscription = await this.prisma.saasGymSubscription.findUnique({
      where: { gymId },
      include: { plan: true },
    });

    const currentCount = await this.prisma.branch.count({
      where: { gymId, isActive: true },
    });

    // Default to 1 branch if no subscription or plan found
    const maxBranches = subscription?.plan?.maxBranches ?? 1;

    return {
      current: currentCount,
      max: maxBranches,
      canAdd: currentCount < maxBranches,
      plan: subscription?.plan?.name,
    };
  }

  /**
   * Create default branch for a gym (used when gym is created)
   */
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

  /**
   * Check if a branch exists and belongs to a gym
   */
  async branchExists(gymId: number, branchId: number): Promise<boolean> {
    const count = await this.prisma.branch.count({
      where: { id: branchId, gymId },
    });
    return count > 0;
  }

  /**
   * Get branch count for a gym
   */
  async getBranchCount(gymId: number): Promise<number> {
    return this.prisma.branch.count({
      where: { gymId, isActive: true },
    });
  }

  /**
   * Verify gym exists
   */
  private async verifyGymExists(gymId: number) {
    const gym = await this.prisma.gym.findUnique({
      where: { id: gymId },
    });

    if (!gym) {
      throw new NotFoundException(`Gym with ID ${gymId} not found`);
    }

    return gym;
  }

  /**
   * Transfer a member from one branch to another
   */
  async transferMember(
    gymId: number,
    dto: TransferMemberDto,
  ): Promise<TransferMemberResponseDto> {
    // Verify gym exists
    await this.verifyGymExists(gymId);

    // Verify source branch exists
    const fromBranch = await this.prisma.branch.findFirst({
      where: { id: dto.fromBranchId, gymId },
    });
    if (!fromBranch) {
      throw new NotFoundException(`Source branch with ID ${dto.fromBranchId} not found`);
    }

    // Verify destination branch exists and is active
    const toBranch = await this.prisma.branch.findFirst({
      where: { id: dto.toBranchId, gymId, isActive: true },
    });
    if (!toBranch) {
      throw new NotFoundException(`Destination branch with ID ${dto.toBranchId} not found or is inactive`);
    }

    // Cannot transfer to the same branch
    if (dto.fromBranchId === dto.toBranchId) {
      throw new BadRequestException('Source and destination branches cannot be the same');
    }

    // Verify member exists in source branch
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

    // Perform the transfer in a transaction-like manner
    await this.tenantService.executeInTenant(gymId, async (client) => {
      // 1. Update member's branch_id
      await client.query(
        `UPDATE users SET branch_id = $1, updated_at = NOW() WHERE id = $2`,
        [dto.toBranchId, dto.memberId],
      );

      // 2. Handle memberships based on action
      if (membershipAction === MembershipTransferAction.CANCEL) {
        // Cancel active memberships
        const cancelResult = await client.query(
          `UPDATE memberships
           SET status = 'cancelled', cancelled_at = NOW(), cancellation_reason = 'Branch transfer', updated_at = NOW()
           WHERE user_id = $1 AND status IN ('active', 'pending')
           RETURNING id`,
          [dto.memberId],
        );
        membershipsAffected = cancelResult.rowCount || 0;
      } else if (membershipAction === MembershipTransferAction.TRANSFER) {
        // Transfer active memberships to new branch
        const transferResult = await client.query(
          `UPDATE memberships
           SET branch_id = $1, updated_at = NOW()
           WHERE user_id = $2 AND status IN ('active', 'pending')
           RETURNING id`,
          [dto.toBranchId, dto.memberId],
        );
        membershipsAffected = transferResult.rowCount || 0;
      }
      // KEEP: Do nothing with memberships

      // 3. Update future attendance records (if any scheduled)
      // Note: Past attendance records remain with old branch for historical accuracy
      // Only update records that haven't been checked in yet
      const attendanceResult = await client.query(
        `UPDATE attendance
         SET branch_id = $1, updated_at = NOW()
         WHERE user_id = $2 AND check_in_time IS NULL AND date >= CURRENT_DATE
         RETURNING id`,
        [dto.toBranchId, dto.memberId],
      );
      attendanceRecordsUpdated = attendanceResult.rowCount || 0;

      // 4. Log the transfer (create a note/audit record if you have an audit table)
      // For now, we'll skip this but you can add it later
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

  /**
   * Get member's current branch
   */
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

  /**
   * Migrate existing gyms to have default branches
   * This should be run once to set up branches for existing gyms
   */
  async migrateExistingGyms(): Promise<{ migrated: number; skipped: number; errors: string[] }> {
    const gyms = await this.prisma.gym.findMany({
      where: {
        branches: { none: {} }, // Gyms without any branches
        tenantSchemaName: { not: null }, // Only gyms with tenant schemas
      },
    });

    let migrated = 0;
    let skipped = 0;
    const errors: string[] = [];

    for (const gym of gyms) {
      try {
        // Create default branch
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

        // Update tenant data with branch_id
        const schemaExists = await this.tenantService.tenantSchemaExists(gym.id);
        if (schemaExists) {
          await this.tenantService.executeInTenant(gym.id, async (client) => {
            // Update users
            await client.query(
              `UPDATE users SET branch_id = $1 WHERE branch_id IS NULL`,
              [branch.id]
            );
            // Update plans
            await client.query(
              `UPDATE plans SET branch_id = $1 WHERE branch_id IS NULL`,
              [branch.id]
            );
            // Update offers
            await client.query(
              `UPDATE offers SET branch_id = $1 WHERE branch_id IS NULL`,
              [branch.id]
            );
            // Update memberships
            await client.query(
              `UPDATE memberships SET branch_id = $1 WHERE branch_id IS NULL`,
              [branch.id]
            );
            // Update attendance
            await client.query(
              `UPDATE attendance SET branch_id = $1 WHERE branch_id IS NULL`,
              [branch.id]
            );
            // Update staff_salaries
            await client.query(
              `UPDATE staff_salaries SET branch_id = $1 WHERE branch_id IS NULL`,
              [branch.id]
            );
          });
        }

        // Update staff assignments (UserGymXref) - admin gets null (all branches)
        await this.prisma.userGymXref.updateMany({
          where: { gymId: gym.id, role: 'admin' },
          data: { branchId: null }, // Admin has all branches access
        });

        // Non-admin staff get assigned to default branch
        await this.prisma.userGymXref.updateMany({
          where: { gymId: gym.id, role: { not: 'admin' }, branchId: null },
          data: { branchId: branch.id },
        });

        migrated++;
        console.log(`Migrated gym ${gym.id} (${gym.name}) with branch ${branch.id}`);
      } catch (error: any) {
        errors.push(`Gym ${gym.id} (${gym.name}): ${error.message}`);
        console.error(`Failed to migrate gym ${gym.id}:`, error.message);
      }
    }

    skipped = gyms.length - migrated - errors.length;

    return { migrated, skipped, errors };
  }
}
