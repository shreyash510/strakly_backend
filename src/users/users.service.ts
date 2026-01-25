import { Injectable, NotFoundException, ConflictException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';
import { TenantService } from '../tenant/tenant.service';
import { CreateUserDto, UpdateUserDto, CreateStaffDto, CreateClientDto } from './dto/create-user.dto';
import * as bcrypt from 'bcrypt';
import {
  PaginationParams,
  PaginatedResponse,
  getPaginationParams,
  createPaginationMeta,
} from '../common/pagination.util';

export interface UserFilters extends PaginationParams {
  role?: string;
  status?: string;
  gymId?: number;
  isSuperAdmin?: boolean;
  userType?: 'staff' | 'client' | 'all'; // New: filter by user type
}

@Injectable()
export class UsersService {
  private readonly SALT_ROUNDS = 10;

  constructor(
    private readonly prisma: PrismaService,
    private readonly tenantService: TenantService,
  ) {}

  private async hashPassword(password: string): Promise<string> {
    return bcrypt.hash(password, this.SALT_ROUNDS);
  }

  private async generateUniqueAttendanceCode(gymId: number): Promise<string> {
    const batchSize = 10;
    const maxAttempts = 5;

    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      const candidates: string[] = [];
      for (let i = 0; i < batchSize; i++) {
        const code = String(Math.floor(1000 + Math.random() * 9000));
        candidates.push(code);
      }

      const existing = await this.tenantService.executeInTenant(gymId, async (client) => {
        const result = await client.query(
          `SELECT attendance_code FROM users WHERE attendance_code = ANY($1)`,
          [candidates]
        );
        return result.rows.map((r: any) => r.attendance_code);
      });

      const existingCodes = new Set(existing);

      for (const code of candidates) {
        if (!existingCodes.has(code)) {
          return code;
        }
      }
    }

    return String(Math.floor(100000 + Math.random() * 900000));
  }

  private formatStaffUser(user: any, gymAssignments?: any[]) {
    const primaryAssignment = gymAssignments?.find((a) => a.isPrimary) || gymAssignments?.[0];
    return {
      id: user.id,
      name: user.name,
      email: user.email,
      phone: user.phone,
      avatar: user.avatar,
      bio: user.bio,
      role: primaryAssignment?.role || 'staff',
      status: user.status,
      dateOfBirth: user.dateOfBirth,
      gender: user.gender,
      address: user.address,
      city: user.city,
      state: user.state,
      zipCode: user.zipCode,
      userType: 'staff',
      gyms: gymAssignments?.map((a) => ({
        gymId: a.gymId,
        gymName: a.gym?.name,
        role: a.role,
        isPrimary: a.isPrimary,
      })) || [],
      createdAt: user.createdAt,
      updatedAt: user.updatedAt,
    };
  }

  private formatClientUser(user: any, gym?: any) {
    return {
      id: user.id,
      name: user.name,
      email: user.email,
      phone: user.phone,
      avatar: user.avatar,
      bio: user.bio,
      role: 'client',
      status: user.status,
      dateOfBirth: user.date_of_birth || user.dateOfBirth,
      gender: user.gender,
      address: user.address,
      city: user.city,
      state: user.state,
      zipCode: user.zip_code || user.zipCode,
      attendanceCode: user.attendance_code || user.attendanceCode,
      userType: 'client',
      gymId: gym?.id,
      gym: gym ? {
        id: gym.id,
        name: gym.name,
        logo: gym.logo,
        city: gym.city,
        state: gym.state,
      } : null,
      bodyMetrics: user.bodyMetrics || null,
      bodyMetricsHistory: user.bodyMetricsHistory || [],
      createdAt: user.created_at || user.createdAt,
      updatedAt: user.updated_at || user.updatedAt,
    };
  }

  // ============================================
  // STAFF OPERATIONS (public.users)
  // ============================================

  /**
   * Create a new staff member (admin, manager, trainer) in public.users
   */
  async createStaff(dto: CreateStaffDto, gymId: number): Promise<any> {
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

    const passwordHash = await this.hashPassword(dto.password);

    // Create user in public.users
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
        status: dto.status || 'active',
      },
    });

    // Create gym assignment
    const assignment = await this.prisma.userGymXref.create({
      data: {
        userId: createdUser.id,
        gymId,
        role: dto.role || 'trainer',
        isPrimary: true,
        isActive: true,
      },
      include: { gym: true },
    });

    return this.formatStaffUser(createdUser, [assignment]);
  }

  /**
   * Get all staff members for a gym
   */
  async findAllStaff(filters: UserFilters): Promise<PaginatedResponse<any>> {
    const { page, limit, skip, take, noPagination } = getPaginationParams(filters);
    const gymId = filters.gymId;

    const where: any = {
      isDeleted: false,
    };

    // Filter by gym if provided
    if (gymId) {
      where.gymAssignments = {
        some: { gymId, isActive: true },
      };
    }

    // Filter by role
    if (filters.role && filters.role !== 'all') {
      where.gymAssignments = {
        ...where.gymAssignments,
        some: {
          ...where.gymAssignments?.some,
          role: filters.role,
        },
      };
    }

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
      data: users.map((user) => this.formatStaffUser(user, user.gymAssignments)),
      pagination: createPaginationMeta(total, page, limit, noPagination),
    };
  }

  /**
   * Get a single staff member
   */
  async findOneStaff(id: number, gymId?: number): Promise<any> {
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
      throw new NotFoundException(`Staff member with ID ${id} not found`);
    }

    return this.formatStaffUser(user, user.gymAssignments);
  }

  /**
   * Update a staff member
   */
  async updateStaff(id: number, gymId: number, updateDto: UpdateUserDto): Promise<any> {
    const user = await this.prisma.user.findUnique({
      where: { id, isDeleted: false },
    });

    if (!user) {
      throw new NotFoundException(`Staff member with ID ${id} not found`);
    }

    const { role, ...updateData } = updateDto;

    // Update user data
    const updatedUser = await this.prisma.user.update({
      where: { id },
      data: {
        ...(updateData.name && { name: updateData.name }),
        ...(updateData.phone !== undefined && { phone: updateData.phone }),
        ...(updateData.avatar !== undefined && { avatar: updateData.avatar }),
        ...(updateData.bio !== undefined && { bio: updateData.bio }),
        ...(updateData.status && { status: updateData.status }),
        ...(updateData.dateOfBirth !== undefined && {
          dateOfBirth: updateData.dateOfBirth ? new Date(updateData.dateOfBirth) : null,
        }),
        ...(updateData.gender !== undefined && { gender: updateData.gender }),
        ...(updateData.address !== undefined && { address: updateData.address }),
        ...(updateData.city !== undefined && { city: updateData.city }),
        ...(updateData.state !== undefined && { state: updateData.state }),
        ...(updateData.zipCode !== undefined && { zipCode: updateData.zipCode }),
      },
      include: {
        gymAssignments: {
          where: { gymId, isActive: true },
          include: { gym: true },
        },
      },
    });

    // Update role if provided
    if (role) {
      await this.prisma.userGymXref.updateMany({
        where: { userId: id, gymId },
        data: { role },
      });
    }

    // Refresh gym assignments
    const refreshedUser = await this.prisma.user.findUnique({
      where: { id },
      include: {
        gymAssignments: {
          where: { gymId, isActive: true },
          include: { gym: true },
        },
      },
    });

    return this.formatStaffUser(refreshedUser!, refreshedUser!.gymAssignments);
  }

  /**
   * Soft delete a staff member
   */
  async removeStaff(id: number): Promise<{ success: boolean }> {
    const user = await this.prisma.user.findUnique({
      where: { id, isDeleted: false },
    });

    if (!user) {
      throw new NotFoundException(`Staff member with ID ${id} not found`);
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
  // CLIENT OPERATIONS (tenant.users)
  // ============================================

  /**
   * Create a new client in tenant schema
   */
  async createClient(dto: CreateClientDto, gymId: number): Promise<any> {
    if (!dto.password) {
      throw new BadRequestException('Password is required');
    }

    // Check if email already exists in this tenant
    const existingClient = await this.tenantService.executeInTenant(gymId, async (client) => {
      const result = await client.query(
        `SELECT id FROM users WHERE email = $1`,
        [dto.email]
      );
      return result.rows[0];
    });

    if (existingClient) {
      throw new ConflictException('Client with this email already exists in this gym');
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

    const [passwordHash, attendanceCode] = await Promise.all([
      this.hashPassword(dto.password),
      this.generateUniqueAttendanceCode(gymId),
    ]);

    // Create client in tenant schema
    const createdClient = await this.tenantService.executeInTenant(gymId, async (client) => {
      const result = await client.query(
        `INSERT INTO users (
          name, email, password_hash, phone, avatar, bio, status,
          date_of_birth, gender, address, city, state, zip_code,
          emergency_contact_name, emergency_contact_phone,
          join_date, attendance_code, created_at, updated_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, NOW(), NOW())
        RETURNING *`,
        [
          dto.name,
          dto.email,
          passwordHash,
          dto.phone || null,
          dto.avatar || null,
          dto.bio || null,
          dto.status || 'active',
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
        ]
      );
      return result.rows[0];
    });

    const gym = await this.prisma.gym.findUnique({ where: { id: gymId } });
    return this.formatClientUser(createdClient, gym);
  }

  /**
   * Get all clients for a gym
   */
  async findAllClients(filters: UserFilters): Promise<PaginatedResponse<any>> {
    const { page, limit, skip, take, noPagination } = getPaginationParams(filters);
    const gymId = filters.gymId;

    if (!gymId) {
      throw new BadRequestException('gymId is required for fetching clients');
    }

    const { users, total } = await this.tenantService.executeInTenant(gymId, async (client) => {
      const conditions: string[] = ['1=1'];
      const values: any[] = [];
      let paramIndex = 1;

      if (filters.status && filters.status !== 'all') {
        conditions.push(`status = $${paramIndex++}`);
        values.push(filters.status);
      }

      if (filters.search) {
        conditions.push(`(name ILIKE $${paramIndex} OR email ILIKE $${paramIndex} OR phone ILIKE $${paramIndex})`);
        values.push(`%${filters.search}%`);
        paramIndex++;
      }

      const whereClause = conditions.join(' AND ');

      const [usersResult, countResult] = await Promise.all([
        client.query(
          `SELECT * FROM users
           WHERE ${whereClause}
           ORDER BY created_at DESC
           LIMIT $${paramIndex++} OFFSET $${paramIndex}`,
          [...values, take, skip]
        ),
        client.query(
          `SELECT COUNT(*) as count FROM users WHERE ${whereClause}`,
          values
        ),
      ]);

      return {
        users: usersResult.rows,
        total: parseInt(countResult.rows[0].count, 10),
      };
    });

    const gym = await this.prisma.gym.findUnique({ where: { id: gymId } });

    return {
      data: users.map((user: any) => this.formatClientUser(user, gym)),
      pagination: createPaginationMeta(total, page, limit, noPagination),
    };
  }

  /**
   * Get a single client
   */
  async findOneClient(id: number, gymId: number): Promise<any> {
    const clientData = await this.tenantService.executeInTenant(gymId, async (client) => {
      const result = await client.query(
        `SELECT * FROM users WHERE id = $1`,
        [id]
      );
      return result.rows[0];
    });

    if (!clientData) {
      throw new NotFoundException(`Client with ID ${id} not found`);
    }

    const gym = await this.prisma.gym.findUnique({ where: { id: gymId } });
    return this.formatClientUser(clientData, gym);
  }

  /**
   * Update a client
   */
  async updateClient(id: number, gymId: number, updateDto: UpdateUserDto): Promise<any> {
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
    }
    if (updateDto.dateOfBirth !== undefined) {
      updates.push(`date_of_birth = $${paramIndex++}`);
      values.push(updateDto.dateOfBirth ? new Date(updateDto.dateOfBirth) : null);
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

    updates.push(`updated_at = NOW()`);
    values.push(id);

    const updatedClient = await this.tenantService.executeInTenant(gymId, async (client) => {
      await client.query(
        `UPDATE users SET ${updates.join(', ')} WHERE id = $${paramIndex}`,
        values
      );

      const result = await client.query(
        `SELECT * FROM users WHERE id = $1`,
        [id]
      );
      return result.rows[0];
    });

    const gym = await this.prisma.gym.findUnique({ where: { id: gymId } });
    return this.formatClientUser(updatedClient, gym);
  }

  /**
   * Delete a client
   */
  async removeClient(id: number, gymId: number): Promise<{ success: boolean }> {
    const clientData = await this.tenantService.executeInTenant(gymId, async (client) => {
      const result = await client.query(
        `SELECT * FROM users WHERE id = $1`,
        [id]
      );
      return result.rows[0];
    });

    if (!clientData) {
      throw new NotFoundException(`Client with ID ${id} not found`);
    }

    // Check for active memberships
    const activeMemberships = await this.tenantService.executeInTenant(gymId, async (client) => {
      const result = await client.query(
        `SELECT COUNT(*) as count FROM memberships WHERE user_id = $1 AND status IN ('active', 'pending')`,
        [id]
      );
      return parseInt(result.rows[0].count, 10);
    });

    if (activeMemberships > 0) {
      throw new BadRequestException(
        'Cannot delete client. Client has active or pending memberships. Please cancel the memberships first.',
      );
    }

    // Delete client from tenant schema
    await this.tenantService.executeInTenant(gymId, async (client) => {
      await client.query(`DELETE FROM users WHERE id = $1`, [id]);
    });

    return { success: true };
  }

  // ============================================
  // COMBINED OPERATIONS (for backward compatibility)
  // ============================================

  /**
   * Create user - determines type based on role
   */
  async create(createUserDto: CreateUserDto, gymId: number): Promise<any> {
    const role = createUserDto.role || 'client';

    if (role === 'client') {
      return this.createClient(createUserDto as CreateClientDto, gymId);
    } else {
      return this.createStaff(createUserDto as CreateStaffDto, gymId);
    }
  }

  /**
   * Find all users - combines staff and clients based on filters
   */
  async findAll(filters: UserFilters): Promise<PaginatedResponse<any>> {
    const userType = filters.userType || 'all';
    const role = filters.role;

    // If role is 'client', only get clients
    if (role === 'client') {
      return this.findAllClients(filters);
    }

    // If role is staff type, only get staff
    if (role && ['admin', 'manager', 'trainer'].includes(role)) {
      return this.findAllStaff(filters);
    }

    // If userType is specified
    if (userType === 'staff') {
      return this.findAllStaff(filters);
    }
    if (userType === 'client') {
      return this.findAllClients(filters);
    }

    // For 'all' type, combine both (but need gymId for clients)
    if (!filters.gymId) {
      // Without gymId, can only return staff
      return this.findAllStaff(filters);
    }

    // Combine staff and clients
    const { page, limit, noPagination } = getPaginationParams(filters);

    const [staffResult, clientResult] = await Promise.all([
      this.findAllStaff({ ...filters, noPagination: true }),
      this.findAllClients({ ...filters, noPagination: true }),
    ]);

    const allUsers = [...staffResult.data, ...clientResult.data];
    const total = allUsers.length;

    // Sort by createdAt desc
    allUsers.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

    // Apply pagination
    const skip = (page - 1) * limit;
    const paginatedUsers = noPagination ? allUsers : allUsers.slice(skip, skip + limit);

    return {
      data: paginatedUsers,
      pagination: createPaginationMeta(total, page, limit, noPagination),
    };
  }

  /**
   * Find one user by ID
   */
  async findOne(id: number, gymId: number, userType?: 'staff' | 'client'): Promise<any> {
    // If userType is specified, use that
    if (userType === 'staff') {
      return this.findOneStaff(id, gymId);
    }
    if (userType === 'client') {
      return this.findOneClient(id, gymId);
    }

    // Try to find in public.users first (staff)
    try {
      const staff = await this.findOneStaff(id, gymId);
      return staff;
    } catch (e) {
      // Not found in staff, try clients
    }

    // Try to find in tenant schema (client)
    return this.findOneClient(id, gymId);
  }

  /**
   * Update user
   */
  async update(id: number, gymId: number, updateUserDto: UpdateUserDto, userType?: 'staff' | 'client'): Promise<any> {
    if (userType === 'staff') {
      return this.updateStaff(id, gymId, updateUserDto);
    }
    if (userType === 'client') {
      return this.updateClient(id, gymId, updateUserDto);
    }

    // Try to determine user type
    const staff = await this.prisma.user.findUnique({
      where: { id, isDeleted: false },
    });

    if (staff) {
      return this.updateStaff(id, gymId, updateUserDto);
    }

    return this.updateClient(id, gymId, updateUserDto);
  }

  /**
   * Delete user
   */
  async remove(id: number, gymId: number, userType?: 'staff' | 'client'): Promise<{ success: boolean }> {
    if (userType === 'staff') {
      return this.removeStaff(id);
    }
    if (userType === 'client') {
      return this.removeClient(id, gymId);
    }

    // Try to determine user type
    const staff = await this.prisma.user.findUnique({
      where: { id, isDeleted: false },
    });

    if (staff) {
      return this.removeStaff(id);
    }

    return this.removeClient(id, gymId);
  }

  // ============================================
  // HELPER METHODS
  // ============================================

  async updateStatus(userId: number, gymId: number, status: string, userType?: 'staff' | 'client'): Promise<any> {
    return this.update(userId, gymId, { status } as UpdateUserDto, userType);
  }

  async resetPassword(userId: number, gymId: number, newPassword: string, userType?: 'staff' | 'client'): Promise<{ success: boolean }> {
    const passwordHash = await this.hashPassword(newPassword);

    if (userType === 'staff') {
      await this.prisma.user.update({
        where: { id: userId },
        data: { passwordHash },
      });
      return { success: true };
    }

    if (userType === 'client') {
      await this.tenantService.executeInTenant(gymId, async (client) => {
        await client.query(
          `UPDATE users SET password_hash = $1, updated_at = NOW() WHERE id = $2`,
          [passwordHash, userId]
        );
      });
      return { success: true };
    }

    // Try to determine user type
    const staff = await this.prisma.user.findUnique({
      where: { id: userId, isDeleted: false },
    });

    if (staff) {
      await this.prisma.user.update({
        where: { id: userId },
        data: { passwordHash },
      });
    } else {
      await this.tenantService.executeInTenant(gymId, async (client) => {
        await client.query(
          `UPDATE users SET password_hash = $1, updated_at = NOW() WHERE id = $2`,
          [passwordHash, userId]
        );
      });
    }

    return { success: true };
  }

  async regenerateAttendanceCode(userId: number, gymId: number): Promise<{ success: boolean; attendanceCode: string }> {
    // Only clients have attendance codes
    await this.findOneClient(userId, gymId);

    const attendanceCode = await this.generateUniqueAttendanceCode(gymId);

    await this.tenantService.executeInTenant(gymId, async (client) => {
      await client.query(
        `UPDATE users SET attendance_code = $1, updated_at = NOW() WHERE id = $2`,
        [attendanceCode, userId]
      );
    });

    return { success: true, attendanceCode };
  }

  async findByRole(role: string, gymId: number): Promise<PaginatedResponse<any>> {
    if (role === 'client') {
      return this.findAllClients({ role, gymId, noPagination: true });
    }
    return this.findAllStaff({ role, gymId, noPagination: true });
  }

  /**
   * Approve pending client request
   */
  async approveRequest(userId: number, gymId: number): Promise<any> {
    const clientData = await this.tenantService.executeInTenant(gymId, async (client) => {
      const result = await client.query(
        `SELECT * FROM users WHERE id = $1`,
        [userId]
      );
      return result.rows[0];
    });

    if (!clientData) {
      throw new NotFoundException(`Client with ID ${userId} not found`);
    }

    if (clientData.status !== 'pending') {
      throw new BadRequestException('Only pending requests can be approved');
    }

    const updatedClient = await this.tenantService.executeInTenant(gymId, async (client) => {
      await client.query(
        `UPDATE users SET status = 'active', updated_at = NOW() WHERE id = $1`,
        [userId]
      );

      const result = await client.query(
        `SELECT * FROM users WHERE id = $1`,
        [userId]
      );
      return result.rows[0];
    });

    const gym = await this.prisma.gym.findUnique({ where: { id: gymId } });
    return this.formatClientUser(updatedClient, gym);
  }

  /**
   * Reject pending client request
   */
  async rejectRequest(userId: number, gymId: number): Promise<any> {
    const clientData = await this.tenantService.executeInTenant(gymId, async (client) => {
      const result = await client.query(
        `SELECT * FROM users WHERE id = $1`,
        [userId]
      );
      return result.rows[0];
    });

    if (!clientData) {
      throw new NotFoundException(`Client with ID ${userId} not found`);
    }

    if (clientData.status !== 'pending') {
      throw new BadRequestException('Only pending requests can be rejected');
    }

    const updatedClient = await this.tenantService.executeInTenant(gymId, async (client) => {
      await client.query(
        `UPDATE users SET status = 'rejected', updated_at = NOW() WHERE id = $1`,
        [userId]
      );

      const result = await client.query(
        `SELECT * FROM users WHERE id = $1`,
        [userId]
      );
      return result.rows[0];
    });

    const gym = await this.prisma.gym.findUnique({ where: { id: gymId } });
    return this.formatClientUser(updatedClient, gym);
  }
}
