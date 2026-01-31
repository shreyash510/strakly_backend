import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ConflictException,
  Inject,
  forwardRef,
} from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';
import { TenantService } from '../tenant/tenant.service';
import { BranchService } from '../branch/branch.service';
import { CreateGymDto, UpdateGymDto } from './dto/gym.dto';
import {
  PaginationParams,
  PaginatedResponse,
  getPaginationParams,
  createPaginationMeta,
} from '../common/pagination.util';
import { hashPassword } from '../common/utils';

export interface GymFilters extends PaginationParams {
  status?: string;
  includeInactive?: boolean;
  gymId?: number;
}

@Injectable()
export class GymService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tenantService: TenantService,
    @Inject(forwardRef(() => BranchService))
    private readonly branchService: BranchService,
  ) {}

  async findAll(filters: GymFilters = {}): Promise<PaginatedResponse<any>> {
    const { page, limit, skip, take, noPagination } =
      getPaginationParams(filters);

    const where: any = {};

    /* Filter by gymId if provided (non-superadmin users only see their own gym) */
    if (filters.gymId) {
      where.id = filters.gymId;
    }

    // Handle status filter
    if (filters.status && filters.status !== 'all') {
      where.isActive = filters.status === 'active';
    } else if (!filters.includeInactive) {
      where.isActive = true;
    }

    // Apply search filter
    if (filters.search) {
      where.OR = [
        { name: { contains: filters.search, mode: 'insensitive' } },
        { email: { contains: filters.search, mode: 'insensitive' } },
        { phone: { contains: filters.search, mode: 'insensitive' } },
        { city: { contains: filters.search, mode: 'insensitive' } },
      ];
    }

    // Get total count
    const total = await this.prisma.gym.count({ where });

    // Get paginated data with admin assignments
    const gyms = await this.prisma.gym.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip,
      take,
      include: {
        userAssignments: {
          where: { role: 'admin', isActive: true },
          include: {
            user: {
              select: {
                id: true,
                name: true,
                email: true,
              },
            },
          },
          take: 1, // Get only the first admin (primary owner)
        },
      },
    });

    // Format response with owner info
    const formattedGyms = gyms.map((gym) => {
      const adminAssignment = gym.userAssignments[0];
      return {
        id: gym.id,
        name: gym.name,
        description: gym.description,
        logo: gym.logo,
        phone: gym.phone,
        email: gym.email,
        website: gym.website,
        address: gym.address,
        city: gym.city,
        state: gym.state,
        zipCode: gym.zipCode,
        country: gym.country,
        openingTime: gym.openingTime,
        closingTime: gym.closingTime,
        capacity: gym.capacity,
        amenities: gym.amenities,
        isActive: gym.isActive,
        tenantSchemaName: gym.tenantSchemaName,
        createdAt: gym.createdAt,
        updatedAt: gym.updatedAt,
        owner: adminAssignment?.user || null,
      };
    });

    return {
      data: formattedGyms,
      pagination: createPaginationMeta(total, page, limit, noPagination),
    };
  }

  async findOne(id: number) {
    const gym = await this.prisma.gym.findUnique({
      where: { id },
      include: {
        userAssignments: {
          where: { role: 'admin', isActive: true },
          include: {
            user: {
              select: {
                id: true,
                name: true,
                email: true,
              },
            },
          },
          take: 1,
        },
      },
    });

    if (!gym) {
      throw new NotFoundException(`Gym with ID ${id} not found`);
    }

    const adminAssignment = gym.userAssignments[0];

    return {
      id: gym.id,
      name: gym.name,
      description: gym.description,
      logo: gym.logo,
      phone: gym.phone,
      email: gym.email,
      website: gym.website,
      address: gym.address,
      city: gym.city,
      state: gym.state,
      zipCode: gym.zipCode,
      country: gym.country,
      openingTime: gym.openingTime,
      closingTime: gym.closingTime,
      capacity: gym.capacity,
      amenities: gym.amenities,
      isActive: gym.isActive,
      tenantSchemaName: gym.tenantSchemaName,
      createdAt: gym.createdAt,
      updatedAt: gym.updatedAt,
      owner: adminAssignment?.user || null,
    };
  }

  async create(dto: CreateGymDto) {
    // Check if admin email already exists in public.users
    const existingUser = await this.prisma.user.findUnique({
      where: { email: dto.admin.email },
    });

    if (existingUser) {
      throw new ConflictException('Admin email already exists in the system');
    }

    // Also check system_users table
    const existingSystemUser = await this.prisma.systemUser.findUnique({
      where: { email: dto.admin.email },
    });

    if (existingSystemUser) {
      throw new ConflictException('Email already exists as a system user');
    }

    // Hash password
    const passwordHash = await hashPassword(dto.admin.password);

    // Create gym first with a temporary schema name
    const gym = await this.prisma.gym.create({
      data: {
        name: dto.name,
        tenantSchemaName: 'pending', // Will update after getting ID
        description: dto.description,
        logo: dto.logo,
        phone: dto.phone,
        email: dto.email,
        website: dto.website,
        address: dto.address,
        city: dto.city,
        state: dto.state,
        zipCode: dto.zipCode,
        country: dto.country || 'India',
        openingTime: dto.openingTime,
        closingTime: dto.closingTime,
        capacity: dto.capacity,
        amenities: dto.amenities || [],
        isActive: dto.isActive ?? true,
      },
    });

    // Update tenant schema name with the gym ID
    const tenantSchemaName = this.tenantService.getTenantSchemaName(gym.id);
    await this.prisma.gym.update({
      where: { id: gym.id },
      data: { tenantSchemaName },
    });

    // Create the tenant schema with all tables (for clients)
    await this.tenantService.createTenantSchema(gym.id);

    // Create default branch for this gym
    const defaultBranch = await this.branchService.createDefaultBranch(
      gym.id,
      gym,
    );

    // Create admin user in PUBLIC.users
    const createdUser = await this.prisma.user.create({
      data: {
        email: dto.admin.email,
        passwordHash,
        name: dto.admin.name,
        phone: dto.admin.phone,
        status: 'active',
      },
    });

    // Create user-gym assignment with admin role (null branchId = all branches)
    await this.prisma.userGymXref.create({
      data: {
        userId: createdUser.id,
        gymId: gym.id,
        branchId: null, // Admin has access to all branches
        role: 'admin',
        isPrimary: true,
        isActive: true,
      },
    });

    // Create free trial subscription
    const freePlan = await this.prisma.saasPlan.findFirst({
      where: { code: 'free' },
    });

    if (freePlan) {
      const now = new Date();
      const trialEnd = new Date(now.getTime() + 14 * 24 * 60 * 60 * 1000); // 14 days trial
      const endDate = new Date(now.getTime() + 365 * 24 * 60 * 60 * 1000); // 1 year

      await this.prisma.saasGymSubscription.create({
        data: {
          gymId: gym.id,
          planId: freePlan.id,
          startDate: now,
          endDate: endDate,
          status: 'trial',
          trialEndsAt: trialEnd,
          amount: 0,
          currency: 'INR',
          paymentStatus: 'paid',
          autoRenew: true,
          isActive: true,
        },
      });
    }

    return this.findOne(gym.id);
  }

  async update(id: number, dto: UpdateGymDto) {
    await this.findOne(id);

    return this.prisma.gym.update({
      where: { id },
      data: dto,
    });
  }

  async remove(id: number) {
    const gym = await this.findOne(id);

    // Check if gym has any staff assignments
    const staffCount = await this.prisma.userGymXref.count({
      where: { gymId: id, isActive: true },
    });

    if (staffCount > 0) {
      throw new BadRequestException(
        `Cannot delete gym. ${staffCount} staff member(s) are assigned to this gym. Please reassign or remove staff first.`,
      );
    }

    // Check if gym has any clients in tenant schema
    try {
      const schemaExists = await this.tenantService.tenantSchemaExists(id);
      if (schemaExists) {
        const clientCount = await this.tenantService.executeInTenant(
          id,
          async (client) => {
            const result = await client.query(
              `SELECT COUNT(*) as count FROM users`,
            );
            return parseInt(result.rows[0].count, 10);
          },
        );

        if (clientCount > 0) {
          throw new BadRequestException(
            `Cannot delete gym. ${clientCount} client(s) exist in this gym. Please remove clients first.`,
          );
        }

        // Check for active memberships
        const activeMemberships = await this.tenantService.executeInTenant(
          id,
          async (client) => {
            const result = await client.query(
              `SELECT COUNT(*) as count FROM memberships WHERE status IN ('active', 'pending')`,
            );
            return parseInt(result.rows[0].count, 10);
          },
        );

        if (activeMemberships > 0) {
          throw new BadRequestException(
            `Cannot delete gym. ${activeMemberships} active membership(s) exist at this gym.`,
          );
        }
      }
    } catch (e) {
      // Tenant schema might not exist, which is fine
      if (e instanceof BadRequestException) {
        throw e;
      }
    }

    // Delete the gym (cascade will handle user_gym_xref, support_tickets, etc.)
    await this.prisma.gym.delete({
      where: { id },
    });

    // Note: Tenant schema deletion should be handled separately (manual or background job)

    return { success: true, message: 'Gym deleted successfully' };
  }

  async toggleStatus(id: number) {
    const gym = await this.findOne(id);

    return this.prisma.gym.update({
      where: { id },
      data: { isActive: !gym.isActive },
    });
  }

  /**
   * Get all staff members assigned to a gym
   */
  async getGymStaff(gymId: number) {
    const gym = await this.prisma.gym.findUnique({
      where: { id: gymId },
    });

    if (!gym) {
      throw new NotFoundException(`Gym with ID ${gymId} not found`);
    }

    const staffAssignments = await this.prisma.userGymXref.findMany({
      where: { gymId, isActive: true },
      include: {
        user: {
          select: {
            id: true,
            name: true,
            email: true,
            phone: true,
            avatar: true,
            status: true,
            createdAt: true,
          },
        },
      },
      orderBy: [{ role: 'asc' }, { createdAt: 'desc' }],
    });

    return staffAssignments.map((assignment) => ({
      id: assignment.user.id,
      name: assignment.user.name,
      email: assignment.user.email,
      phone: assignment.user.phone,
      avatar: assignment.user.avatar,
      status: assignment.user.status,
      role: assignment.role,
      isPrimary: assignment.isPrimary,
      joinedAt: assignment.joinedAt,
      createdAt: assignment.user.createdAt,
    }));
  }

  /**
   * Add a staff member to a gym
   */
  async addStaffToGym(gymId: number, userId: number, role: string) {
    const gym = await this.prisma.gym.findUnique({
      where: { id: gymId },
    });

    if (!gym) {
      throw new NotFoundException(`Gym with ID ${gymId} not found`);
    }

    const user = await this.prisma.user.findUnique({
      where: { id: userId },
    });

    if (!user) {
      throw new NotFoundException(`User with ID ${userId} not found`);
    }

    // Check if already assigned
    const existingAssignment = await this.prisma.userGymXref.findUnique({
      where: {
        userId_gymId: { userId, gymId },
      },
    });

    if (existingAssignment) {
      if (existingAssignment.isActive) {
        throw new ConflictException('User is already assigned to this gym');
      }
      // Reactivate the assignment
      return this.prisma.userGymXref.update({
        where: { id: existingAssignment.id },
        data: { isActive: true, role },
      });
    }

    // Create new assignment
    return this.prisma.userGymXref.create({
      data: {
        userId,
        gymId,
        role,
        isPrimary: false,
        isActive: true,
      },
    });
  }

  /**
   * Remove a staff member from a gym
   */
  async removeStaffFromGym(gymId: number, userId: number) {
    const assignment = await this.prisma.userGymXref.findUnique({
      where: {
        userId_gymId: { userId, gymId },
      },
    });

    if (!assignment) {
      throw new NotFoundException('Staff assignment not found');
    }

    // Don't allow removing the primary admin
    if (assignment.role === 'admin' && assignment.isPrimary) {
      throw new BadRequestException(
        'Cannot remove the primary admin from the gym',
      );
    }

    // Soft delete by setting isActive to false
    return this.prisma.userGymXref.update({
      where: { id: assignment.id },
      data: { isActive: false },
    });
  }

  /**
   * Update staff role in a gym
   */
  async updateStaffRole(gymId: number, userId: number, newRole: string) {
    const assignment = await this.prisma.userGymXref.findUnique({
      where: {
        userId_gymId: { userId, gymId },
      },
    });

    if (!assignment) {
      throw new NotFoundException('Staff assignment not found');
    }

    // Don't allow changing the primary admin's role
    if (
      assignment.role === 'admin' &&
      assignment.isPrimary &&
      newRole !== 'admin'
    ) {
      throw new BadRequestException(
        'Cannot change the role of the primary admin',
      );
    }

    return this.prisma.userGymXref.update({
      where: { id: assignment.id },
      data: { role: newRole },
    });
  }

  /**
   * Get gym profile for authenticated user with branch details and stats
   */
  async getProfile(gymId: number, branchId?: number | null) {
    // Get gym details
    const gym = await this.prisma.gym.findUnique({
      where: { id: gymId },
      include: {
        userAssignments: {
          where: { role: 'admin', isActive: true },
          include: {
            user: {
              select: {
                id: true,
                name: true,
                email: true,
              },
            },
          },
          take: 1,
        },
      },
    });

    if (!gym) {
      throw new NotFoundException(`Gym with ID ${gymId} not found`);
    }

    // Get branches with stats
    let branches: any[];
    if (branchId) {
      // Get single branch with stats
      const branch = await this.branchService.findOne(gymId, branchId);
      branches = branch ? [branch] : [];
    } else {
      // Get all branches with stats
      const allBranches = await this.prisma.branch.findMany({
        where: { gymId },
        orderBy: [{ isDefault: 'desc' }, { name: 'asc' }],
      });

      // Fetch stats for each branch
      branches = await Promise.all(
        allBranches.map(async (branch) => {
          const counts = await this.tenantService.executeInTenant(
            gymId,
            async (client) => {
              const [
                membersResult,
                staffResult,
                facilitiesResult,
                amenitiesResult,
              ] = await Promise.all([
                client.query(
                  `SELECT COUNT(*) as count FROM users WHERE branch_id = $1 AND role = 'client' AND status = 'active'`,
                  [branch.id],
                ),
                client.query(
                  `SELECT COUNT(*) as count FROM users WHERE branch_id = $1 AND role IN ('branch_admin', 'manager', 'trainer') AND status = 'active'`,
                  [branch.id],
                ),
                client.query(
                  `SELECT COUNT(*) as count FROM facilities WHERE (branch_id = $1 OR branch_id IS NULL) AND is_active = true`,
                  [branch.id],
                ),
                client.query(
                  `SELECT COUNT(*) as count FROM amenities WHERE (branch_id = $1 OR branch_id IS NULL) AND is_active = true`,
                  [branch.id],
                ),
              ]);
              return {
                membersCount: parseInt(membersResult.rows[0]?.count || '0', 10),
                staffCount: parseInt(staffResult.rows[0]?.count || '0', 10),
                facilitiesCount: parseInt(
                  facilitiesResult.rows[0]?.count || '0',
                  10,
                ),
                amenitiesCount: parseInt(
                  amenitiesResult.rows[0]?.count || '0',
                  10,
                ),
              };
            },
          );
          return { ...branch, ...counts };
        }),
      );
    }

    const adminAssignment = gym.userAssignments[0];

    return {
      id: gym.id,
      name: gym.name,
      description: gym.description,
      logo: gym.logo,
      phone: gym.phone,
      email: gym.email,
      website: gym.website,
      address: gym.address,
      city: gym.city,
      state: gym.state,
      zipCode: gym.zipCode,
      country: gym.country,
      openingTime: gym.openingTime,
      closingTime: gym.closingTime,
      capacity: gym.capacity,
      amenities: gym.amenities,
      isActive: gym.isActive,
      tenantSchemaName: gym.tenantSchemaName,
      createdAt: gym.createdAt,
      updatedAt: gym.updatedAt,
      owner: adminAssignment?.user || null,
      branches,
    };
  }
}
