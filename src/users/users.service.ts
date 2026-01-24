import { Injectable, NotFoundException, ConflictException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';
import { TenantService } from '../tenant/tenant.service';
import { CreateUserDto, UpdateUserDto } from './dto/create-user.dto';
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
  gymId: number; // Required for tenant context
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

  private formatUser(user: any, gym?: any) {
    return {
      id: user.id,
      name: user.name,
      email: user.email,
      phone: user.phone,
      avatar: user.avatar,
      bio: user.bio,
      role: user.role_code || user.role || 'client',
      status: user.status,
      dateOfBirth: user.date_of_birth || user.dateOfBirth,
      gender: user.gender,
      address: user.address,
      city: user.city,
      state: user.state,
      zipCode: user.zip_code || user.zipCode,
      attendanceCode: user.attendance_code || user.attendanceCode,
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

  async create(createUserDto: CreateUserDto, gymId: number, creatorId?: number): Promise<any> {
    if (!createUserDto.password) {
      throw new BadRequestException('Password is required');
    }

    const roleCode = createUserDto.role || 'client';

    // Check if email already exists in any tenant (via user_tenant_mappings)
    const existingMapping = await this.prisma.userTenantMapping.findUnique({
      where: { email: createUserDto.email },
    });

    if (existingMapping) {
      throw new ConflictException('User with this email already exists');
    }

    // Find role lookup from public schema
    const roleLookup = await this.prisma.lookup.findFirst({
      where: {
        lookupType: { code: 'USER_ROLE' },
        code: roleCode,
      },
    });

    if (!roleLookup) {
      throw new NotFoundException(`Role ${roleCode} not found`);
    }

    const [passwordHash, attendanceCode] = await Promise.all([
      this.hashPassword(createUserDto.password),
      this.generateUniqueAttendanceCode(gymId),
    ]);

    // Create user in tenant schema
    const createdUser = await this.tenantService.executeInTenant(gymId, async (client) => {
      const result = await client.query(
        `INSERT INTO users (
          name, email, password_hash, phone, avatar, bio, role_id, status,
          date_of_birth, gender, address, city, state, zip_code,
          join_date, attendance_code, created_at, updated_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, NOW(), NOW())
        RETURNING *`,
        [
          createUserDto.name,
          createUserDto.email,
          passwordHash,
          createUserDto.phone || null,
          createUserDto.avatar || null,
          createUserDto.bio || null,
          roleLookup.id,
          createUserDto.status || 'active',
          createUserDto.dateOfBirth ? new Date(createUserDto.dateOfBirth) : null,
          createUserDto.gender || null,
          createUserDto.address || null,
          createUserDto.city || null,
          createUserDto.state || null,
          createUserDto.zipCode || null,
          new Date(),
          attendanceCode,
        ]
      );
      return result.rows[0];
    });

    // Create user-tenant mapping in public schema
    await this.prisma.userTenantMapping.create({
      data: {
        email: createUserDto.email,
        gymId: gymId,
        tenantUserId: createdUser.id,
        role: roleCode,
        isActive: true,
      },
    });

    const gym = await this.prisma.gym.findUnique({ where: { id: gymId } });
    return this.formatUser({ ...createdUser, role_code: roleCode }, gym);
  }

  async findAll(filters: UserFilters): Promise<PaginatedResponse<any>> {
    const { page, limit, skip, take, noPagination } = getPaginationParams(filters);
    const gymId = filters.gymId;

    if (!gymId) {
      throw new BadRequestException('gymId is required');
    }

    const { users, total } = await this.tenantService.executeInTenant(gymId, async (client) => {
      // Build WHERE clause
      const conditions: string[] = ['1=1'];
      const values: any[] = [];
      let paramIndex = 1;

      if (filters.role && filters.role !== 'all') {
        conditions.push(`l.code = $${paramIndex++}`);
        values.push(filters.role);
      }
      if (filters.status && filters.status !== 'all') {
        conditions.push(`u.status = $${paramIndex++}`);
        values.push(filters.status);
      }
      if (filters.search) {
        conditions.push(`(u.name ILIKE $${paramIndex} OR u.email ILIKE $${paramIndex} OR u.phone ILIKE $${paramIndex})`);
        values.push(`%${filters.search}%`);
        paramIndex++;
      }

      const whereClause = conditions.join(' AND ');

      // Get total count
      const countResult = await client.query(
        `SELECT COUNT(*) as count FROM users u
         LEFT JOIN public.lookups l ON l.id = u.role_id
         WHERE ${whereClause}`,
        values
      );
      const total = parseInt(countResult.rows[0].count, 10);

      // Get paginated users
      const usersResult = await client.query(
        `SELECT u.*, l.code as role_code
         FROM users u
         LEFT JOIN public.lookups l ON l.id = u.role_id
         WHERE ${whereClause}
         ORDER BY u.created_at DESC
         LIMIT $${paramIndex++} OFFSET $${paramIndex}`,
        [...values, take, skip]
      );

      return { users: usersResult.rows, total };
    });

    const gym = await this.prisma.gym.findUnique({ where: { id: gymId } });

    return {
      data: users.map((user: any) => this.formatUser(user, gym)),
      pagination: createPaginationMeta(total, page, limit, noPagination),
    };
  }

  async findOne(id: number, gymId: number): Promise<any> {
    const userData = await this.tenantService.executeInTenant(gymId, async (client) => {
      const result = await client.query(
        `SELECT u.*, l.code as role_code
         FROM users u
         LEFT JOIN public.lookups l ON l.id = u.role_id
         WHERE u.id = $1`,
        [id]
      );
      return result.rows[0];
    });

    if (!userData) {
      throw new NotFoundException(`User with ID ${id} not found`);
    }

    const gym = await this.prisma.gym.findUnique({ where: { id: gymId } });
    return this.formatUser(userData, gym);
  }

  async findByRole(role: string, gymId: number): Promise<PaginatedResponse<any>> {
    return this.findAll({ role, gymId, noPagination: true });
  }

  async update(id: number, gymId: number, updateUserDto: UpdateUserDto): Promise<any> {
    await this.findOne(id, gymId);

    const { role: roleCode, ...updateData } = updateUserDto;

    let roleId: number | undefined;
    if (roleCode) {
      const roleLookup = await this.prisma.lookup.findFirst({
        where: {
          lookupType: { code: 'USER_ROLE' },
          code: roleCode,
        },
      });

      if (!roleLookup) {
        throw new NotFoundException(`Role ${roleCode} not found`);
      }
      roleId = roleLookup.id;
    }

    // Build update query dynamically
    const updates: string[] = [];
    const values: any[] = [];
    let paramIndex = 1;

    if (updateData.name) {
      updates.push(`name = $${paramIndex++}`);
      values.push(updateData.name);
    }
    if (updateData.phone !== undefined) {
      updates.push(`phone = $${paramIndex++}`);
      values.push(updateData.phone);
    }
    if (updateData.avatar !== undefined) {
      updates.push(`avatar = $${paramIndex++}`);
      values.push(updateData.avatar);
    }
    if (updateData.bio !== undefined) {
      updates.push(`bio = $${paramIndex++}`);
      values.push(updateData.bio);
    }
    if (updateData.status) {
      updates.push(`status = $${paramIndex++}`);
      values.push(updateData.status);
    }
    if (updateData.dateOfBirth !== undefined) {
      updates.push(`date_of_birth = $${paramIndex++}`);
      values.push(updateData.dateOfBirth ? new Date(updateData.dateOfBirth) : null);
    }
    if (updateData.gender !== undefined) {
      updates.push(`gender = $${paramIndex++}`);
      values.push(updateData.gender);
    }
    if (updateData.address !== undefined) {
      updates.push(`address = $${paramIndex++}`);
      values.push(updateData.address);
    }
    if (updateData.city !== undefined) {
      updates.push(`city = $${paramIndex++}`);
      values.push(updateData.city);
    }
    if (updateData.state !== undefined) {
      updates.push(`state = $${paramIndex++}`);
      values.push(updateData.state);
    }
    if (updateData.zipCode !== undefined) {
      updates.push(`zip_code = $${paramIndex++}`);
      values.push(updateData.zipCode);
    }
    if (roleId) {
      updates.push(`role_id = $${paramIndex++}`);
      values.push(roleId);
    }

    updates.push(`updated_at = NOW()`);
    values.push(id);

    const userData = await this.tenantService.executeInTenant(gymId, async (client) => {
      await client.query(
        `UPDATE users SET ${updates.join(', ')} WHERE id = $${paramIndex}`,
        values
      );

      const result = await client.query(
        `SELECT u.*, l.code as role_code
         FROM users u
         LEFT JOIN public.lookups l ON l.id = u.role_id
         WHERE u.id = $1`,
        [id]
      );
      return result.rows[0];
    });

    // Update role in user_tenant_mapping if changed
    if (roleCode) {
      await this.prisma.userTenantMapping.updateMany({
        where: { gymId, tenantUserId: id },
        data: { role: roleCode },
      });
    }

    const gym = await this.prisma.gym.findUnique({ where: { id: gymId } });
    return this.formatUser(userData, gym);
  }

  async remove(id: number, gymId: number): Promise<{ success: boolean }> {
    const userData = await this.tenantService.executeInTenant(gymId, async (client) => {
      const result = await client.query(
        `SELECT u.*, l.code as role_code FROM users u
         LEFT JOIN public.lookups l ON l.id = u.role_id
         WHERE u.id = $1`,
        [id]
      );
      return result.rows[0];
    });

    if (!userData) {
      throw new NotFoundException(`User with ID ${id} not found`);
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
        'Cannot delete user. User has active or pending memberships. Please cancel the memberships first.',
      );
    }

    // Delete user from tenant schema
    await this.tenantService.executeInTenant(gymId, async (client) => {
      await client.query(`DELETE FROM users WHERE id = $1`, [id]);
    });

    // Delete user-tenant mapping
    await this.prisma.userTenantMapping.deleteMany({
      where: { gymId, tenantUserId: id },
    });

    return { success: true };
  }

  async updateStatus(userId: number, gymId: number, status: string): Promise<any> {
    return this.update(userId, gymId, { status } as UpdateUserDto);
  }

  async resetPassword(userId: number, gymId: number, newPassword: string): Promise<{ success: boolean }> {
    await this.findOne(userId, gymId);

    const passwordHash = await this.hashPassword(newPassword);

    await this.tenantService.executeInTenant(gymId, async (client) => {
      await client.query(
        `UPDATE users SET password_hash = $1, updated_at = NOW() WHERE id = $2`,
        [passwordHash, userId]
      );
    });

    return { success: true };
  }

  async regenerateAttendanceCode(userId: number, gymId: number): Promise<{ success: boolean; attendanceCode: string }> {
    await this.findOne(userId, gymId);

    const attendanceCode = await this.generateUniqueAttendanceCode(gymId);

    await this.tenantService.executeInTenant(gymId, async (client) => {
      await client.query(
        `UPDATE users SET attendance_code = $1, updated_at = NOW() WHERE id = $2`,
        [attendanceCode, userId]
      );
    });

    return { success: true, attendanceCode };
  }

  async approveRequest(userId: number, gymId: number, role: string): Promise<any> {
    const userData = await this.tenantService.executeInTenant(gymId, async (client) => {
      const result = await client.query(
        `SELECT u.*, l.code as role_code FROM users u
         LEFT JOIN public.lookups l ON l.id = u.role_id
         WHERE u.id = $1`,
        [userId]
      );
      return result.rows[0];
    });

    if (!userData) {
      throw new NotFoundException(`User with ID ${userId} not found`);
    }

    if (userData.status !== 'pending') {
      throw new BadRequestException('Only pending requests can be approved');
    }

    const roleLookup = await this.prisma.lookup.findFirst({
      where: {
        lookupType: { code: 'USER_ROLE' },
        code: role,
      },
    });

    if (!roleLookup) {
      throw new NotFoundException(`Role ${role} not found`);
    }

    const updatedUser = await this.tenantService.executeInTenant(gymId, async (client) => {
      await client.query(
        `UPDATE users SET status = 'active', role_id = $1, updated_at = NOW() WHERE id = $2`,
        [roleLookup.id, userId]
      );

      const result = await client.query(
        `SELECT u.*, l.code as role_code FROM users u
         LEFT JOIN public.lookups l ON l.id = u.role_id
         WHERE u.id = $1`,
        [userId]
      );
      return result.rows[0];
    });

    // Update role in user_tenant_mapping
    await this.prisma.userTenantMapping.updateMany({
      where: { gymId, tenantUserId: userId },
      data: { role, isActive: true },
    });

    const gym = await this.prisma.gym.findUnique({ where: { id: gymId } });
    return this.formatUser(updatedUser, gym);
  }

  async rejectRequest(userId: number, gymId: number): Promise<any> {
    const userData = await this.tenantService.executeInTenant(gymId, async (client) => {
      const result = await client.query(
        `SELECT u.*, l.code as role_code FROM users u
         LEFT JOIN public.lookups l ON l.id = u.role_id
         WHERE u.id = $1`,
        [userId]
      );
      return result.rows[0];
    });

    if (!userData) {
      throw new NotFoundException(`User with ID ${userId} not found`);
    }

    if (userData.status !== 'pending') {
      throw new BadRequestException('Only pending requests can be rejected');
    }

    const updatedUser = await this.tenantService.executeInTenant(gymId, async (client) => {
      await client.query(
        `UPDATE users SET status = 'rejected', updated_at = NOW() WHERE id = $1`,
        [userId]
      );

      const result = await client.query(
        `SELECT u.*, l.code as role_code FROM users u
         LEFT JOIN public.lookups l ON l.id = u.role_id
         WHERE u.id = $1`,
        [userId]
      );
      return result.rows[0];
    });

    const gym = await this.prisma.gym.findUnique({ where: { id: gymId } });
    return this.formatUser(updatedUser, gym);
  }
}
