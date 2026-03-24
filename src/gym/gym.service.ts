import {
  Injectable,
  Logger,
  NotFoundException,
  BadRequestException,
  ConflictException,
} from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';
import { TenantService } from '../tenant/tenant.service';
import { UploadService } from '../upload/upload.service';
import { CreateGymDto, UpdateGymDto } from './dto/gym.dto';
import {
  PaginationParams,
  PaginatedResponse,
  getPaginationParams,
  createPaginationMeta,
} from '../common/pagination.util';
import { hashPassword } from '../common/utils';
import { ROLES, USER_STATUS, GYM_STATUS } from '../common/constants';
import { getCurrencyFromCountry } from '../common/constants/currencies';

export interface GymFilters extends PaginationParams {
  status?: string;
  includeInactive?: boolean;
  gymId?: number;
}

@Injectable()
export class GymService {
  private readonly logger = new Logger(GymService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly tenantService: TenantService,
    private readonly uploadService: UploadService,
  ) {}

  async findAll(filters: GymFilters = {}): Promise<PaginatedResponse<Record<string, any>>> {
    const { page, limit, skip, take, noPagination } =
      getPaginationParams(filters);

    const where: Record<string, any> = {};

    /* Filter by gymId if provided (non-superadmin users only see their own gym) */
    if (filters.gymId) {
      where.id = filters.gymId;
    }

    // Handle status filter
    if (filters.status && filters.status !== 'all') {
      where.isActive = filters.status === GYM_STATUS.ACTIVE;
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
          where: { role: ROLES.ADMIN, isActive: true },
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
        currency: gym.currency,
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
          where: { role: ROLES.ADMIN, isActive: true },
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
      currency: gym.currency,
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

    // Determine currency from country
    const country = dto.country || 'India';
    const currency = getCurrencyFromCountry(country).code;

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
        country,
        currency,
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

    // Create admin user in PUBLIC.users
    const createdUser = await this.prisma.user.create({
      data: {
        email: dto.admin.email,
        passwordHash,
        name: dto.admin.name,
        phone: dto.admin.phone,
        status: USER_STATUS.ACTIVE,
      },
    });

    // Create user-gym assignment with admin role
    await this.prisma.userGymXref.create({
      data: {
        userId: createdUser.id,
        gymId: gym.id,
        role: ROLES.ADMIN,
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
      const endDate = new Date(now);
      endDate.setMonth(endDate.getMonth() + (freePlan.durationMonths || 3));

      await this.prisma.saasGymSubscription.create({
        data: {
          gymId: gym.id,
          planId: freePlan.id,
          startDate: now,
          endDate: endDate,
          status: 'trial',
          trialEndsAt: trialEnd,
          amount: 0,
          currency,
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

    const data: Record<string, any> = { ...dto };

    // Auto-set currency when country changes (only if currency not explicitly provided)
    if (dto.country && !dto.currency) {
      data.currency = getCurrencyFromCountry(dto.country).code;
    }

    return this.prisma.gym.update({
      where: { id },
      data,
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

  /**
   * Force-delete a gym and ALL associated data. Superadmin only. Irreversible.
   */
  async forceRemove(id: number): Promise<{ success: boolean; message: string; details: Record<string, any> }> {
    const gym = await this.prisma.gym.findUnique({ where: { id } });
    if (!gym) {
      throw new NotFoundException(`Gym with ID ${id} not found`);
    }

    const details: Record<string, any> = { gymId: id, gymName: gym.name };

    // 1. Collect all staff user IDs assigned to this gym
    const userAssignments = await this.prisma.userGymXref.findMany({
      where: { gymId: id },
      select: { userId: true },
    });
    const userIds = [...new Set(userAssignments.map((a) => a.userId))];
    details.staffCount = userIds.length;

    // 2. Collect S3 URLs from tenant schema BEFORE dropping it
    const s3UrlsToDelete: string[] = [];
    if (gym.logo) {
      s3UrlsToDelete.push(gym.logo);
    }

    try {
      const schemaExists = await this.tenantService.tenantSchemaExists(id);
      if (schemaExists) {
        const tenantUrls = await this.tenantService.executeInTenant(id, async (client) => {
          const urls: string[] = [];

          // Progress photos
          try {
            const result = await client.query(
              `SELECT photo_url, thumbnail_url FROM progress_photos WHERE photo_url IS NOT NULL`,
            );
            for (const row of result.rows) {
              if (row.photo_url) urls.push(row.photo_url);
              if (row.thumbnail_url) urls.push(row.thumbnail_url);
            }
          } catch (err) {
            this.logger.warn('Could not read progress_photos during gym deletion (table may not exist)', err);
          }

          // Client avatars in tenant schema
          try {
            const result = await client.query(
              `SELECT avatar FROM users WHERE avatar IS NOT NULL`,
            );
            for (const row of result.rows) {
              if (row.avatar) urls.push(row.avatar);
            }
          } catch (err) {
            this.logger.warn('Could not read user avatars during gym deletion (table may not exist)', err);
          }

          return urls;
        });
        s3UrlsToDelete.push(...tenantUrls);
      }
    } catch (err) {
      this.logger.warn('Failed to read tenant data for S3 cleanup; will clean up by prefix', err);
    }

    // 3. Drop tenant schema
    try {
      if (gym.tenantSchemaName && gym.tenantSchemaName !== 'pending') {
        await this.tenantService.dropTenantSchema(id);
        details.tenantSchemaDropped = true;
      }
    } catch (err) {
      this.logger.error('Failed to drop tenant schema during gym deletion', err);
      details.tenantSchemaDropped = false;
    }

    // 4. Delete email verifications (nullable gymId, no FK)
    const emailResult = await this.prisma.emailVerification.deleteMany({ where: { gymId: id } });
    details.emailVerificationsDeleted = emailResult.count;

    // 6. Delete payment history (FK to subscription, must go before subscription)
    await this.prisma.saasPaymentHistory.deleteMany({ where: { gymId: id } });

    // 7. Delete subscription
    await this.prisma.saasGymSubscription.deleteMany({ where: { gymId: id } });

    // 8. Delete gym record (cascades: user_gym_xref, branches, support_tickets+messages)
    await this.prisma.gym.delete({ where: { id } });
    details.gymDeleted = true;

    // 9. Delete orphaned users (staff with no remaining gym assignments)
    let orphanedUsersDeleted = 0;
    for (const userId of userIds) {
      const remaining = await this.prisma.userGymXref.count({ where: { userId } });
      if (remaining === 0) {
        const user = await this.prisma.user.findUnique({
          where: { id: userId },
          select: { avatar: true },
        });
        if (user?.avatar) s3UrlsToDelete.push(user.avatar);
        await this.prisma.user.delete({ where: { id: userId } });
        orphanedUsersDeleted++;
      }
    }
    details.orphanedUsersDeleted = orphanedUsersDeleted;

    // 10. Delete S3 assets
    let s3Deleted = 0;
    for (const url of s3UrlsToDelete) {
      await this.uploadService.deleteFile(url);
      s3Deleted++;
    }
    // Safety net: delete any remaining files under the gym's S3 prefix
    s3Deleted += await this.uploadService.deleteByPrefix(`gyms/${id}/`);
    details.s3AssetsDeleted = s3Deleted;

    return {
      success: true,
      message: `Gym "${gym.name}" and all associated data permanently deleted`,
      details,
    };
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
    if (assignment.role === ROLES.ADMIN && assignment.isPrimary) {
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
      assignment.role === ROLES.ADMIN &&
      assignment.isPrimary &&
      newRole !== ROLES.ADMIN
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
  async getProfile(gymId: number) {
    // Get gym details
    const gym = await this.prisma.gym.findUnique({
      where: { id: gymId },
      include: {
        userAssignments: {
          where: { role: ROLES.ADMIN, isActive: true },
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

    // Get all branches with stats
    const allBranches = await this.prisma.branch.findMany({
      where: { gymId },
      orderBy: [{ isDefault: 'desc' }, { name: 'asc' }],
    });

    // Fetch stats for all branches in a single tenant query
    const branchIds = allBranches.map((b) => b.id);
    const allCounts = await this.tenantService.executeInTenant(
      gymId,
      async (client) => {
        const [membersResult, staffResult, facilitiesResult, amenitiesResult] =
          await Promise.all([
            client.query(
              `SELECT COUNT(*) as count FROM users WHERE role = 'client' AND status = 'active' AND (is_deleted = FALSE OR is_deleted IS NULL)`,
            ),
            client.query(
              `SELECT COUNT(*) as count FROM users WHERE role IN ('manager', 'trainer') AND status = 'active' AND (is_deleted = FALSE OR is_deleted IS NULL)`,
            ),
            client.query(
              `SELECT COUNT(*) as count FROM facilities WHERE is_active = true`,
            ),
            client.query(
              `SELECT COUNT(*) as count FROM amenities WHERE is_active = true`,
            ),
          ]);

        const totalMembers = parseInt(membersResult.rows[0]?.count || '0', 10);
        const totalStaff = parseInt(staffResult.rows[0]?.count || '0', 10);
        const totalFacilities = parseInt(facilitiesResult.rows[0]?.count || '0', 10);
        const totalAmenities = parseInt(amenitiesResult.rows[0]?.count || '0', 10);

        // Return same count for all branches (no branch filtering)
        const members: Record<number, number> = {};
        const staff: Record<number, number> = {};
        const facilities: Record<number, number> = {};
        const amenities: Record<number, number> = {};
        for (const id of branchIds) {
          members[id] = totalMembers;
          staff[id] = totalStaff;
          facilities[id] = totalFacilities;
          amenities[id] = totalAmenities;
        }

        return { members, staff, facilities, amenities };
      },
    );

    const branches = allBranches.map((branch) => ({
      ...branch,
      membersCount: allCounts.members[branch.id] || 0,
      staffCount: allCounts.staff[branch.id] || 0,
      facilitiesCount:
        (allCounts.facilities[branch.id] || 0) +
        (allCounts.facilities[0] || 0),
      amenitiesCount:
        (allCounts.amenities[branch.id] || 0) +
        (allCounts.amenities[0] || 0),
    }));

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
      currency: gym.currency,
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

  // ---- Onboarding Tour ----

  async getOnboardingTourStatus(gymId: number) {
    const gym = await this.prisma.gym.findUnique({
      where: { id: gymId },
      select: {
        onboardingTourCompleted: true,
        onboardingTourCompletedAt: true,
        onboardingTourSkippedAt: true,
      },
    });
    if (!gym) throw new NotFoundException(`Gym #${gymId} not found`);
    return gym;
  }

  async completeOnboardingTour(gymId: number) {
    return this.prisma.gym.update({
      where: { id: gymId },
      data: {
        onboardingTourCompleted: true,
        onboardingTourCompletedAt: new Date(),
      },
      select: {
        onboardingTourCompleted: true,
        onboardingTourCompletedAt: true,
      },
    });
  }

  async skipOnboardingTour(gymId: number) {
    return this.prisma.gym.update({
      where: { id: gymId },
      data: {
        onboardingTourSkippedAt: new Date(),
      },
      select: {
        onboardingTourSkippedAt: true,
      },
    });
  }
}
