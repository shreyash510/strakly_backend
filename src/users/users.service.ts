import {
  Injectable,
  NotFoundException,
  ConflictException,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';
import { TenantService } from '../tenant/tenant.service';
import { NotificationHelperService } from '../notifications/notification-helper.service';
import { NotificationsService } from '../notifications/notifications.service';
import { NotificationType } from '../notifications/notification-types';
import { LookupsService } from '../lookups/lookups.service';
import { ActivityLogsService } from '../activity-logs/activity-logs.service';
import {
  CreateUserDto,
  UpdateUserDto,
  CreateStaffDto,
  CreateClientDto,
  ApproveRequestDto,
} from './dto/create-user.dto';
import {
  AssignClientDto,
  TrainerClientResponseDto,
} from './dto/trainer-client.dto';
import {
  PaginationParams,
  PaginatedResponse,
  getPaginationParams,
  createPaginationMeta,
} from '../common/pagination.util';
import { hashPassword, generateUniqueAttendanceCode } from '../common/utils';
import { SqlValue } from '../common/types';
import { ROLES, USER_STATUS } from '../common/constants';

const USER_STATUS_LOOKUP_TYPE = 'USER_STATUS';

const CRUD_DEFAULT = { create: true, read: true, update: true, delete: false };
const DEFAULT_MANAGER_PERMISSIONS = {
  // Daily Operations
  clients: CRUD_DEFAULT,
  attendance: CRUD_DEFAULT,
  classes: CRUD_DEFAULT,
  appointments: CRUD_DEFAULT,
  guestVisits: CRUD_DEFAULT,
  requests: CRUD_DEFAULT,
  // Programs & Content
  programs: CRUD_DEFAULT,
  announcements: CRUD_DEFAULT,
  // Staff Management
  trainers: CRUD_DEFAULT,
  salary: CRUD_DEFAULT,
  // Resources
  facilities: CRUD_DEFAULT,
  amenities: CRUD_DEFAULT,
  equipment: CRUD_DEFAULT,
  // Growth & Marketing
  leads: CRUD_DEFAULT,
  referrals: CRUD_DEFAULT,
  // Finance
  subscriptions: CRUD_DEFAULT,
  plans: CRUD_DEFAULT,
  offers: CRUD_DEFAULT,
  products: CRUD_DEFAULT,
  productSales: { create: true, read: true, update: true, delete: false },
  financialReports: { read: true },
  expenses: CRUD_DEFAULT,
  // Admin
  settings: { read: true },
  reports: { read: true },
  support: CRUD_DEFAULT,
};

export interface UserFilters extends PaginationParams {
  role?: string;
  status?: string;
  gymId?: number;
  isSuperAdmin?: boolean;
  userType?: 'staff' | 'client' | 'all'; // New: filter by user type
  // Column-specific filters
  name?: string;
  phone?: string;
  city?: string;
  gender?: string;
  joinDateFrom?: string;
  joinDateTo?: string;
  branchId?: number | null;
}

@Injectable()
export class UsersService {
  private readonly logger = new Logger(UsersService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly tenantService: TenantService,
    private readonly notificationHelper: NotificationHelperService,
    private readonly notificationsService: NotificationsService,
    private readonly lookupsService: LookupsService,
    private readonly activityLogsService: ActivityLogsService,
  ) {}

  /**
   * Get status ID from status code string
   * Returns null if lookup not found
   */
  private async getStatusId(statusCode: string): Promise<number | null> {
    return this.lookupsService.getLookupId(USER_STATUS_LOOKUP_TYPE, statusCode);
  }

  /**
   * Get status code from status ID
   * Returns null if lookup not found
   */
  private async getStatusCode(statusId: number): Promise<string | null> {
    return this.lookupsService.getLookupCode(statusId);
  }

  /**
   * Check if email already exists in any tenant schema across all gyms.
   * Returns gym name and role if found, null otherwise.
   */
  private async emailExistsInAnyTenant(
    email: string,
    excludeGymId?: number,
  ): Promise<{ gymName: string; role: string } | null> {
    const gyms = await this.prisma.gym.findMany({
      where: { isActive: true, tenantSchemaName: { not: null } },
      select: { id: true, name: true },
    });

    const BATCH_SIZE = 10;
    for (let i = 0; i < gyms.length; i += BATCH_SIZE) {
      const batch = gyms.slice(i, i + BATCH_SIZE);
      const results = await Promise.allSettled(
        batch.map(async (gym) => {
          if (excludeGymId && gym.id === excludeGymId) return null;

          const schemaExists = await this.tenantService.tenantSchemaExists(gym.id);
          if (!schemaExists) return null;

          const user = await this.tenantService.executeInTenant(gym.id, async (client) => {
            const result = await client.query(
              `SELECT role FROM users WHERE email = $1 AND (is_deleted = FALSE OR is_deleted IS NULL) LIMIT 1`,
              [email],
            );
            return result.rows[0];
          });

          return user ? { gymName: gym.name, role: user.role } : null;
        }),
      );

      for (const result of results) {
        if (result.status === 'fulfilled' && result.value) {
          return result.value;
        }
      }
    }
    return null;
  }

  /**
   * Role hierarchy for user management
   * Higher level can manage lower levels
   * admin > manager > trainer > client
   */
  private readonly ROLE_HIERARCHY: Record<string, string[]> = {
    [ROLES.SUPERADMIN]: [ROLES.ADMIN, ROLES.MANAGER, ROLES.TRAINER, ROLES.CLIENT],
    [ROLES.ADMIN]: [ROLES.ADMIN, ROLES.MANAGER, ROLES.TRAINER, ROLES.CLIENT],
    [ROLES.MANAGER]: [ROLES.MANAGER, ROLES.TRAINER, ROLES.CLIENT],
    [ROLES.TRAINER]: [ROLES.TRAINER, ROLES.CLIENT],
    [ROLES.CLIENT]: [ROLES.CLIENT],
  };

  /**
   * Check if caller role can manage target role
   */
  private canManageRole(callerRole: string, targetRole: string): boolean {
    const allowedRoles = this.ROLE_HIERARCHY[callerRole] || [];
    return allowedRoles.includes(targetRole);
  }

  /**
   * Validate role hierarchy - throws if caller cannot manage target role
   */
  private validateRoleHierarchy(
    callerRole: string,
    targetRole: string,
    action: string = 'create',
  ): void {
    if (!this.canManageRole(callerRole, targetRole)) {
      throw new BadRequestException(
        `${callerRole} cannot ${action} users with role '${targetRole}'. ` +
          `Allowed roles: ${this.ROLE_HIERARCHY[callerRole]?.join(', ') || 'none'}`,
      );
    }
  }

  private formatAdminUser(user: Record<string, any>, gymAssignments?: Record<string, any>[]) {
    const primaryAssignment =
      gymAssignments?.find((a) => a.isPrimary) || gymAssignments?.[0];
    return {
      id: user.id,
      name: user.name,
      email: user.email,
      phone: user.phone,
      avatar: user.avatar,
      bio: user.bio,
      role: primaryAssignment?.role || ROLES.ADMIN,
      status: user.status,
      dateOfBirth: user.dateOfBirth,
      gender: user.gender,
      address: user.address,
      city: user.city,
      state: user.state,
      zipCode: user.zipCode,
      authType: user.authType || 'email',
      userType: 'admin',
      gymId: primaryAssignment?.gymId || null,
      gym: primaryAssignment?.gym
        ? {
            id: primaryAssignment.gym.id,
            name: primaryAssignment.gym.name,
            logo: primaryAssignment.gym.logo,
            city: primaryAssignment.gym.city,
            state: primaryAssignment.gym.state,
          }
        : null,
      gyms:
        gymAssignments?.map((a) => ({
          gymId: a.gymId,
          gymName: a.gym?.name,
          role: a.role,
          isPrimary: a.isPrimary,
        })) || [],
      createdAt: user.createdAt,
      updatedAt: user.updatedAt,
    };
  }

  private formatTenantUser(user: Record<string, any>, gym?: Record<string, any> | null) {
    const role = user.role || ROLES.CLIENT;

    return {
      id: user.id,
      name: user.name,
      email: user.email,
      phone: user.phone,
      avatar: user.avatar,
      bio: user.bio,
      role: role,
      status: user.status,
      dateOfBirth: user.date_of_birth || user.dateOfBirth,
      gender: user.gender,
      address: user.address,
      city: user.city,
      state: user.state,
      zipCode: user.zip_code || user.zipCode,
      attendanceCode:
        role === ROLES.CLIENT
          ? user.attendance_code || user.attendanceCode
          : undefined,
      emergencyContactName:
        user.emergency_contact_name || user.emergencyContactName,
      emergencyContactPhone:
        user.emergency_contact_phone || user.emergencyContactPhone,
      referredBy: user.referred_by || user.referredBy,
      referralCode: user.referral_code || user.referralCode,
      leadSource: user.lead_source || user.leadSource,
      occupation: user.occupation,
      bloodGroup: user.blood_group || user.bloodGroup,
      medicalConditions: user.medical_conditions || user.medicalConditions,
      fitnessGoal: user.fitness_goal || user.fitnessGoal,
      preferredTimeSlot: user.preferred_time_slot || user.preferredTimeSlot,
      nationality: user.nationality,
      idType: user.id_type || user.idType,
      idNumber: user.id_number || user.idNumber,
      managerPermissions: user.manager_permissions || user.managerPermissions || null,
      branchId: user.branch_id ?? user.branchId ?? null,
      branchIds: (() => {
        const raw = user.allowed_branch_ids ?? user.allowedBranchIds;
        if (!raw) return [];
        if (Array.isArray(raw)) return raw;
        try { return JSON.parse(raw); } catch { return []; }
      })(),
      userType: role === ROLES.CLIENT ? 'client' : 'staff',
      gymId: gym?.id,
      gym: gym
        ? {
            id: gym.id,
            name: gym.name,
            logo: gym.logo,
            city: gym.city,
            state: gym.state,
          }
        : null,
      createdAt: user.created_at || user.createdAt,
      updatedAt: user.updated_at || user.updatedAt,
    };
  }

  // ============================================
  // ADMIN OPERATIONS (public.users - only for gym owners)
  // ============================================

  /**
   * Create a new admin (gym owner) in public.users
   * Note: This is typically done via registerAdminWithGym in auth service
   */
  async createAdmin(dto: CreateStaffDto, gymId: number): Promise<any> {
    if (dto.role !== ROLES.ADMIN) {
      throw new BadRequestException(
        'This method is only for creating admins. Use createStaff for manager/trainer.',
      );
    }

    if (!dto.password) {
      throw new BadRequestException('Password is required');
    }

    // Check if email already exists in public.users
    const existingUser = await this.prisma.user.findUnique({
      where: { email: dto.email },
    });

    if (existingUser) {
      throw new ConflictException('User with this email already exists');
    }

    // Also check system_users
    const existingSystemUser = await this.prisma.systemUser.findUnique({
      where: { email: dto.email },
    });

    if (existingSystemUser) {
      throw new ConflictException('Email already exists as a system user');
    }

    // Check if email already exists in any tenant schema across all gyms
    const emailExistsInTenant = await this.emailExistsInAnyTenant(dto.email);
    if (emailExistsInTenant) {
      throw new ConflictException(
        `This email is already registered as a ${emailExistsInTenant.role} in "${emailExistsInTenant.gymName}". Please delete the user from that gym first.`,
      );
    }

    const passwordHash = await hashPassword(dto.password);
    const status = dto.status || USER_STATUS.ACTIVE;
    const statusId = await this.getStatusId(status);

    // Create admin in public.users
    const createdUser = await this.prisma.user.create({
      data: {
        email: dto.email,
        passwordHash,
        name: dto.name,
        phone: dto.phone,
        avatar: dto.avatar,
        bio: dto.bio,
        dateOfBirth: dto.dateOfBirth ? new Date(dto.dateOfBirth) : null,
        gender: dto.gender,
        address: dto.address,
        city: dto.city,
        state: dto.state,
        zipCode: dto.zipCode,
        status,
        statusId,
      },
    });

    // Create gym assignment
    const assignment = await this.prisma.userGymXref.create({
      data: {
        userId: createdUser.id,
        gymId,
        role: ROLES.ADMIN,
        isPrimary: false, // Only the first admin is primary
        isActive: true,
      },
      include: { gym: true },
    });

    // Notify existing admins about new admin
    await this.notificationHelper.notifyStaff(gymId, {
      type: NotificationType.NEW_STAFF_ADDED,
      title: 'New Admin Added',
      message: `${dto.name} has been added as admin.`,
      data: {
        entityId: createdUser.id,
        entityType: 'user',
        userId: createdUser.id,
        metadata: { name: dto.name, email: dto.email, role: ROLES.ADMIN },
      },
    });

    return this.formatAdminUser(createdUser, [assignment]);
  }

  /**
   * Get all admins for a gym
   */
  async findAllAdmins(filters: UserFilters): Promise<PaginatedResponse<any>> {
    const { page, limit, skip, take, noPagination } =
      getPaginationParams(filters);
    const gymId = filters.gymId;

    const where: Record<string, any> = {
      isDeleted: false,
      gymAssignments: {
        some: {
          ...(gymId && { gymId }),
          role: ROLES.ADMIN,
          isActive: true,
        },
      },
    };

    // Filter by status
    if (filters.status && filters.status !== 'all') {
      where.status = filters.status;
    }

    // Search
    if (filters.search) {
      where.OR = [
        { name: { contains: filters.search, mode: 'insensitive' } },
        { email: { contains: filters.search, mode: 'insensitive' } },
        { phone: { contains: filters.search, mode: 'insensitive' } },
      ];
    }

    const total = await this.prisma.user.count({ where });

    const users = await this.prisma.user.findMany({
      where,
      include: {
        gymAssignments: {
          where: gymId ? { gymId, isActive: true } : { isActive: true },
          include: { gym: true },
        },
      },
      orderBy: { createdAt: 'desc' },
      skip,
      take,
    });

    return {
      data: users.map((user) =>
        this.formatAdminUser(user, user.gymAssignments),
      ),
      pagination: createPaginationMeta(total, page, limit, noPagination),
    };
  }

  /**
   * Get a single admin
   */
  async findOneAdmin(id: number, gymId?: number): Promise<any> {
    const user = await this.prisma.user.findUnique({
      where: { id, isDeleted: false },
      include: {
        gymAssignments: {
          where: gymId ? { gymId, isActive: true } : { isActive: true },
          include: { gym: true },
        },
      },
    });

    if (!user) {
      throw new NotFoundException(`Admin with ID ${id} not found`);
    }

    return this.formatAdminUser(user, user.gymAssignments);
  }

  /**
   * Update an admin
   */
  async updateAdmin(
    id: number,
    gymId: number,
    updateDto: UpdateUserDto,
  ): Promise<any> {
    const user = await this.prisma.user.findUnique({
      where: { id, isDeleted: false },
    });

    if (!user) {
      throw new NotFoundException(`Admin with ID ${id} not found`);
    }

    const { role, ...updateData } = updateDto;

    // Get status_id if status is being updated
    let statusId: number | null | undefined = undefined;
    if (updateData.status) {
      statusId = await this.getStatusId(updateData.status);
    }

    // Update user data
    await this.prisma.user.update({
      where: { id },
      data: {
        ...(updateData.name && { name: updateData.name }),
        ...(updateData.phone !== undefined && { phone: updateData.phone }),
        ...(updateData.avatar !== undefined && { avatar: updateData.avatar }),
        ...(updateData.bio !== undefined && { bio: updateData.bio }),
        ...(updateData.status && { status: updateData.status, statusId }),
        ...(updateData.dateOfBirth !== undefined && {
          dateOfBirth: updateData.dateOfBirth
            ? new Date(updateData.dateOfBirth)
            : null,
        }),
        ...(updateData.gender !== undefined && { gender: updateData.gender }),
        ...(updateData.address !== undefined && {
          address: updateData.address,
        }),
        ...(updateData.city !== undefined && { city: updateData.city }),
        ...(updateData.state !== undefined && { state: updateData.state }),
        ...(updateData.zipCode !== undefined && {
          zipCode: updateData.zipCode,
        }),
      },
    });

    // Refresh user with gym assignments
    const refreshedUser = await this.prisma.user.findUnique({
      where: { id },
      include: {
        gymAssignments: {
          where: { gymId, isActive: true },
          include: { gym: true },
        },
      },
    });

    return this.formatAdminUser(refreshedUser!, refreshedUser!.gymAssignments);
  }

  /**
   * Update superadmin profile (no gym context required)
   * Used for profile updates like name for superadmin users
   * Note: SystemUser model only supports name updates currently
   */
  async updateSuperadminProfile(
    id: number,
    updateData: { avatar?: string; name?: string; phone?: string; bio?: string },
  ): Promise<any> {
    // Superadmins are stored in system_users table
    const user = await this.prisma.systemUser.findUnique({
      where: { id },
    });

    if (!user) {
      throw new NotFoundException(`Superadmin with ID ${id} not found`);
    }

    if (user.role !== ROLES.SUPERADMIN) {
      throw new BadRequestException('This method is only for superadmin users');
    }

    // Update user data (SystemUser only has name field available for update)
    const updatedUser = await this.prisma.systemUser.update({
      where: { id },
      data: {
        ...(updateData.name !== undefined && { name: updateData.name }),
      },
    });

    return {
      id: updatedUser.id,
      email: updatedUser.email,
      name: updatedUser.name,
      role: updatedUser.role,
    };
  }

  /**
   * Soft delete an admin
   */
  async removeAdmin(id: number, deletedById?: number): Promise<{ success: boolean }> {
    const user = await this.prisma.user.findUnique({
      where: { id, isDeleted: false },
    });

    if (!user) {
      throw new NotFoundException(`Admin with ID ${id} not found`);
    }

    // Check if user is primary admin of any gym
    const primaryAdminAssignments = await this.prisma.userGymXref.findMany({
      where: { userId: id, role: ROLES.ADMIN, isPrimary: true, isActive: true },
    });

    if (primaryAdminAssignments.length > 0) {
      throw new BadRequestException(
        'Cannot delete user. User is the primary admin of one or more gyms. Please transfer ownership first.',
      );
    }

    // Soft delete with deleted_by tracking
    await this.prisma.user.update({
      where: { id },
      data: {
        isDeleted: true,
        deletedAt: new Date(),
        deletedBy: deletedById || null,
      },
    });

    // Deactivate all gym assignments
    await this.prisma.userGymXref.updateMany({
      where: { userId: id },
      data: { isActive: false },
    });

    return { success: true };
  }

  // ============================================
  // STAFF OPERATIONS (tenant.users - manager, trainer)
  // ============================================

  /**
   * Create a new staff member (manager, trainer) in tenant.users
   */
  async createStaff(
    dto: CreateStaffDto,
    gymId: number,
    actorInfo?: { id: number; name: string; role: string },
  ): Promise<any> {
    if (!dto.password) {
      throw new BadRequestException('Password is required');
    }

    const role = dto.role || ROLES.TRAINER;
    if (role === ROLES.ADMIN) {
      return this.createAdmin(dto, gymId);
    }

    if (!([ROLES.MANAGER, ROLES.TRAINER] as string[]).includes(role)) {
      throw new BadRequestException(
        'Invalid role. Staff role must be manager or trainer.',
      );
    }

    // Check subscription limit for maxStaff
    const subscription = await this.prisma.saasGymSubscription.findUnique({
      where: { gymId },
      include: { plan: true },
    });

    if (subscription?.plan) {
      const maxStaff = subscription.plan.maxStaff;
      // -1 means unlimited
      if (maxStaff !== -1) {
        // Count current staff in the gym (managers, trainers)
        const currentStaffCount = await this.tenantService.executeInTenant(
          gymId,
          async (client) => {
            const result = await client.query(
              `SELECT COUNT(*)::int as count FROM users WHERE role IN ('manager', 'trainer') AND (is_deleted = FALSE OR is_deleted IS NULL)`,
            );
            return result.rows[0]?.count || 0;
          },
        );

        if (currentStaffCount >= maxStaff) {
          throw new BadRequestException(
            `You have reached the maximum limit of ${maxStaff} staff members for your subscription plan. Please upgrade your plan to add more staff.`,
          );
        }
      }
    }

    // Check if email already exists in public.users
    const existingAdmin = await this.prisma.user.findUnique({
      where: { email: dto.email },
    });

    if (existingAdmin) {
      throw new ConflictException('User with this email already exists');
    }

    // Check system_users
    const existingSystemUser = await this.prisma.systemUser.findUnique({
      where: { email: dto.email },
    });

    if (existingSystemUser) {
      throw new ConflictException('Email already exists as a system user');
    }

    // Check if email already exists in any other gym's tenant schema
    const existingInTenant = await this.emailExistsInAnyTenant(dto.email);
    if (existingInTenant) {
      throw new ConflictException(
        `This email is already registered as a ${existingInTenant.role} in "${existingInTenant.gymName}". Please delete the user from that gym first.`,
      );
    }

    const passwordHash = await hashPassword(dto.password);
    const status = dto.status || USER_STATUS.ACTIVE;
    const statusId = await this.getStatusId(status);

    // Create staff in tenant schema
    const createdStaff = await this.tenantService.executeInTenant(
      gymId,
      async (client) => {
        const result = await client.query(
          `INSERT INTO users (
          name, email, password_hash, phone, avatar, bio, role, status, status_id,
          date_of_birth, gender, address, city, state, zip_code,
          join_date, manager_permissions, branch_id, allowed_branch_ids, created_at, updated_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, NOW(), NOW())
        RETURNING *`,
          [
            dto.name,
            dto.email,
            passwordHash,
            dto.phone || null,
            dto.avatar || null,
            dto.bio || null,
            role,
            status,
            statusId,
            dto.dateOfBirth ? new Date(dto.dateOfBirth) : null,
            dto.gender || null,
            dto.address || null,
            dto.city || null,
            dto.state || null,
            dto.zipCode || null,
            new Date(),
            role === ROLES.MANAGER
              ? JSON.stringify(DEFAULT_MANAGER_PERMISSIONS)
              : null,
            dto.branchId || null,
            JSON.stringify(dto.allowedBranchIds || []),
          ],
        );

        const user = result.rows[0];

        return { user };
      },
    );

    const gym = await this.prisma.gym.findUnique({ where: { id: gymId } });

    // Log activity
    if (actorInfo) {
      await this.activityLogsService.logUserCreated(
        gymId,
        actorInfo.id,
        actorInfo.role,
        actorInfo.name,
        createdStaff.user.id,
        dto.name,
      );
    }

    // Notify admin about new staff
    await this.notificationHelper.notifyStaff(gymId, {
      type: NotificationType.NEW_STAFF_ADDED,
      title: 'New Staff Added',
      message: `${dto.name} has been added as ${role}.`,
      actionUrl: `/users/${createdStaff.user.id}`,
      data: {
        entityId: createdStaff.user.id,
        entityType: 'user',
        userId: createdStaff.user.id,
        metadata: { name: dto.name, email: dto.email, role },
      },
    });

    return this.formatTenantUser(
      createdStaff.user,
      gym,
    );
  }

  /**
   * Get all staff members (manager, trainer) for a gym from tenant schema
   */
  async findAllStaff(filters: UserFilters): Promise<PaginatedResponse<any>> {
    const { page, limit, skip, take, noPagination } =
      getPaginationParams(filters);
    const gymId = filters.gymId;

    if (!gymId) {
      throw new BadRequestException('gymId is required for fetching staff');
    }

    const { users, total } = await this.tenantService.executeInTenant(
      gymId,
      async (client) => {
        const conditions: string[] = [
          "u.role IN ('manager', 'trainer')",
          '(u.is_deleted = FALSE OR u.is_deleted IS NULL)',
        ];
        const values: SqlValue[] = [];
        let paramIndex = 1;

        if (
          filters.role &&
          filters.role !== 'all' &&
          ([ROLES.MANAGER, ROLES.TRAINER] as string[]).includes(filters.role)
        ) {
          conditions.push(`u.role = $${paramIndex++}`);
          values.push(filters.role);
        }

        if (filters.status && filters.status !== 'all') {
          conditions.push(`u.status = $${paramIndex++}`);
          values.push(filters.status);
        }

        if (filters.search) {
          conditions.push(
            `(u.name ILIKE $${paramIndex} OR u.email ILIKE $${paramIndex} OR u.phone ILIKE $${paramIndex})`,
          );
          values.push(`%${filters.search}%`);
          paramIndex++;
        }

        if (filters.branchId) {
          conditions.push(`u.branch_id = $${paramIndex++}`);
          values.push(filters.branchId);
        }

        const whereClause = conditions.join(' AND ');

        let query = `SELECT u.* FROM users u
           WHERE ${whereClause}
           ORDER BY u.created_at DESC`;
        const queryValues = [...values];

        if (!noPagination) {
          query += ` LIMIT $${paramIndex++} OFFSET $${paramIndex}`;
          queryValues.push(take, skip);
        }

        const [usersResult, countResult] = await Promise.all([
          client.query(query, queryValues),
          client.query(
            `SELECT COUNT(*) as count FROM users u WHERE ${whereClause}`,
            values,
          ),
        ]);

        return {
          users: usersResult.rows,
          total: parseInt(countResult.rows[0].count, 10),
        };
      },
    );

    const gym = await this.prisma.gym.findUnique({ where: { id: gymId } });

    return {
      data: users.map((user: Record<string, any>) => {
        return this.formatTenantUser(user, gym);
      }),
      pagination: createPaginationMeta(total, page, limit, noPagination),
    };
  }

  /**
   * Get a single staff member from tenant schema
   */
  async findOneStaff(id: number, gymId: number): Promise<any> {
    const staffData = await this.tenantService.executeInTenant(gymId, async (client) => {
      const result = await client.query(
        `SELECT * FROM users WHERE id = $1 AND role IN ('manager', 'trainer') AND (is_deleted = FALSE OR is_deleted IS NULL)`,
        [id],
      );
      return result.rows[0];
    });

    if (!staffData) {
      throw new NotFoundException(`Staff member with ID ${id} not found`);
    }

    const gym = await this.prisma.gym.findUnique({ where: { id: gymId } });
    return this.formatTenantUser(staffData, gym);
  }

  /**
   * Update a staff member in tenant schema
   */
  async updateStaff(
    id: number,
    gymId: number,
    updateDto: UpdateUserDto,
  ): Promise<any> {
    await this.findOneStaff(id, gymId);

    const updates: string[] = [];
    const values: SqlValue[] = [];
    let paramIndex = 1;

    if (updateDto.name) {
      updates.push(`name = $${paramIndex++}`);
      values.push(updateDto.name);
    }
    if (updateDto.phone !== undefined) {
      updates.push(`phone = $${paramIndex++}`);
      values.push(updateDto.phone);
    }
    if (updateDto.avatar !== undefined) {
      updates.push(`avatar = $${paramIndex++}`);
      values.push(updateDto.avatar);
    }
    if (updateDto.bio !== undefined) {
      updates.push(`bio = $${paramIndex++}`);
      values.push(updateDto.bio);
    }
    if (updateDto.status) {
      updates.push(`status = $${paramIndex++}`);
      values.push(updateDto.status);
      const statusId = await this.getStatusId(updateDto.status);
      if (statusId !== null) {
        updates.push(`status_id = $${paramIndex++}`);
        values.push(statusId);
      }
    }
    if (
      updateDto.role &&
      ([ROLES.MANAGER, ROLES.TRAINER] as string[]).includes(updateDto.role)
    ) {
      updates.push(`role = $${paramIndex++}`);
      values.push(updateDto.role);
    }
    if (updateDto.dateOfBirth !== undefined) {
      updates.push(`date_of_birth = $${paramIndex++}`);
      values.push(
        updateDto.dateOfBirth ? new Date(updateDto.dateOfBirth) : null,
      );
    }
    if (updateDto.gender !== undefined) {
      updates.push(`gender = $${paramIndex++}`);
      values.push(updateDto.gender);
    }
    if (updateDto.address !== undefined) {
      updates.push(`address = $${paramIndex++}`);
      values.push(updateDto.address);
    }
    if (updateDto.city !== undefined) {
      updates.push(`city = $${paramIndex++}`);
      values.push(updateDto.city);
    }
    if (updateDto.state !== undefined) {
      updates.push(`state = $${paramIndex++}`);
      values.push(updateDto.state);
    }
    if (updateDto.zipCode !== undefined) {
      updates.push(`zip_code = $${paramIndex++}`);
      values.push(updateDto.zipCode);
    }
    if (updateDto.allowedBranchIds !== undefined) {
      updates.push(`allowed_branch_ids = $${paramIndex++}`);
      values.push(JSON.stringify(updateDto.allowedBranchIds));
    }
    if (updates.length === 0) {
      return this.findOneStaff(id, gymId);
    }

    updates.push(`updated_at = NOW()`);
    values.push(id);

    const updatedStaff = await this.tenantService.executeInTenant(gymId, async (client) => {
      await client.query(
        `UPDATE users SET ${updates.join(', ')} WHERE id = $${paramIndex}`,
        values,
      );

      const result = await client.query(`SELECT * FROM users WHERE id = $1 AND (is_deleted = FALSE OR is_deleted IS NULL)`, [
        id,
      ]);
      return result.rows[0];
    });

    const gym = await this.prisma.gym.findUnique({ where: { id: gymId } });
    return this.formatTenantUser(updatedStaff, gym);
  }

  /**
   * Update manager permissions for a user in tenant schema
   */
  async updateManagerPermissions(
    id: number,
    gymId: number,
    permissions: Record<string, any>,
  ): Promise<any> {
    const result = await this.tenantService.executeInTenant(
      gymId,
      async (client) => {
        // Verify user exists
        const userResult = await client.query(
          `SELECT id, role FROM users WHERE id = $1 AND (is_deleted = FALSE OR is_deleted IS NULL)`,
          [id],
        );
        if (userResult.rows.length === 0) {
          throw new NotFoundException(`User with ID ${id} not found`);
        }

        await client.query(
          `UPDATE users SET manager_permissions = $1, updated_at = NOW() WHERE id = $2`,
          [JSON.stringify(permissions), id],
        );

        const updatedResult = await client.query(
          `SELECT * FROM users WHERE id = $1`,
          [id],
        );
        return updatedResult.rows[0];
      },
    );

    const gym = await this.prisma.gym.findUnique({ where: { id: gymId } });
    return this.formatTenantUser(result, gym);
  }

  /**
   * Delete a staff member (manager/trainer) from tenant schema — hard delete
   */
  async removeStaff(
    id: number,
    gymId: number,
    deletedById?: number,
  ): Promise<{ success: boolean }> {
    const staffData = await this.tenantService.executeInTenant(
      gymId,
      async (client) => {
        const result = await client.query(
          `SELECT * FROM users WHERE id = $1 AND role IN ('manager', 'trainer') AND (is_deleted = FALSE OR is_deleted IS NULL)`,
          [id],
        );
        return result.rows[0];
      },
    );

    if (!staffData) {
      throw new NotFoundException(`Staff member with ID ${id} not found`);
    }

    // Hard delete staff from tenant schema
    await this.tenantService.executeInTenant(gymId, async (client) => {
      await client.query(`DELETE FROM user_branch_xref WHERE user_id = $1`, [id]);
      await client.query(`DELETE FROM trainer_client_xref WHERE trainer_id = $1 OR client_id = $1`, [id]);
      await client.query(`DELETE FROM trainer_availability WHERE trainer_id = $1`, [id]);
      await client.query(`DELETE FROM appointments WHERE trainer_id = $1`, [id]);
      await client.query(`DELETE FROM users WHERE id = $1`, [id]);
    });

    return { success: true };
  }

  // ============================================
  // CLIENT OPERATIONS (tenant.users)
  // ============================================

  /**
   * Create a new client in tenant schema
   */
  async createClient(
    dto: CreateClientDto,
    gymId: number,
    actorInfo?: { id: number; name: string; role: string },
  ): Promise<any> {
    if (!dto.password) {
      throw new BadRequestException('Password is required');
    }

    // Check subscription limit for maxClients
    const subscription = await this.prisma.saasGymSubscription.findUnique({
      where: { gymId },
      include: { plan: true },
    });

    if (subscription?.plan) {
      const maxClients = subscription.plan.maxClients;
      // -1 means unlimited
      if (maxClients !== -1) {
        // Count current clients in the gym
        const currentClientCount = await this.tenantService.executeInTenant(
          gymId,
          async (client) => {
            const result = await client.query(
              `SELECT COUNT(*)::int as count FROM users WHERE role = 'client' AND (is_deleted = FALSE OR is_deleted IS NULL)`,
            );
            return result.rows[0]?.count || 0;
          },
        );

        if (currentClientCount >= maxClients) {
          throw new BadRequestException(
            `You have reached the maximum limit of ${maxClients} clients for your subscription plan. Please upgrade your plan to add more clients.`,
          );
        }
      }
    }

    // Check if email already exists in public.users (admin) or system_users (superadmin)
    const [existingAdmin, existingSystemUser] = await Promise.all([
      this.prisma.user.findUnique({ where: { email: dto.email } }),
      this.prisma.systemUser.findUnique({ where: { email: dto.email } }),
    ]);

    if (existingAdmin) {
      throw new ConflictException('User with this email already exists');
    }
    if (existingSystemUser) {
      throw new ConflictException('User with this email already exists');
    }

    // Check if email already exists in any tenant schema across all gyms
    const emailExists = await this.emailExistsInAnyTenant(dto.email);
    if (emailExists) {
      throw new ConflictException(
        `This email is already registered as a ${emailExists.role} in "${emailExists.gymName}". Please delete the user from that gym first.`,
      );
    }

    const status = dto.status || USER_STATUS.ACTIVE;
    const [passwordHash, attendanceCode, statusId] = await Promise.all([
      hashPassword(dto.password),
      generateUniqueAttendanceCode(gymId, this.tenantService),
      this.getStatusId(status),
    ]);

    // Create client in tenant schema with role='client'
    let createdClient: Record<string, any>;
    try {
    createdClient = await this.tenantService.executeInTenant(
      gymId,
      async (client) => {
        const result = await client.query(
          `INSERT INTO users (
          name, email, password_hash, phone, avatar, bio, role, status, status_id,
          date_of_birth, gender, address, city, state, zip_code,
          emergency_contact_name, emergency_contact_phone,
          referred_by, referral_code, lead_source, occupation, blood_group,
          medical_conditions, fitness_goal, preferred_time_slot, nationality, id_type, id_number,
          join_date, attendance_code, branch_id, created_at, updated_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22, $23, $24, $25, $26, $27, $28, $29, $30, $31, NOW(), NOW())
        RETURNING *`,
          [
            dto.name,
            dto.email,
            passwordHash,
            dto.phone || null,
            dto.avatar || null,
            dto.bio || null,
            ROLES.CLIENT, // role is always 'client' for clients
            status,
            statusId,
            dto.dateOfBirth ? new Date(dto.dateOfBirth) : null,
            dto.gender || null,
            dto.address || null,
            dto.city || null,
            dto.state || null,
            dto.zipCode || null,
            dto.emergencyContactName || null,
            dto.emergencyContactPhone || null,
            dto.referredBy || null,
            dto.referralCode || null,
            dto.leadSource || null,
            dto.occupation || null,
            dto.bloodGroup || null,
            dto.medicalConditions || null,
            dto.fitnessGoal || null,
            dto.preferredTimeSlot || null,
            dto.nationality || null,
            dto.idType || null,
            dto.idNumber || null,
            new Date(),
            attendanceCode,
            dto.branchId || null,
          ],
        );
        return result.rows[0];
      },
    );
    } catch (error: any) {
      if (error?.code === '23505' || error?.message?.includes('duplicate key')) {
        throw new ConflictException('A user with this email already exists in this gym');
      }
      throw error;
    }

    const gym = await this.prisma.gym.findUnique({ where: { id: gymId } });

    // Log activity
    if (actorInfo) {
      await this.activityLogsService.logUserCreated(
        gymId,
        actorInfo.id,
        actorInfo.role,
        actorInfo.name,
        createdClient.id,
        dto.name,
      );
    }

    return this.formatTenantUser(createdClient, gym);
  }

  /**
   * Get user counts grouped by status for a specific role
   */
  async getStatusCounts(
    role: string,
    gymId: number | undefined,
    branchId?: number | null,
  ): Promise<Record<string, number>> {
    if (!gymId) {
      throw new BadRequestException('gymId is required for fetching status counts');
    }

    const counts = await this.tenantService.executeInTenant(
      gymId,
      async (client) => {
        const conditions: string[] = [
          `u.role = $1`,
          '(u.is_deleted = FALSE OR u.is_deleted IS NULL)',
        ];
        const values: SqlValue[] = [role];
        let paramIndex = 2;

        if (branchId) {
          conditions.push(`u.branch_id = $${paramIndex++}`);
          values.push(branchId);
        }

        const whereClause = conditions.join(' AND ');
        const result = await client.query(
          `SELECT u.status, COUNT(*)::int as count FROM users u
           WHERE ${whereClause}
           GROUP BY u.status`,
          values,
        );

        const statusCounts: Record<string, number> = {};
        for (const row of result.rows) {
          statusCounts[row.status] = row.count;
        }
        return statusCounts;
      },
    );

    return counts;
  }

  /**
   * Get all clients for a gym (role='client' in tenant schema)
   */
  async findAllClients(filters: UserFilters): Promise<PaginatedResponse<any>> {
    const { page, limit, skip, take, noPagination } =
      getPaginationParams(filters);
    const gymId = filters.gymId;

    if (!gymId) {
      throw new BadRequestException('gymId is required for fetching clients');
    }

    const { users, total } = await this.tenantService.executeInTenant(
      gymId,
      async (client) => {
        const conditions: string[] = [
          "u.role = 'client'",
          '(u.is_deleted = FALSE OR u.is_deleted IS NULL)',
        ]; // Filter only clients, exclude soft-deleted
        const values: SqlValue[] = [];
        let paramIndex = 1;

        if (filters.status && filters.status !== 'all') {
          conditions.push(`u.status = $${paramIndex++}`);
          values.push(filters.status);
        }

        if (filters.search) {
          conditions.push(
            `(u.name ILIKE $${paramIndex} OR u.email ILIKE $${paramIndex} OR u.phone ILIKE $${paramIndex})`,
          );
          values.push(`%${filters.search}%`);
          paramIndex++;
        }

        // Column-specific filters
        if (filters.name) {
          conditions.push(`u.name ILIKE $${paramIndex++}`);
          values.push(`%${filters.name}%`);
        }

        if (filters.phone) {
          conditions.push(`u.phone ILIKE $${paramIndex++}`);
          values.push(`%${filters.phone}%`);
        }

        if (filters.city) {
          conditions.push(`u.city ILIKE $${paramIndex++}`);
          values.push(`%${filters.city}%`);
        }

        if (filters.gender) {
          conditions.push(`u.gender = $${paramIndex++}`);
          values.push(filters.gender);
        }

        if (filters.joinDateFrom) {
          conditions.push(`u.join_date >= $${paramIndex++}`);
          values.push(filters.joinDateFrom);
        }

        if (filters.joinDateTo) {
          conditions.push(`u.join_date <= $${paramIndex++}`);
          values.push(filters.joinDateTo + ' 23:59:59');
        }

        if (filters.branchId) {
          conditions.push(`u.branch_id = $${paramIndex++}`);
          values.push(filters.branchId);
        }

        const whereClause = conditions.join(' AND ');

        let query = `SELECT u.* FROM users u
           WHERE ${whereClause}
           ORDER BY u.created_at DESC`;
        const queryValues = [...values];

        if (!noPagination) {
          query += ` LIMIT $${paramIndex++} OFFSET $${paramIndex}`;
          queryValues.push(take, skip);
        }

        const [usersResult, countResult] = await Promise.all([
          client.query(query, queryValues),
          client.query(
            `SELECT COUNT(*) as count FROM users u WHERE ${whereClause}`,
            values,
          ),
        ]);

        return {
          users: usersResult.rows,
          total: parseInt(countResult.rows[0].count, 10),
        };
      },
    );

    const gym = await this.prisma.gym.findUnique({ where: { id: gymId } });

    return {
      data: users.map((user: Record<string, any>) => this.formatTenantUser(user, gym)),
      pagination: createPaginationMeta(total, page, limit, noPagination),
    };
  }

  /**
   * Get a single client (role='client' in tenant schema)
   * Includes membership details (active membership + history)
   */
  async findOneClient(id: number, gymId: number): Promise<any> {
    const { clientData, activeMembership, membershipHistory } =
      await this.tenantService.executeInTenant(gymId, async (client) => {
        const result = await client.query(
          `SELECT u.*
           FROM users u
           WHERE u.id = $1 AND u.role = 'client' AND (u.is_deleted = FALSE OR u.is_deleted IS NULL)`,
          [id],
        );
        const userData = result.rows[0];

        // Fetch active membership
        let activeMembershipData = null;
        if (userData) {
          const now = new Date();
          const activeMembershipResult = await client.query(
            `SELECT m.*, p.name as plan_name, p.code as plan_code, p.price as plan_price,
                    o.name as offer_name, o.code as offer_code
             FROM memberships m
             LEFT JOIN plans p ON p.id = m.plan_id
             LEFT JOIN offers o ON o.id = m.offer_id
             WHERE m.user_id = $1 AND m.status = 'active'
               AND m.start_date <= $2 AND m.end_date >= $2
               AND (m.is_deleted = FALSE OR m.is_deleted IS NULL)
             ORDER BY m.created_at DESC LIMIT 1`,
            [id, now],
          );
          activeMembershipData = activeMembershipResult.rows[0] || null;
        }

        // Fetch membership history (last 10 memberships)
        let membershipHistoryData: Record<string, any>[] = [];
        if (userData) {
          const historyResult = await client.query(
            `SELECT m.*, p.name as plan_name, p.code as plan_code, p.price as plan_price,
                    o.name as offer_name, o.code as offer_code
             FROM memberships m
             LEFT JOIN plans p ON p.id = m.plan_id
             LEFT JOIN offers o ON o.id = m.offer_id
             WHERE m.user_id = $1 AND (m.is_deleted = FALSE OR m.is_deleted IS NULL)
             ORDER BY m.created_at DESC LIMIT 10`,
            [id],
          );
          membershipHistoryData = historyResult.rows;
        }

        return {
          clientData: userData,
          activeMembership: activeMembershipData,
          membershipHistory: membershipHistoryData,
        };
      });

    if (!clientData) {
      throw new NotFoundException(`Client with ID ${id} not found`);
    }

    const gym = await this.prisma.gym.findUnique({ where: { id: gymId } });
    const formattedUser = this.formatTenantUser(clientData, gym);

    // Format and add membership data
    const formatMembership = (m: Record<string, any> | null) => {
      if (!m) return null;
      const now = new Date();
      const startDate = new Date(m.start_date);
      const endDate = new Date(m.end_date);
      const daysRemaining = Math.max(0, Math.ceil((endDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)));

      // Calculate progress percentage
      let progress = 0;
      if (now >= endDate) {
        progress = 100;
      } else if (now <= startDate) {
        progress = 0;
      } else {
        const total = endDate.getTime() - startDate.getTime();
        const elapsed = now.getTime() - startDate.getTime();
        progress = Math.round((elapsed / total) * 100);
      }

      return {
        id: m.id,
        planId: m.plan_id,
        offerId: m.offer_id,
        startDate: m.start_date,
        endDate: m.end_date,
        status: m.status,
        originalAmount: m.original_amount,
        discountAmount: m.discount_amount,
        finalAmount: m.final_amount,
        currency: m.currency,
        paymentStatus: m.payment_status,
        paymentMethod: m.payment_method,
        paidAt: m.paid_at,
        daysRemaining,
        progress,
        isEndingSoon: daysRemaining > 0 && daysRemaining <= 14,
        plan: m.plan_name ? {
          id: m.plan_id,
          name: m.plan_name,
          code: m.plan_code,
          price: m.plan_price,
        } : null,
        offer: m.offer_name ? {
          id: m.offer_id,
          name: m.offer_name,
          code: m.offer_code,
        } : null,
        createdAt: m.created_at,
        updatedAt: m.updated_at,
      };
    };

    return {
      ...formattedUser,
      activeMembership: formatMembership(activeMembership),
      membershipHistory: membershipHistory.map(formatMembership),
    };
  }

  /**
   * Update a client
   */
  async updateClient(
    id: number,
    gymId: number,
    updateDto: UpdateUserDto,
  ): Promise<any> {
    await this.findOneClient(id, gymId);

    const updates: string[] = [];
    const values: SqlValue[] = [];
    let paramIndex = 1;

    if (updateDto.name) {
      updates.push(`name = $${paramIndex++}`);
      values.push(updateDto.name);
    }
    if (updateDto.phone !== undefined) {
      updates.push(`phone = $${paramIndex++}`);
      values.push(updateDto.phone);
    }
    if (updateDto.avatar !== undefined) {
      updates.push(`avatar = $${paramIndex++}`);
      values.push(updateDto.avatar);
    }
    if (updateDto.bio !== undefined) {
      updates.push(`bio = $${paramIndex++}`);
      values.push(updateDto.bio);
    }
    if (updateDto.status) {
      updates.push(`status = $${paramIndex++}`);
      values.push(updateDto.status);
      const statusId = await this.getStatusId(updateDto.status);
      if (statusId !== null) {
        updates.push(`status_id = $${paramIndex++}`);
        values.push(statusId);
      }
    }
    if (updateDto.dateOfBirth !== undefined) {
      updates.push(`date_of_birth = $${paramIndex++}`);
      values.push(
        updateDto.dateOfBirth ? new Date(updateDto.dateOfBirth) : null,
      );
    }
    if (updateDto.gender !== undefined) {
      updates.push(`gender = $${paramIndex++}`);
      values.push(updateDto.gender);
    }
    if (updateDto.address !== undefined) {
      updates.push(`address = $${paramIndex++}`);
      values.push(updateDto.address);
    }
    if (updateDto.city !== undefined) {
      updates.push(`city = $${paramIndex++}`);
      values.push(updateDto.city);
    }
    if (updateDto.state !== undefined) {
      updates.push(`state = $${paramIndex++}`);
      values.push(updateDto.state);
    }
    if (updateDto.zipCode !== undefined) {
      updates.push(`zip_code = $${paramIndex++}`);
      values.push(updateDto.zipCode);
    }
    if (updateDto.emergencyContactName !== undefined) {
      updates.push(`emergency_contact_name = $${paramIndex++}`);
      values.push(updateDto.emergencyContactName);
    }
    if (updateDto.emergencyContactPhone !== undefined) {
      updates.push(`emergency_contact_phone = $${paramIndex++}`);
      values.push(updateDto.emergencyContactPhone);
    }
    if (updateDto.referredBy !== undefined) {
      updates.push(`referred_by = $${paramIndex++}`);
      values.push(updateDto.referredBy);
    }
    if (updateDto.referralCode !== undefined) {
      updates.push(`referral_code = $${paramIndex++}`);
      values.push(updateDto.referralCode);
    }
    if (updateDto.leadSource !== undefined) {
      updates.push(`lead_source = $${paramIndex++}`);
      values.push(updateDto.leadSource);
    }
    if (updateDto.occupation !== undefined) {
      updates.push(`occupation = $${paramIndex++}`);
      values.push(updateDto.occupation);
    }
    if (updateDto.bloodGroup !== undefined) {
      updates.push(`blood_group = $${paramIndex++}`);
      values.push(updateDto.bloodGroup);
    }
    if (updateDto.medicalConditions !== undefined) {
      updates.push(`medical_conditions = $${paramIndex++}`);
      values.push(updateDto.medicalConditions);
    }
    if (updateDto.fitnessGoal !== undefined) {
      updates.push(`fitness_goal = $${paramIndex++}`);
      values.push(updateDto.fitnessGoal);
    }
    if (updateDto.preferredTimeSlot !== undefined) {
      updates.push(`preferred_time_slot = $${paramIndex++}`);
      values.push(updateDto.preferredTimeSlot);
    }
    if (updateDto.nationality !== undefined) {
      updates.push(`nationality = $${paramIndex++}`);
      values.push(updateDto.nationality);
    }
    if (updateDto.idType !== undefined) {
      updates.push(`id_type = $${paramIndex++}`);
      values.push(updateDto.idType);
    }
    if (updateDto.idNumber !== undefined) {
      updates.push(`id_number = $${paramIndex++}`);
      values.push(updateDto.idNumber);
    }
    if (updateDto.branchId !== undefined) {
      updates.push(`branch_id = $${paramIndex++}`);
      values.push(updateDto.branchId ?? null);
    }
    updates.push(`updated_at = NOW()`);
    values.push(id);

    const updatedClient = await this.tenantService.executeInTenant(
      gymId,
      async (client) => {
        await client.query(
          `UPDATE users SET ${updates.join(', ')} WHERE id = $${paramIndex} AND role = 'client'`,
          values,
        );

        const result = await client.query(`SELECT * FROM users WHERE id = $1 AND (is_deleted = FALSE OR is_deleted IS NULL)`, [
          id,
        ]);
        return result.rows[0];
      },
    );

    const gym = await this.prisma.gym.findUnique({ where: { id: gymId } });
    return this.formatTenantUser(updatedClient, gym);
  }

  /**
   * Delete a client (role='client' in tenant schema) - uses soft delete
   */
  async removeClient(
    id: number,
    gymId: number,
    deletedById?: number,
  ): Promise<{ success: boolean }> {
    const clientData = await this.tenantService.executeInTenant(
      gymId,
      async (client) => {
        const result = await client.query(
          `SELECT * FROM users WHERE id = $1 AND role = 'client' AND (is_deleted = FALSE OR is_deleted IS NULL)`,
          [id],
        );
        return result.rows[0];
      },
    );

    if (!clientData) {
      throw new NotFoundException(`Client with ID ${id} not found`);
    }

    // Cancel any active memberships before deleting
    await this.tenantService.executeInTenant(gymId, async (client) => {
      await client.query(
        `UPDATE memberships SET status = 'cancelled', updated_at = NOW()
         WHERE user_id = $1 AND status IN ('active', 'pending')
         AND (is_deleted = FALSE OR is_deleted IS NULL)`,
        [id],
      );
    });

    // Hard delete client and all related records from tenant schema
    await this.tenantService.executeInTenant(gymId, async (client) => {
      // Delete all related records (order matters — FK dependencies)
      await client.query(`DELETE FROM payments WHERE payer_id = $1`, [id]);
      await client.query(`DELETE FROM memberships WHERE user_id = $1`, [id]);
      await client.query(`DELETE FROM attendance WHERE user_id = $1`, [id]);
      await client.query(`DELETE FROM member_notes WHERE user_id = $1`, [id]);
      await client.query(`DELETE FROM class_bookings WHERE user_id = $1`, [id]);
      await client.query(`DELETE FROM appointments WHERE user_id = $1`, [id]);
      await client.query(`DELETE FROM product_sales WHERE user_id = $1`, [id]);
      await client.query(`DELETE FROM user_branch_xref WHERE user_id = $1`, [id]);
      await client.query(`DELETE FROM diet_assignments WHERE user_id = $1`, [id]);
      await client.query(`DELETE FROM body_metrics WHERE user_id = $1`, [id]);
      await client.query(`DELETE FROM body_metrics_history WHERE user_id = $1`, [id]);
      await client.query(`DELETE FROM notifications WHERE user_id = $1`, [id]);
      // Delete the user last
      await client.query(`DELETE FROM users WHERE id = $1`, [id]);
    });

    return { success: true };
  }

  // ============================================
  // COMBINED OPERATIONS (for backward compatibility)
  // Architecture: admin in public.users, manager/trainer/client in tenant.users
  // ============================================

  /**
   * Create user - determines type based on role
   * Validates role hierarchy: admin > manager > trainer > client
   */
  async create(
    createUserDto: CreateUserDto,
    gymId: number,
    callerRole?: string,
    actorInfo?: { id: number; name: string; role: string },
  ): Promise<any> {
    const role = createUserDto.role || ROLES.CLIENT;

    // Validate role hierarchy if callerRole is provided
    if (callerRole) {
      this.validateRoleHierarchy(callerRole, role, 'create');
    }

    if (role === ROLES.ADMIN) {
      return this.createAdmin(createUserDto as CreateStaffDto, gymId);
    } else if (role === ROLES.CLIENT) {
      return this.createClient(
        createUserDto as CreateClientDto,
        gymId,
        actorInfo,
      );
    } else {
      // manager or trainer
      return this.createStaff(createUserDto as CreateStaffDto, gymId, actorInfo);
    }
  }

  /**
   * Find all users - combines admin (public), staff and clients (tenant) based on filters
   * Superadmin can see all users across all gyms without specifying gymId
   */
  async findAll(filters: UserFilters): Promise<PaginatedResponse<any>> {
    const userType = filters.userType || 'all';
    const role = filters.role;
    const isSuperAdmin = filters.isSuperAdmin || false;

    // If role is 'admin', only get admins from public.users
    if (role === ROLES.ADMIN) {
      return this.findAllAdmins(filters);
    }

    // For non-superadmin, gymId is required for tenant queries
    if (!isSuperAdmin && !filters.gymId) {
      // If role requires tenant access, throw error
      if (
        role === ROLES.CLIENT ||
        role === ROLES.MANAGER ||
        role === ROLES.TRAINER ||
        userType !== 'all'
      ) {
        throw new BadRequestException('gymId is required for fetching users');
      }
    }

    // If superadmin without gymId, fetch from ALL gyms
    if (isSuperAdmin && !filters.gymId) {
      return this.findAllUsersAcrossGyms(filters);
    }

    // If role is 'client', only get clients from tenant.users
    if (role === ROLES.CLIENT) {
      return this.findAllClients(filters);
    }

    // If role is manager/trainer, only get staff from tenant.users
    if (role && ([ROLES.MANAGER, ROLES.TRAINER] as string[]).includes(role)) {
      return this.findAllStaff(filters);
    }

    // If userType is specified
    if (userType === 'staff') {
      return this.findAllStaff(filters);
    }
    if (userType === 'client') {
      return this.findAllClients(filters);
    }

    // For 'all' type with gymId, combine admin, staff and clients
    if (!filters.gymId) {
      throw new BadRequestException('gymId is required for fetching all users');
    }

    // Combine admin, staff and clients
    const { page, limit, noPagination } = getPaginationParams(filters);

    const [adminResult, staffResult, clientResult] = await Promise.all([
      this.findAllAdmins({ ...filters, noPagination: true }),
      this.findAllStaff({ ...filters, noPagination: true }),
      this.findAllClients({ ...filters, noPagination: true }),
    ]);

    const allUsers = [
      ...adminResult.data,
      ...staffResult.data,
      ...clientResult.data,
    ];
    const total = allUsers.length;

    // Sort by createdAt desc
    allUsers.sort(
      (a, b) =>
        new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
    );

    // Apply pagination
    const skip = (page - 1) * limit;
    const paginatedUsers = noPagination
      ? allUsers
      : allUsers.slice(skip, skip + limit);

    return {
      data: paginatedUsers,
      pagination: createPaginationMeta(total, page, limit, noPagination),
    };
  }

  /**
   * Find all users across ALL gyms (superadmin only)
   */
  private async findAllUsersAcrossGyms(
    filters: UserFilters,
  ): Promise<PaginatedResponse<any>> {
    const { page, limit, noPagination } = getPaginationParams(filters);

    // Get all active gyms
    const gyms = await this.prisma.gym.findMany({
      where: { isActive: true },
      select: { id: true, name: true },
    });

    // Get all admins from public.users
    const adminResult = await this.findAllAdmins({
      ...filters,
      noPagination: true,
    });
    let allUsers = [...adminResult.data];

    // Get staff and clients from each tenant
    for (const gym of gyms) {
      try {
        const [staffResult, clientResult] = await Promise.all([
          this.findAllStaff({ ...filters, gymId: gym.id, noPagination: true }),
          this.findAllClients({
            ...filters,
            gymId: gym.id,
            noPagination: true,
          }),
        ]);

        // Add gymName to each user for context
        const staffWithGym = staffResult.data.map((u: Record<string, any>) => ({
          ...u,
          gymName: gym.name,
        }));
        const clientsWithGym = clientResult.data.map((u: Record<string, any>) => ({
          ...u,
          gymName: gym.name,
        }));

        allUsers = [...allUsers, ...staffWithGym, ...clientsWithGym];
      } catch (error: unknown) {
        // Skip gyms that don't have tenant schema yet
        const msg = error instanceof Error ? error.message : String(error);
        this.logger.warn(
          `Could not fetch users for gym ${gym.id}: ${msg}`,
        );
      }
    }

    const total = allUsers.length;

    // Sort by createdAt desc
    allUsers.sort(
      (a, b) =>
        new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
    );

    // Apply pagination
    const skip = (page - 1) * limit;
    const paginatedUsers = noPagination
      ? allUsers
      : allUsers.slice(skip, skip + limit);

    return {
      data: paginatedUsers,
      pagination: createPaginationMeta(total, page, limit, noPagination),
    };
  }

  /**
   * Find one user by ID - checks admin (public) first, then tenant (staff/client)
   * If gymId is null/undefined (superadmin), searches across all gyms
   */
  async findOne(
    id: number,
    gymId?: number | null,
    userType?: 'admin' | 'staff' | 'client',
  ): Promise<any> {
    // If userType is specified, use that
    if (userType === 'admin') {
      return this.findOneAdmin(id, gymId ?? undefined);
    }
    if (userType === 'staff' && gymId) {
      return this.findOneStaff(id, gymId);
    }
    if (userType === 'client' && gymId) {
      return this.findOneClient(id, gymId);
    }

    // If gymId is provided, check tenant schema FIRST (avoids ID collision with public.users)
    if (gymId) {
      const tenantUser = await this.tenantService.executeInTenant(
        gymId,
        async (client) => {
          const result = await client.query(
            `SELECT id, role FROM users WHERE id = $1 AND (is_deleted = FALSE OR is_deleted IS NULL)`,
            [id],
          );
          return result.rows[0];
        },
      );

      if (tenantUser) {
        // If the user is a client, use findOneClient to include membership data
        if (tenantUser.role === ROLES.CLIENT) {
          return this.findOneClient(id, gymId);
        }
        // For staff, use findOneStaff
        return this.findOneStaff(id, gymId);
      }

      // Not found in tenant, try admin (public.users)
      try {
        const admin = await this.findOneAdmin(id, gymId);
        return admin;
      } catch (e) {
        // Not found in admin either
      }
    } else {
      // No gymId - try admin first (superadmin context)
      try {
        const admin = await this.findOneAdmin(id, undefined);
        return admin;
      } catch (e) {
        // Not found in admin, try tenant
      }
    }

    // No gymId (superadmin) - search across ALL tenant schemas
    if (!gymId) {
      // No gymId (superadmin) - search across ALL tenant schemas
      const gyms = await this.prisma.gym.findMany({
        where: { isActive: true },
        select: { id: true, name: true, logo: true, city: true, state: true },
      });

      for (const gym of gyms) {
        try {
          const tenantUser = await this.tenantService.executeInTenant(
            gym.id,
            async (client) => {
              const result = await client.query(
                `SELECT u.*
                 FROM users u
                 WHERE u.id = $1`,
                [id],
              );
              return result.rows[0];
            },
          );

          if (tenantUser) {
            return this.formatTenantUser(tenantUser, gym);
          }
        } catch (e) {
          // Tenant schema might not exist, continue to next gym
        }
      }
    }

    throw new NotFoundException(`User with ID ${id} not found`);
  }

  /**
   * Update user - determines location based on where user exists
   * Validates role hierarchy: admin > manager > trainer > client
   */
  async update(
    id: number,
    gymId: number,
    updateUserDto: UpdateUserDto,
    userType?: 'admin' | 'staff' | 'client',
    callerRole?: string,
  ): Promise<any> {
    // Helper to validate and update
    const validateAndUpdate = async (
      targetRole: string,
      updateFn: () => Promise<any>,
    ) => {
      if (callerRole) {
        this.validateRoleHierarchy(callerRole, targetRole, 'update');
      }
      return updateFn();
    };

    if (userType === 'admin') {
      if (callerRole) this.validateRoleHierarchy(callerRole, ROLES.ADMIN, 'update');
      return this.updateAdmin(id, gymId, updateUserDto);
    }
    if (userType === 'staff') {
      // Need to get role to validate hierarchy
      const staff = await this.findOneStaff(id, gymId);
      return validateAndUpdate(staff.role, () =>
        this.updateStaff(id, gymId, updateUserDto),
      );
    }
    if (userType === 'client') {
      if (callerRole)
        this.validateRoleHierarchy(callerRole, ROLES.CLIENT, 'update');
      return this.updateClient(id, gymId, updateUserDto);
    }

    // Check tenant schema FIRST when gymId is provided (clients/staff live here)
    // This prevents ID collision issues where same ID exists in both public.users and tenant schema
    if (gymId) {
      const tenantUser = await this.tenantService.executeInTenant(
        gymId,
        async (client) => {
          const result = await client.query(
            `SELECT role FROM users WHERE id = $1 AND (is_deleted = FALSE OR is_deleted IS NULL)`,
            [id],
          );
          return result.rows[0];
        },
      );

      if (tenantUser) {
        if (callerRole) {
          this.validateRoleHierarchy(callerRole, tenantUser.role, 'update');
        }
        if (tenantUser.role === ROLES.CLIENT) {
          return this.updateClient(id, gymId, updateUserDto);
        } else {
          return this.updateStaff(id, gymId, updateUserDto);
        }
      }
    }

    // Check admin (public.users) only if not found in tenant schema
    const adminUser = await this.prisma.user.findUnique({
      where: { id, isDeleted: false },
    });

    if (adminUser) {
      if (callerRole) this.validateRoleHierarchy(callerRole, ROLES.ADMIN, 'update');
      return this.updateAdmin(id, gymId, updateUserDto);
    }

    throw new NotFoundException(`User with ID ${id} not found`);
  }

  /**
   * Delete user - determines location based on where user exists
   * Validates role hierarchy: admin > manager > trainer > client
   */
  async remove(
    id: number,
    gymId: number,
    userType?: 'admin' | 'staff' | 'client',
    callerRole?: string,
  ): Promise<{ success: boolean }> {
    if (userType === 'admin') {
      if (callerRole) this.validateRoleHierarchy(callerRole, ROLES.ADMIN, 'delete');
      return this.removeAdmin(id);
    }
    if (userType === 'staff') {
      // Need to get role to validate hierarchy
      const staff = await this.findOneStaff(id, gymId);
      if (callerRole)
        this.validateRoleHierarchy(callerRole, staff.role, 'delete');
      return this.removeStaff(id, gymId);
    }
    if (userType === 'client') {
      if (callerRole)
        this.validateRoleHierarchy(callerRole, ROLES.CLIENT, 'delete');
      return this.removeClient(id, gymId);
    }

    // Check tenant schema FIRST when gymId is provided (clients/staff live here)
    // This prevents ID collision issues where same ID exists in both public.users and tenant schema
    if (gymId) {
      const tenantUser = await this.tenantService.executeInTenant(
        gymId,
        async (client) => {
          const result = await client.query(
            `SELECT role FROM users WHERE id = $1 AND (is_deleted = FALSE OR is_deleted IS NULL)`,
            [id],
          );
          return result.rows[0];
        },
      );

      if (tenantUser) {
        if (callerRole) {
          this.validateRoleHierarchy(callerRole, tenantUser.role, 'delete');
        }
        if (tenantUser.role === ROLES.CLIENT) {
          return this.removeClient(id, gymId);
        } else {
          return this.removeStaff(id, gymId);
        }
      }
    }

    // Check admin (public.users) only if not found in tenant schema
    const adminUser = await this.prisma.user.findUnique({
      where: { id, isDeleted: false },
    });

    if (adminUser) {
      if (callerRole) this.validateRoleHierarchy(callerRole, ROLES.ADMIN, 'delete');
      return this.removeAdmin(id);
    }

    throw new NotFoundException(`User with ID ${id} not found`);
  }

  // ============================================
  // HELPER METHODS
  // ============================================

  async updateStatus(
    userId: number,
    gymId: number,
    status: string,
    userType?: 'admin' | 'staff' | 'client',
  ): Promise<any> {
    return this.update(userId, gymId, { status } as UpdateUserDto, userType);
  }

  async resetPassword(
    userId: number,
    gymId: number,
    newPassword: string,
    userType?: 'admin' | 'staff' | 'client',
  ): Promise<{ success: boolean }> {
    const passwordHash = await hashPassword(newPassword);

    // Admin is in public.users
    if (userType === 'admin') {
      await this.prisma.user.update({
        where: { id: userId },
        data: { passwordHash },
      });
      return { success: true };
    }

    // Staff and client are in tenant.users
    if (userType === 'staff' || userType === 'client') {
      await this.tenantService.executeInTenant(gymId, async (client) => {
        await client.query(
          `UPDATE users SET password_hash = $1, updated_at = NOW() WHERE id = $2`,
          [passwordHash, userId],
        );
      });
      return { success: true };
    }

    // Try to determine user type - check tenant schema FIRST when gymId is provided
    // This avoids ID collision with public.users (same pattern as findOne)
    if (gymId) {
      const tenantUser = await this.tenantService.executeInTenant(
        gymId,
        async (client) => {
          const result = await client.query(
            `SELECT id FROM users WHERE id = $1 AND (is_deleted = FALSE OR is_deleted IS NULL)`,
            [userId],
          );
          return result.rows[0];
        },
      );

      if (tenantUser) {
        // User found in tenant schema - update there
        await this.tenantService.executeInTenant(gymId, async (client) => {
          await client.query(
            `UPDATE users SET password_hash = $1, updated_at = NOW() WHERE id = $2`,
            [passwordHash, userId],
          );
        });
        return { success: true };
      }
    }

    // Not found in tenant or no gymId - check admin (public.users)
    const adminUser = await this.prisma.user.findUnique({
      where: { id: userId, isDeleted: false },
    });

    if (adminUser) {
      await this.prisma.user.update({
        where: { id: userId },
        data: { passwordHash },
      });
    } else {
      throw new NotFoundException(`User with ID ${userId} not found`);
    }

    return { success: true };
  }

  async regenerateAttendanceCode(
    userId: number,
    gymId: number,
  ): Promise<{ success: boolean; attendanceCode: string }> {
    // Only clients have attendance codes
    await this.findOneClient(userId, gymId);

    const attendanceCode = await generateUniqueAttendanceCode(
      gymId,
      this.tenantService,
    );

    await this.tenantService.executeInTenant(gymId, async (client) => {
      await client.query(
        `UPDATE users SET attendance_code = $1, updated_at = NOW() WHERE id = $2`,
        [attendanceCode, userId],
      );
    });

    return { success: true, attendanceCode };
  }

  async findByRole(
    role: string,
    gymId: number,
  ): Promise<PaginatedResponse<any>> {
    if (role === ROLES.ADMIN) {
      return this.findAllAdmins({ role, gymId, noPagination: true });
    }
    if (role === ROLES.CLIENT) {
      return this.findAllClients({ role, gymId, noPagination: true });
    }
    // manager or trainer
    return this.findAllStaff({ role, gymId, noPagination: true });
  }

  /**
   * Approve pending user request (typically clients) with optional membership
   */
  async approveRequest(
    userId: number,
    gymId: number,
    dto?: ApproveRequestDto,
    branchId?: number | null,
  ): Promise<any> {
    const userData = await this.tenantService.executeInTenant(
      gymId,
      async (client) => {
        const result = await client.query(`SELECT * FROM users WHERE id = $1 AND (is_deleted = FALSE OR is_deleted IS NULL)`, [
          userId,
        ]);
        return result.rows[0];
      },
    );

    if (!userData) {
      throw new NotFoundException(`User with ID ${userId} not found`);
    }

    if (userData.status !== USER_STATUS.ONBOARDING && userData.status !== USER_STATUS.CONFIRM) {
      throw new BadRequestException(
        'Only onboarding or confirm requests can be approved',
      );
    }

    const statusId = await this.getStatusId(USER_STATUS.ACTIVE);

    const role = dto?.role || ROLES.CLIENT;

    const updatedUser = await this.tenantService.executeInTenant(
      gymId,
      async (client) => {
        await client.query(
          `UPDATE users SET status = 'active', status_id = $2, role = $3, updated_at = NOW() WHERE id = $1`,
          [userId, statusId, role],
        );

        const result = await client.query(
          `SELECT u.*
           FROM users u
           WHERE u.id = $1`,
          [userId],
        );

        return result.rows[0];
      },
    );

    // Create membership if planId is provided
    if (dto?.planId) {
      await this.createMembershipForApprovedUser(
        userId,
        gymId,
        dto,
        branchId,
      );
    }

    const gym = await this.prisma.gym.findUnique({ where: { id: gymId } });
    return this.formatTenantUser(updatedUser, gym);
  }

  /**
   * Create membership for approved user
   */
  private async createMembershipForApprovedUser(
    userId: number,
    gymId: number,
    dto: ApproveRequestDto,
    branchId?: number | null,
  ): Promise<void> {
    // Get plan details
    const plan = await this.tenantService.executeInTenant(
      gymId,
      async (client) => {
        const result = await client.query(
          `SELECT * FROM plans WHERE id = $1 AND is_active = true`,
          [dto.planId],
        );
        return result.rows[0];
      },
    );

    if (!plan) {
      throw new NotFoundException(
        `Plan with ID ${dto.planId} not found or inactive`,
      );
    }

    const startDate = dto.startDate ? new Date(dto.startDate) : new Date();
    const endDate = new Date(startDate);

    // Calculate end date based on duration_type
    const durationValue = parseInt(plan.duration_value) || 30;
    const durationType = plan.duration_type || 'days';

    if (durationType === 'day' || durationType === 'days') {
      endDate.setDate(endDate.getDate() + durationValue);
    } else if (durationType === 'week' || durationType === 'weeks') {
      endDate.setDate(endDate.getDate() + durationValue * 7);
    } else if (durationType === 'month' || durationType === 'months') {
      endDate.setMonth(endDate.getMonth() + durationValue);
    } else if (durationType === 'year' || durationType === 'years') {
      endDate.setFullYear(endDate.getFullYear() + durationValue);
    } else {
      // Default to days
      endDate.setDate(endDate.getDate() + durationValue);
    }

    const originalAmount = parseFloat(plan.price) || 0;
    const discountAmount = 0;
    const finalAmount = originalAmount - discountAmount;

    await this.tenantService.executeInTenant(gymId, async (client) => {
      await client.query(
        `INSERT INTO memberships (
          user_id, plan_id, start_date, end_date,
          original_amount, discount_amount, final_amount,
          status, payment_status, payment_method, notes, branch_id,
          created_at, updated_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, NOW(), NOW())`,
        [
          userId,
          dto.planId,
          startDate,
          endDate,
          originalAmount,
          discountAmount,
          finalAmount,
          'active',
          'pending',
          dto.paymentMethod || null,
          dto.notes || null,
          branchId || null,
        ],
      );
    });
  }

  /**
   * Reject pending user request (typically clients)
   */
  async rejectRequest(userId: number, gymId: number): Promise<any> {
    const userData = await this.tenantService.executeInTenant(
      gymId,
      async (client) => {
        const result = await client.query(`SELECT * FROM users WHERE id = $1 AND (is_deleted = FALSE OR is_deleted IS NULL)`, [
          userId,
        ]);
        return result.rows[0];
      },
    );

    if (!userData) {
      throw new NotFoundException(`User with ID ${userId} not found`);
    }

    if (userData.status !== USER_STATUS.ONBOARDING && userData.status !== USER_STATUS.CONFIRM) {
      throw new BadRequestException(
        'Only onboarding or confirm requests can be rejected',
      );
    }

    const statusId = await this.getStatusId(USER_STATUS.REJECTED);

    const updatedUser = await this.tenantService.executeInTenant(
      gymId,
      async (client) => {
        await client.query(
          `UPDATE users SET status = 'rejected', status_id = $2, updated_at = NOW() WHERE id = $1`,
          [userId, statusId],
        );

        const result = await client.query(
          `SELECT u.*
           FROM users u
           WHERE u.id = $1`,
          [userId],
        );

        return result.rows[0];
      },
    );

    const gym = await this.prisma.gym.findUnique({ where: { id: gymId } });
    return this.formatTenantUser(updatedUser, gym);
  }

  // ============================================
  // TRAINER-CLIENT ASSIGNMENT OPERATIONS
  // ============================================

  /**
   * Assign a client to a trainer
   */
  async assignClientToTrainer(
    trainerId: number,
    dto: AssignClientDto,
    gymId: number,
  ): Promise<TrainerClientResponseDto> {
    // Verify trainer exists and is a trainer
    const trainer = await this.tenantService.executeInTenant(
      gymId,
      async (client) => {
        const result = await client.query(
          `SELECT id, name, email, role FROM users WHERE id = $1 AND role = 'trainer'`,
          [trainerId],
        );
        return result.rows[0];
      },
    );

    if (!trainer) {
      throw new NotFoundException(`Trainer with ID ${trainerId} not found`);
    }

    // Verify client exists and is a client
    const clientUser = await this.tenantService.executeInTenant(
      gymId,
      async (client) => {
        const result = await client.query(
          `SELECT id, name, email, role FROM users WHERE id = $1 AND role = 'client'`,
          [dto.clientId],
        );
        return result.rows[0];
      },
    );

    if (!clientUser) {
      throw new NotFoundException(`Client with ID ${dto.clientId} not found`);
    }

    // Check if assignment already exists
    const existingAssignment = await this.tenantService.executeInTenant(
      gymId,
      async (client) => {
        const result = await client.query(
          `SELECT id FROM trainer_client_xref WHERE trainer_id = $1 AND client_id = $2 AND is_active = true`,
          [trainerId, dto.clientId],
        );
        return result.rows[0];
      },
    );

    if (existingAssignment) {
      throw new ConflictException('Client is already assigned to this trainer');
    }

    // Check if client is already assigned to another trainer
    const existingOtherAssignment = await this.tenantService.executeInTenant(
      gymId,
      async (client) => {
        const result = await client.query(
          `SELECT tc.id, u.name as trainer_name
         FROM trainer_client_xref tc
         JOIN users u ON u.id = tc.trainer_id
         WHERE tc.client_id = $1 AND tc.is_active = true`,
          [dto.clientId],
        );
        return result.rows[0];
      },
    );

    if (existingOtherAssignment) {
      throw new ConflictException(
        `Client is already assigned to trainer ${existingOtherAssignment.trainer_name}`,
      );
    }

    // Create assignment
    const assignment = await this.tenantService.executeInTenant(
      gymId,
      async (client) => {
        const result = await client.query(
          `INSERT INTO trainer_client_xref (trainer_id, client_id, notes, is_active, assigned_at, created_at, updated_at)
         VALUES ($1, $2, $3, true, NOW(), NOW(), NOW())
         RETURNING *`,
          [trainerId, dto.clientId, dto.notes || null],
        );
        return result.rows[0];
      },
    );

    // Send notification to client about trainer assignment
    await this.notificationsService.notifyTrainerAssigned(
      dto.clientId,
      gymId,
      {
        trainerId: trainer.id,
        trainerName: trainer.name,
      },
    );

    return {
      id: assignment.id,
      trainerId: trainer.id,
      trainerName: trainer.name,
      trainerEmail: trainer.email,
      clientId: clientUser.id,
      clientName: clientUser.name,
      clientEmail: clientUser.email,
      isActive: assignment.is_active,
      assignedAt: assignment.assigned_at,
      notes: assignment.notes,
    };
  }

  /**
   * Get all clients assigned to a trainer
   */
  async getTrainerClients(
    trainerId: number,
    gymId: number,
  ): Promise<TrainerClientResponseDto[]> {
    const assignments = await this.tenantService.executeInTenant(
      gymId,
      async (client) => {
        const result = await client.query(
          `SELECT
          tc.id,
          tc.trainer_id,
          tc.client_id,
          tc.is_active,
          tc.assigned_at,
          tc.notes,
          t.name as trainer_name,
          t.email as trainer_email,
          c.name as client_name,
          c.email as client_email
        FROM trainer_client_xref tc
        JOIN users t ON t.id = tc.trainer_id
        JOIN users c ON c.id = tc.client_id
        WHERE tc.trainer_id = $1 AND tc.is_active = true
        ORDER BY tc.assigned_at DESC`,
          [trainerId],
        );
        return result.rows;
      },
    );

    return assignments.map((a: Record<string, any>) => ({
      id: a.id,
      trainerId: a.trainer_id,
      trainerName: a.trainer_name,
      trainerEmail: a.trainer_email,
      clientId: a.client_id,
      clientName: a.client_name,
      clientEmail: a.client_email,
      isActive: a.is_active,
      assignedAt: a.assigned_at,
      notes: a.notes,
    }));
  }

  /**
   * Get trainer for a client
   */
  async getClientTrainer(
    clientId: number,
    gymId: number,
  ): Promise<TrainerClientResponseDto | null> {
    const assignment = await this.tenantService.executeInTenant(
      gymId,
      async (client) => {
        const result = await client.query(
          `SELECT
          tc.id,
          tc.trainer_id,
          tc.client_id,
          tc.is_active,
          tc.assigned_at,
          tc.notes,
          t.name as trainer_name,
          t.email as trainer_email,
          t.phone as trainer_phone,
          t.avatar as trainer_avatar,
          t.bio as trainer_bio,
          c.name as client_name,
          c.email as client_email
        FROM trainer_client_xref tc
        JOIN users t ON t.id = tc.trainer_id
        JOIN users c ON c.id = tc.client_id
        WHERE tc.client_id = $1 AND tc.is_active = true`,
          [clientId],
        );
        return result.rows[0];
      },
    );

    if (!assignment) {
      return null;
    }

    return {
      id: assignment.id,
      trainerId: assignment.trainer_id,
      trainerName: assignment.trainer_name,
      trainerEmail: assignment.trainer_email,
      trainerPhone: assignment.trainer_phone || undefined,
      trainerAvatar: assignment.trainer_avatar || undefined,
      trainerBio: assignment.trainer_bio || undefined,
      clientId: assignment.client_id,
      clientName: assignment.client_name,
      clientEmail: assignment.client_email,
      isActive: assignment.is_active,
      assignedAt: assignment.assigned_at,
      notes: assignment.notes,
    };
  }

  /**
   * Remove client from trainer
   */
  async removeClientFromTrainer(
    trainerId: number,
    clientId: number,
    gymId: number,
  ): Promise<{ success: boolean }> {
    // Get assignment with trainer details for notification
    const assignment = await this.tenantService.executeInTenant(
      gymId,
      async (client) => {
        const result = await client.query(
          `SELECT tc.id, t.name as trainer_name
         FROM trainer_client_xref tc
         JOIN users t ON t.id = tc.trainer_id
         WHERE tc.trainer_id = $1 AND tc.client_id = $2 AND tc.is_active = true`,
          [trainerId, clientId],
        );
        return result.rows[0];
      },
    );

    if (!assignment) {
      throw new NotFoundException('Assignment not found');
    }

    await this.tenantService.executeInTenant(gymId, async (client) => {
      await client.query(
        `UPDATE trainer_client_xref SET is_active = false, updated_at = NOW() WHERE id = $1`,
        [assignment.id],
      );
    });

    // Send notification to client about trainer unassignment
    await this.notificationsService.notifyTrainerUnassigned(
      clientId,
      gymId,
      {
        trainerId,
        trainerName: assignment.trainer_name,
      },
    );

    return { success: true };
  }

  /**
   * Get all trainer-client assignments for a gym
   */
  async getAllTrainerClientAssignments(
    gymId: number,
  ): Promise<TrainerClientResponseDto[]> {
    const assignments = await this.tenantService.executeInTenant(
      gymId,
      async (client) => {
        const result = await client.query(
          `SELECT
          tc.id,
          tc.trainer_id,
          tc.client_id,
          tc.is_active,
          tc.assigned_at,
          tc.notes,
          t.name as trainer_name,
          t.email as trainer_email,
          c.name as client_name,
          c.email as client_email
        FROM trainer_client_xref tc
        JOIN users t ON t.id = tc.trainer_id
        JOIN users c ON c.id = tc.client_id
        WHERE tc.is_active = true
        ORDER BY tc.assigned_at DESC`,
        );
        return result.rows;
      },
    );

    return assignments.map((a: Record<string, any>) => ({
      id: a.id,
      trainerId: a.trainer_id,
      trainerName: a.trainer_name,
      trainerEmail: a.trainer_email,
      clientId: a.client_id,
      clientName: a.client_name,
      clientEmail: a.client_email,
      isActive: a.is_active,
      assignedAt: a.assigned_at,
      notes: a.notes,
    }));
  }

  // ============================================
  // BULK OPERATIONS
  // ============================================

  /**
   * Bulk create users
   * Creates each user independently - one failure doesn't stop the batch
   */
  async bulkCreate(
    users: CreateUserDto[],
    gymId: number,
    callerRole: string,
    actorInfo: { id: number; name: string; role: string },
  ): Promise<{
    success: number;
    failed: number;
    errors: string[];
    created: Array<{ name: string; email: string; id: number }>;
  }> {
    const results = {
      success: 0,
      failed: 0,
      errors: [] as string[],
      created: [] as Array<{ name: string; email: string; id: number }>,
    };

    for (let i = 0; i < users.length; i++) {
      const userDto = users[i];
      try {
        const createdUser = await this.create(
          userDto,
          gymId,
          callerRole,
          actorInfo,
        );
        results.success++;
        results.created.push({
          name: createdUser.name,
          email: createdUser.email,
          id: createdUser.id,
        });
      } catch (error: unknown) {
        results.failed++;
        const msg = error instanceof Error ? error.message : String(error);
        results.errors.push(
          `User ${i + 1} (${userDto.name || userDto.email}): ${msg}`,
        );
      }
    }

    return results;
  }

  /**
   * Bulk update users - update status
   * Skips users that cannot be updated (e.g., admins, users from other gyms)
   */
  async bulkUpdate(
    userIds: number[],
    updateData: { status?: string },
    gymId: number,
    callerRole: string,
  ): Promise<{ success: number; failed: number; skipped: number; errors: string[] }> {
    const results = {
      success: 0,
      failed: 0,
      skipped: 0,
      errors: [] as string[],
    };

    for (const userId of userIds) {
      try {
        // Get user to check their role
        const user = await this.tenantService.executeInTenant(
          gymId,
          async (client) => {
            const result = await client.query(
              `SELECT id, name, role FROM users WHERE id = $1 AND is_deleted = FALSE`,
              [userId],
            );
            return result.rows[0];
          },
        );

        if (!user) {
          results.skipped++;
          results.errors.push(`User ${userId}: Not found or deleted`);
          continue;
        }

        // Check role hierarchy - skip users that caller cannot manage
        if (!this.canManageRole(callerRole, user.role)) {
          results.skipped++;
          results.errors.push(`User ${userId} (${user.name}): Cannot update ${user.role} users`);
          continue;
        }

        // Perform update
        if (updateData.status) {
          const statusId = await this.getStatusId(updateData.status);
          if (statusId !== null) {
            await this.tenantService.executeInTenant(gymId, async (client) => {
              await client.query(
                `UPDATE users SET status = $1, status_id = $2, updated_at = NOW() WHERE id = $3`,
                [updateData.status, statusId, userId],
              );
            });
          }
        }

        results.success++;
      } catch (error: unknown) {
        results.failed++;
        const msg = error instanceof Error ? error.message : String(error);
        results.errors.push(`User ${userId}: ${msg}`);
      }
    }

    return results;
  }

  /**
   * Bulk delete users
   * Skips users that cannot be deleted (e.g., admins, users with active memberships)
   */
  async bulkDelete(
    userIds: number[],
    gymId: number,
    callerRole: string,
    deletedById?: number,
  ): Promise<{ success: number; failed: number; skipped: number; errors: string[] }> {
    const results = {
      success: 0,
      failed: 0,
      skipped: 0,
      errors: [] as string[],
    };

    for (const userId of userIds) {
      try {
        // Get user to check their role
        const user = await this.tenantService.executeInTenant(
          gymId,
          async (client) => {
            const result = await client.query(
              `SELECT id, name, role FROM users WHERE id = $1 AND is_deleted = FALSE`,
              [userId],
            );
            return result.rows[0];
          },
        );

        if (!user) {
          results.skipped++;
          results.errors.push(`User ${userId}: Not found or already deleted`);
          continue;
        }

        // Check role hierarchy - skip users that caller cannot manage
        if (!this.canManageRole(callerRole, user.role)) {
          results.skipped++;
          results.errors.push(`User ${userId} (${user.name}): Cannot delete ${user.role} users`);
          continue;
        }

        // Check for active memberships (for clients)
        if (user.role === ROLES.CLIENT) {
          const activeMembership = await this.tenantService.executeInTenant(
            gymId,
            async (client) => {
              const result = await client.query(
                `SELECT id FROM member_subscriptions
                 WHERE user_id = $1 AND status IN ('active', 'pending')`,
                [userId],
              );
              return result.rows[0];
            },
          );

          if (activeMembership) {
            results.skipped++;
            results.errors.push(`User ${userId} (${user.name}): Has active membership`);
            continue;
          }
        }

        // Hard delete for manager/trainer, soft delete for clients
        if (user.role === ROLES.MANAGER || user.role === ROLES.TRAINER) {
          await this.tenantService.executeInTenant(gymId, async (client) => {
            await client.query(`DELETE FROM user_branch_xref WHERE user_id = $1`, [userId]);
            await client.query(`DELETE FROM trainer_client_xref WHERE trainer_id = $1 OR client_id = $1`, [userId]);
            await client.query(`DELETE FROM trainer_availability WHERE trainer_id = $1`, [userId]);
            await client.query(`DELETE FROM appointments WHERE trainer_id = $1`, [userId]);
            await client.query(`DELETE FROM users WHERE id = $1`, [userId]);
          });
        } else {
          await this.tenantService.executeInTenant(gymId, async (client) => {
            await client.query(
              `UPDATE users SET is_deleted = TRUE, deleted_at = NOW(), deleted_by = $2, updated_at = NOW() WHERE id = $1`,
              [userId, deletedById || null],
            );
          });
        }

        results.success++;
      } catch (error: unknown) {
        results.failed++;
        const msg = error instanceof Error ? error.message : String(error);
        results.errors.push(`User ${userId}: ${msg}`);
      }
    }

    return results;
  }
}
