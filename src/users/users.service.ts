import {
  Injectable,
  NotFoundException,
  ConflictException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';
import { TenantService } from '../tenant/tenant.service';
import { NotificationsService } from '../notifications/notifications.service';
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

const USER_STATUS_LOOKUP_TYPE = 'USER_STATUS';

export interface UserFilters extends PaginationParams {
  role?: string;
  status?: string;
  gymId?: number;
  branchId?: number | null; // null = all branches, number = specific branch
  isSuperAdmin?: boolean;
  userType?: 'staff' | 'client' | 'all'; // New: filter by user type
}

@Injectable()
export class UsersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tenantService: TenantService,
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
   * Role hierarchy for user management
   * Higher level can manage lower levels
   * admin > branch_admin > manager > trainer > client
   */
  private readonly ROLE_HIERARCHY: Record<string, string[]> = {
    superadmin: ['admin', 'branch_admin', 'manager', 'trainer', 'client'],
    admin: ['branch_admin', 'manager', 'trainer', 'client'],
    branch_admin: ['manager', 'trainer', 'client'],
    manager: ['trainer', 'client'],
    trainer: ['client'],
    client: [],
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

  private formatAdminUser(user: any, gymAssignments?: any[]) {
    const primaryAssignment =
      gymAssignments?.find((a) => a.isPrimary) || gymAssignments?.[0];
    return {
      id: user.id,
      name: user.name,
      email: user.email,
      phone: user.phone,
      avatar: user.avatar,
      bio: user.bio,
      role: primaryAssignment?.role || 'admin',
      status: user.status,
      dateOfBirth: user.dateOfBirth,
      gender: user.gender,
      address: user.address,
      city: user.city,
      state: user.state,
      zipCode: user.zipCode,
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

  private formatTenantUser(user: any, gym?: any, branchAssignments?: any[]) {
    const role = user.role || 'client';
    const branchIds = branchAssignments?.map((a) => a.branch_id) || [];
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
        role === 'client'
          ? user.attendance_code || user.attendanceCode
          : undefined,
      emergencyContactName:
        user.emergency_contact_name || user.emergencyContactName,
      emergencyContactPhone:
        user.emergency_contact_phone || user.emergencyContactPhone,
      userType: role === 'client' ? 'client' : 'staff',
      gymId: gym?.id,
      branchId: user.branch_id || user.branchId || null,
      branchName: user.branch_name || user.branchName || null,
      branchIds:
        branchIds.length > 0
          ? branchIds
          : user.branch_id
            ? [user.branch_id]
            : [],
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
    if (dto.role !== 'admin') {
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

    // Check if email exists in tenant schema
    const existingTenantUser = await this.tenantService.executeInTenant(
      gymId,
      async (client) => {
        const result = await client.query(
          `SELECT id FROM users WHERE email = $1`,
          [dto.email],
        );
        return result.rows[0];
      },
    );

    if (existingTenantUser) {
      throw new ConflictException('Email already exists in this gym');
    }

    const passwordHash = await hashPassword(dto.password);
    const status = dto.status || 'active';
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
        role: 'admin',
        isPrimary: false, // Only the first admin is primary
        isActive: true,
      },
      include: { gym: true },
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

    const where: any = {
      isDeleted: false,
      gymAssignments: {
        some: {
          ...(gymId && { gymId }),
          role: 'admin',
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
   * Soft delete an admin
   */
  async removeAdmin(id: number): Promise<{ success: boolean }> {
    const user = await this.prisma.user.findUnique({
      where: { id, isDeleted: false },
    });

    if (!user) {
      throw new NotFoundException(`Admin with ID ${id} not found`);
    }

    // Check if user is primary admin of any gym
    const primaryAdminAssignments = await this.prisma.userGymXref.findMany({
      where: { userId: id, role: 'admin', isPrimary: true, isActive: true },
    });

    if (primaryAdminAssignments.length > 0) {
      throw new BadRequestException(
        'Cannot delete user. User is the primary admin of one or more gyms. Please transfer ownership first.',
      );
    }

    // Soft delete
    await this.prisma.user.update({
      where: { id },
      data: { isDeleted: true, deletedAt: new Date() },
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

    const role = dto.role || 'trainer';
    if (role === 'admin') {
      return this.createAdmin(dto, gymId);
    }

    if (!['manager', 'trainer', 'branch_admin'].includes(role)) {
      throw new BadRequestException(
        'Invalid role. Staff role must be manager, trainer, or branch_admin.',
      );
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

    // Check if email already exists in this tenant
    const existingTenantUser = await this.tenantService.executeInTenant(
      gymId,
      async (client) => {
        const result = await client.query(
          `SELECT id FROM users WHERE email = $1`,
          [dto.email],
        );
        return result.rows[0];
      },
    );

    if (existingTenantUser) {
      throw new ConflictException(
        'User with this email already exists in this gym',
      );
    }

    const passwordHash = await hashPassword(dto.password);
    const status = dto.status || 'active';
    const statusId = await this.getStatusId(status);

    // Determine primary branch: use branchIds[0] if available, otherwise branchId
    const branchIds = dto.branchIds || (dto.branchId ? [dto.branchId] : []);
    const primaryBranchId = branchIds.length > 0 ? branchIds[0] : null;

    // Create staff in tenant schema
    const createdStaff = await this.tenantService.executeInTenant(
      gymId,
      async (client) => {
        const result = await client.query(
          `INSERT INTO users (
          name, email, password_hash, phone, avatar, bio, role, status, status_id,
          date_of_birth, gender, address, city, state, zip_code,
          join_date, branch_id, created_at, updated_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, NOW(), NOW())
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
            primaryBranchId,
          ],
        );

        const user = result.rows[0];

        // For staff with multiple branches, create user_branch_xref entries
        let branchAssignments: any[] = [];
        if (
          ['branch_admin', 'manager', 'trainer'].includes(role) &&
          branchIds.length > 0
        ) {
          for (let i = 0; i < branchIds.length; i++) {
            const branchId = branchIds[i];
            const isPrimary = i === 0; // First branch is primary
            await client.query(
              `INSERT INTO user_branch_xref (user_id, branch_id, is_primary, is_active, assigned_at, created_at, updated_at)
             VALUES ($1, $2, $3, TRUE, NOW(), NOW(), NOW())
             ON CONFLICT (user_id, branch_id) DO UPDATE SET is_active = TRUE, is_primary = $3, updated_at = NOW()`,
              [user.id, branchId, isPrimary],
            );
          }
          // Fetch the created assignments
          const assignmentsResult = await client.query(
            `SELECT branch_id, is_primary FROM user_branch_xref WHERE user_id = $1 AND is_active = TRUE ORDER BY is_primary DESC`,
            [user.id],
          );
          branchAssignments = assignmentsResult.rows;
        }

        return { user, branchAssignments };
      },
    );

    const gym = await this.prisma.gym.findUnique({ where: { id: gymId } });

    // Log activity
    if (actorInfo) {
      await this.activityLogsService.logUserCreated(
        gymId,
        primaryBranchId,
        actorInfo.id,
        actorInfo.role,
        actorInfo.name,
        createdStaff.user.id,
        dto.name,
      );
    }

    return this.formatTenantUser(
      createdStaff.user,
      gym,
      createdStaff.branchAssignments,
    );
  }

  /**
   * Get all staff members (manager, trainer) for a gym from tenant schema
   */
  async findAllStaff(filters: UserFilters): Promise<PaginatedResponse<any>> {
    const { page, limit, skip, take, noPagination } =
      getPaginationParams(filters);
    const gymId = filters.gymId;
    const branchId = filters.branchId;

    if (!gymId) {
      throw new BadRequestException('gymId is required for fetching staff');
    }

    const { users, total } = await this.tenantService.executeInTenant(
      gymId,
      async (client) => {
        const conditions: string[] = [
          "u.role IN ('manager', 'trainer', 'branch_admin')",
          '(u.is_deleted = FALSE OR u.is_deleted IS NULL)',
        ];
        const values: any[] = [];
        let paramIndex = 1;

        // Branch filtering: null = all branches, number = specific branch
        // For all staff roles, also check user_branch_xref table (staff can have multiple branches)
        if (branchId !== null && branchId !== undefined) {
          conditions.push(`(
          u.branch_id = $${paramIndex} OR
          EXISTS (
            SELECT 1 FROM user_branch_xref ubx
            WHERE ubx.user_id = u.id AND ubx.branch_id = $${paramIndex} AND ubx.is_active = TRUE
          )
        )`);
          values.push(branchId);
          paramIndex++;
        }

        if (
          filters.role &&
          filters.role !== 'all' &&
          ['manager', 'trainer', 'branch_admin'].includes(filters.role)
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

        const whereClause = conditions.join(' AND ');

        const [usersResult, countResult] = await Promise.all([
          client.query(
            `SELECT u.*, b.name as branch_name FROM users u
           LEFT JOIN branches b ON b.id = u.branch_id
           WHERE ${whereClause}
           ORDER BY u.created_at DESC
           LIMIT $${paramIndex++} OFFSET $${paramIndex}`,
            [...values, take, skip],
          ),
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
      data: users.map((user: any) => this.formatTenantUser(user, gym)),
      pagination: createPaginationMeta(total, page, limit, noPagination),
    };
  }

  /**
   * Get a single staff member from tenant schema
   */
  async findOneStaff(id: number, gymId: number): Promise<any> {
    const { staffData, branchAssignments } =
      await this.tenantService.executeInTenant(gymId, async (client) => {
        const result = await client.query(
          `SELECT * FROM users WHERE id = $1 AND role IN ('manager', 'trainer', 'branch_admin') AND (is_deleted = FALSE OR is_deleted IS NULL)`,
          [id],
        );
        const staff = result.rows[0];

        // Fetch branch assignments for all staff roles
        let assignments: any[] = [];
        if (
          staff &&
          ['branch_admin', 'manager', 'trainer'].includes(staff.role)
        ) {
          const assignmentsResult = await client.query(
            `SELECT branch_id, is_primary FROM user_branch_xref WHERE user_id = $1 AND is_active = TRUE ORDER BY is_primary DESC`,
            [id],
          );
          assignments = assignmentsResult.rows;
        }

        return { staffData: staff, branchAssignments: assignments };
      });

    if (!staffData) {
      throw new NotFoundException(`Staff member with ID ${id} not found`);
    }

    const gym = await this.prisma.gym.findUnique({ where: { id: gymId } });
    return this.formatTenantUser(staffData, gym, branchAssignments);
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
    const values: any[] = [];
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
      ['manager', 'trainer', 'branch_admin'].includes(updateDto.role)
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
    if (updateDto.branchId !== undefined) {
      updates.push(`branch_id = $${paramIndex++}`);
      values.push(updateDto.branchId);
    }

    if (updates.length === 0) {
      return this.findOneStaff(id, gymId);
    }

    updates.push(`updated_at = NOW()`);
    values.push(id);

    const { updatedStaff, branchAssignments } =
      await this.tenantService.executeInTenant(gymId, async (client) => {
        if (updates.length > 0) {
          await client.query(
            `UPDATE users SET ${updates.join(', ')} WHERE id = $${paramIndex}`,
            values,
          );
        }

        const result = await client.query(`SELECT * FROM users WHERE id = $1`, [
          id,
        ]);
        const user = result.rows[0];

        // Handle branch assignments update for all staff roles
        const staffRolesWithBranches = ['branch_admin', 'manager', 'trainer'];
        let assignments: any[] = [];
        if (
          updateDto.branchIds &&
          updateDto.branchIds.length > 0 &&
          staffRolesWithBranches.includes(user.role)
        ) {
          // Deactivate all existing assignments
          await client.query(
            `UPDATE user_branch_xref SET is_active = FALSE, updated_at = NOW() WHERE user_id = $1`,
            [id],
          );

          // Update primary branch_id in users table
          await client.query(
            `UPDATE users SET branch_id = $1, updated_at = NOW() WHERE id = $2`,
            [updateDto.branchIds[0], id],
          );

          // Insert/update new assignments
          for (let i = 0; i < updateDto.branchIds.length; i++) {
            const branchId = updateDto.branchIds[i];
            const isPrimary = i === 0;
            await client.query(
              `INSERT INTO user_branch_xref (user_id, branch_id, is_primary, is_active, assigned_at, created_at, updated_at)
             VALUES ($1, $2, $3, TRUE, NOW(), NOW(), NOW())
             ON CONFLICT (user_id, branch_id) DO UPDATE SET is_active = TRUE, is_primary = $3, updated_at = NOW()`,
              [id, branchId, isPrimary],
            );
          }

          // Fetch updated assignments
          const assignmentsResult = await client.query(
            `SELECT branch_id, is_primary FROM user_branch_xref WHERE user_id = $1 AND is_active = TRUE ORDER BY is_primary DESC`,
            [id],
          );
          assignments = assignmentsResult.rows;
        } else if (staffRolesWithBranches.includes(user.role)) {
          // Fetch existing assignments
          const assignmentsResult = await client.query(
            `SELECT branch_id, is_primary FROM user_branch_xref WHERE user_id = $1 AND is_active = TRUE ORDER BY is_primary DESC`,
            [id],
          );
          assignments = assignmentsResult.rows;
        }

        // Re-fetch user to get updated branch_id
        const updatedResult = await client.query(
          `SELECT * FROM users WHERE id = $1`,
          [id],
        );

        return {
          updatedStaff: updatedResult.rows[0],
          branchAssignments: assignments,
        };
      });

    const gym = await this.prisma.gym.findUnique({ where: { id: gymId } });
    return this.formatTenantUser(updatedStaff, gym, branchAssignments);
  }

  /**
   * Delete a staff member from tenant schema
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
          `SELECT * FROM users WHERE id = $1 AND role IN ('manager', 'trainer', 'branch_admin') AND (is_deleted = FALSE OR is_deleted IS NULL)`,
          [id],
        );
        return result.rows[0];
      },
    );

    if (!staffData) {
      throw new NotFoundException(`Staff member with ID ${id} not found`);
    }

    // Soft delete staff from tenant schema
    await this.tenantService.executeInTenant(gymId, async (client) => {
      // Deactivate user_branch_xref entries for branch_admin
      if (staffData.role === 'branch_admin') {
        await client.query(
          `UPDATE user_branch_xref SET is_active = FALSE, updated_at = NOW() WHERE user_id = $1`,
          [id],
        );
      }
      // Soft delete the user
      await client.query(
        `UPDATE users SET is_deleted = TRUE, deleted_at = NOW(), deleted_by = $2, updated_at = NOW() WHERE id = $1`,
        [id, deletedById || null],
      );
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

    // Check if email already exists in this tenant
    const existingClient = await this.tenantService.executeInTenant(
      gymId,
      async (client) => {
        const result = await client.query(
          `SELECT id FROM users WHERE email = $1`,
          [dto.email],
        );
        return result.rows[0];
      },
    );

    if (existingClient) {
      throw new ConflictException(
        'Client with this email already exists in this gym',
      );
    }

    // Also check public.users and system_users
    const existingStaff = await this.prisma.user.findUnique({
      where: { email: dto.email },
    });

    if (existingStaff) {
      throw new ConflictException('Email already exists as a staff member');
    }

    const existingSystemUser = await this.prisma.systemUser.findUnique({
      where: { email: dto.email },
    });

    if (existingSystemUser) {
      throw new ConflictException('Email already exists as a system user');
    }

    const status = dto.status || 'active';
    const [passwordHash, attendanceCode, statusId] = await Promise.all([
      hashPassword(dto.password),
      generateUniqueAttendanceCode(gymId, this.tenantService),
      this.getStatusId(status),
    ]);

    // Create client in tenant schema with role='client'
    const createdClient = await this.tenantService.executeInTenant(
      gymId,
      async (client) => {
        const result = await client.query(
          `INSERT INTO users (
          name, email, password_hash, phone, avatar, bio, role, status, status_id,
          date_of_birth, gender, address, city, state, zip_code,
          emergency_contact_name, emergency_contact_phone,
          join_date, attendance_code, branch_id, created_at, updated_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, NOW(), NOW())
        RETURNING *`,
          [
            dto.name,
            dto.email,
            passwordHash,
            dto.phone || null,
            dto.avatar || null,
            dto.bio || null,
            'client', // role is always 'client' for clients
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
            new Date(),
            attendanceCode,
            dto.branchId || null,
          ],
        );
        return result.rows[0];
      },
    );

    const gym = await this.prisma.gym.findUnique({ where: { id: gymId } });

    // Log activity
    if (actorInfo) {
      await this.activityLogsService.logUserCreated(
        gymId,
        dto.branchId || null,
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
   * Get all clients for a gym (role='client' in tenant schema)
   */
  async findAllClients(filters: UserFilters): Promise<PaginatedResponse<any>> {
    const { page, limit, skip, take, noPagination } =
      getPaginationParams(filters);
    const gymId = filters.gymId;
    const branchId = filters.branchId;

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
        const values: any[] = [];
        let paramIndex = 1;

        // Branch filtering: null = all branches, number = specific branch
        if (branchId !== null && branchId !== undefined) {
          conditions.push(`u.branch_id = $${paramIndex++}`);
          values.push(branchId);
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

        const whereClause = conditions.join(' AND ');

        const [usersResult, countResult] = await Promise.all([
          client.query(
            `SELECT u.*, b.name as branch_name FROM users u
           LEFT JOIN branches b ON b.id = u.branch_id
           WHERE ${whereClause}
           ORDER BY u.created_at DESC
           LIMIT $${paramIndex++} OFFSET $${paramIndex}`,
            [...values, take, skip],
          ),
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
      data: users.map((user: any) => this.formatTenantUser(user, gym)),
      pagination: createPaginationMeta(total, page, limit, noPagination),
    };
  }

  /**
   * Get a single client (role='client' in tenant schema)
   */
  async findOneClient(id: number, gymId: number): Promise<any> {
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

    const gym = await this.prisma.gym.findUnique({ where: { id: gymId } });
    return this.formatTenantUser(clientData, gym);
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
    const values: any[] = [];
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
    if (updateDto.branchId !== undefined) {
      updates.push(`branch_id = $${paramIndex++}`);
      values.push(updateDto.branchId);
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

        const result = await client.query(`SELECT * FROM users WHERE id = $1`, [
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

    // Check for active memberships (exclude soft-deleted memberships)
    const activeMemberships = await this.tenantService.executeInTenant(
      gymId,
      async (client) => {
        const result = await client.query(
          `SELECT COUNT(*) as count FROM memberships
         WHERE user_id = $1 AND status IN ('active', 'pending')
         AND (is_deleted = FALSE OR is_deleted IS NULL)`,
          [id],
        );
        return parseInt(result.rows[0].count, 10);
      },
    );

    if (activeMemberships > 0) {
      throw new BadRequestException(
        'Cannot delete client. Client has active or pending memberships. Please cancel the memberships first.',
      );
    }

    // Soft delete client from tenant schema
    await this.tenantService.executeInTenant(gymId, async (client) => {
      await client.query(
        `UPDATE users SET is_deleted = TRUE, deleted_at = NOW(), deleted_by = $2, updated_at = NOW() WHERE id = $1`,
        [id, deletedById || null],
      );
    });

    return { success: true };
  }

  // ============================================
  // COMBINED OPERATIONS (for backward compatibility)
  // Architecture: admin in public.users, manager/trainer/client in tenant.users
  // ============================================

  /**
   * Create user - determines type based on role
   * Validates role hierarchy: admin > branch_admin > manager > trainer > client
   */
  async create(
    createUserDto: CreateUserDto,
    gymId: number,
    callerRole?: string,
    actorInfo?: { id: number; name: string; role: string },
  ): Promise<any> {
    const role = createUserDto.role || 'client';

    // Validate role hierarchy if callerRole is provided
    if (callerRole) {
      this.validateRoleHierarchy(callerRole, role, 'create');
    }

    if (role === 'admin') {
      return this.createAdmin(createUserDto as CreateStaffDto, gymId);
    } else if (role === 'client') {
      return this.createClient(
        createUserDto as CreateClientDto,
        gymId,
        actorInfo,
      );
    } else {
      // manager, trainer, or branch_admin
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
    if (role === 'admin') {
      return this.findAllAdmins(filters);
    }

    // For non-superadmin, gymId is required for tenant queries
    if (!isSuperAdmin && !filters.gymId) {
      // If role requires tenant access, throw error
      if (
        role === 'client' ||
        role === 'manager' ||
        role === 'trainer' ||
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
    if (role === 'client') {
      return this.findAllClients(filters);
    }

    // If role is manager/trainer/branch_admin, only get staff from tenant.users
    if (role && ['manager', 'trainer', 'branch_admin'].includes(role)) {
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
        const staffWithGym = staffResult.data.map((u: any) => ({
          ...u,
          gymName: gym.name,
        }));
        const clientsWithGym = clientResult.data.map((u: any) => ({
          ...u,
          gymName: gym.name,
        }));

        allUsers = [...allUsers, ...staffWithGym, ...clientsWithGym];
      } catch (error) {
        // Skip gyms that don't have tenant schema yet
        console.warn(
          `Could not fetch users for gym ${gym.id}: ${error.message}`,
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
            `SELECT * FROM users WHERE id = $1`,
            [id],
          );
          return result.rows[0];
        },
      );

      if (tenantUser) {
        const gym = await this.prisma.gym.findUnique({ where: { id: gymId } });
        return this.formatTenantUser(tenantUser, gym);
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
                `SELECT * FROM users WHERE id = $1`,
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
   * Validates role hierarchy: admin > branch_admin > manager > trainer > client
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
      if (callerRole) this.validateRoleHierarchy(callerRole, 'admin', 'update');
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
        this.validateRoleHierarchy(callerRole, 'client', 'update');
      return this.updateClient(id, gymId, updateUserDto);
    }

    // Try to determine user type - check admin first (public.users)
    const adminUser = await this.prisma.user.findUnique({
      where: { id, isDeleted: false },
    });

    if (adminUser) {
      if (callerRole) this.validateRoleHierarchy(callerRole, 'admin', 'update');
      return this.updateAdmin(id, gymId, updateUserDto);
    }

    // Check tenant schema
    const tenantUser = await this.tenantService.executeInTenant(
      gymId,
      async (client) => {
        const result = await client.query(
          `SELECT role FROM users WHERE id = $1`,
          [id],
        );
        return result.rows[0];
      },
    );

    if (tenantUser) {
      if (callerRole) {
        this.validateRoleHierarchy(callerRole, tenantUser.role, 'update');
      }
      if (tenantUser.role === 'client') {
        return this.updateClient(id, gymId, updateUserDto);
      } else {
        return this.updateStaff(id, gymId, updateUserDto);
      }
    }

    throw new NotFoundException(`User with ID ${id} not found`);
  }

  /**
   * Delete user - determines location based on where user exists
   * Validates role hierarchy: admin > branch_admin > manager > trainer > client
   */
  async remove(
    id: number,
    gymId: number,
    userType?: 'admin' | 'staff' | 'client',
    callerRole?: string,
  ): Promise<{ success: boolean }> {
    if (userType === 'admin') {
      if (callerRole) this.validateRoleHierarchy(callerRole, 'admin', 'delete');
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
        this.validateRoleHierarchy(callerRole, 'client', 'delete');
      return this.removeClient(id, gymId);
    }

    // Try to determine user type - check admin first (public.users)
    const adminUser = await this.prisma.user.findUnique({
      where: { id, isDeleted: false },
    });

    if (adminUser) {
      if (callerRole) this.validateRoleHierarchy(callerRole, 'admin', 'delete');
      return this.removeAdmin(id);
    }

    // Check tenant schema
    const tenantUser = await this.tenantService.executeInTenant(
      gymId,
      async (client) => {
        const result = await client.query(
          `SELECT role FROM users WHERE id = $1`,
          [id],
        );
        return result.rows[0];
      },
    );

    if (tenantUser) {
      if (callerRole) {
        this.validateRoleHierarchy(callerRole, tenantUser.role, 'delete');
      }
      if (tenantUser.role === 'client') {
        return this.removeClient(id, gymId);
      } else {
        return this.removeStaff(id, gymId);
      }
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

    // Try to determine user type - check admin first (public.users)
    const adminUser = await this.prisma.user.findUnique({
      where: { id: userId, isDeleted: false },
    });

    if (adminUser) {
      await this.prisma.user.update({
        where: { id: userId },
        data: { passwordHash },
      });
    } else {
      // Must be in tenant schema
      await this.tenantService.executeInTenant(gymId, async (client) => {
        await client.query(
          `UPDATE users SET password_hash = $1, updated_at = NOW() WHERE id = $2`,
          [passwordHash, userId],
        );
      });
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
    if (role === 'admin') {
      return this.findAllAdmins({ role, gymId, noPagination: true });
    }
    if (role === 'client') {
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
  ): Promise<any> {
    const userData = await this.tenantService.executeInTenant(
      gymId,
      async (client) => {
        const result = await client.query(`SELECT * FROM users WHERE id = $1`, [
          userId,
        ]);
        return result.rows[0];
      },
    );

    if (!userData) {
      throw new NotFoundException(`User with ID ${userId} not found`);
    }

    if (userData.status !== 'onboarding' && userData.status !== 'confirm') {
      throw new BadRequestException(
        'Only onboarding or confirm requests can be approved',
      );
    }

    const statusId = await this.getStatusId('active');

    const updatedUser = await this.tenantService.executeInTenant(
      gymId,
      async (client) => {
        await client.query(
          `UPDATE users SET status = 'active', status_id = $2, updated_at = NOW() WHERE id = $1`,
          [userId, statusId],
        );

        const result = await client.query(`SELECT * FROM users WHERE id = $1`, [
          userId,
        ]);
        return result.rows[0];
      },
    );

    // Create membership if planId is provided
    if (dto?.planId) {
      await this.createMembershipForApprovedUser(
        userId,
        gymId,
        dto,
        userData.branch_id,
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
    branchId: number | null,
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
    endDate.setDate(endDate.getDate() + plan.duration_days);

    const baseAmount = parseFloat(plan.price) || 0;
    const taxAmount = baseAmount * 0.18; // 18% GST
    const finalAmount = baseAmount + taxAmount;

    await this.tenantService.executeInTenant(gymId, async (client) => {
      await client.query(
        `INSERT INTO memberships (
          user_id, plan_id, branch_id, start_date, end_date,
          base_amount, tax_amount, discount_amount, final_amount,
          status, payment_status, payment_method, notes,
          created_at, updated_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, NOW(), NOW())`,
        [
          userId,
          dto.planId,
          branchId,
          startDate,
          endDate,
          baseAmount,
          taxAmount,
          0, // discount_amount
          finalAmount,
          'active',
          'pending',
          dto.paymentMethod || null,
          dto.notes || null,
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
        const result = await client.query(`SELECT * FROM users WHERE id = $1`, [
          userId,
        ]);
        return result.rows[0];
      },
    );

    if (!userData) {
      throw new NotFoundException(`User with ID ${userId} not found`);
    }

    if (userData.status !== 'onboarding' && userData.status !== 'confirm') {
      throw new BadRequestException(
        'Only onboarding or confirm requests can be rejected',
      );
    }

    const statusId = await this.getStatusId('rejected');

    const updatedUser = await this.tenantService.executeInTenant(
      gymId,
      async (client) => {
        await client.query(
          `UPDATE users SET status = 'rejected', status_id = $2, updated_at = NOW() WHERE id = $1`,
          [userId, statusId],
        );

        const result = await client.query(`SELECT * FROM users WHERE id = $1`, [
          userId,
        ]);
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
      null, // branchId can be added if needed
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

    return assignments.map((a: any) => ({
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
      null, // branchId can be added if needed
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

    return assignments.map((a: any) => ({
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
}
