import {
  Injectable,
  UnauthorizedException,
  ConflictException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { PrismaService } from '../database/prisma.service';
import { TenantService } from '../tenant/tenant.service';
import { CreateUserDto } from './dto/create-user.dto';
import { LoginDto } from './dto/login.dto';
import { RegisterAdminWithGymDto } from './dto/register-admin-with-gym.dto';
import * as bcrypt from 'bcrypt';

export interface GymInfo {
  id: number;
  name: string;
  logo?: string;
  city?: string;
  state?: string;
  tenantSchemaName: string;
}

export interface UserResponse {
  id: number;
  name: string;
  email: string;
  role?: string;
  avatar?: string;
  status?: string;
  phone?: string;
  attendanceCode?: string;
  gymId?: number;
  gym?: GymInfo;
  createdAt?: Date;
  updatedAt?: Date;
}

export interface AuthResponse {
  user: UserResponse;
  accessToken: string;
  tokens?: {
    accessToken: string;
    refreshToken?: string;
    expiresIn: number;
    tokenType: string;
  };
}

@Injectable()
export class AuthService {
  private readonly SALT_ROUNDS = 10;

  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
    private readonly tenantService: TenantService,
  ) {}

  private async hashPassword(password: string): Promise<string> {
    return bcrypt.hash(password, this.SALT_ROUNDS);
  }

  private async generateUniqueAttendanceCode(gymId: number): Promise<string> {
    /* Generate batch of candidate codes and check in single query for efficiency */
    const batchSize = 10;
    const maxAttempts = 5;

    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      /* Generate batch of random 4-digit codes */
      const candidates: string[] = [];
      for (let i = 0; i < batchSize; i++) {
        const code = String(Math.floor(1000 + Math.random() * 9000));
        candidates.push(code);
      }

      /* Check which codes already exist in tenant schema */
      const existing = await this.tenantService.executeInTenant(gymId, async (client) => {
        const result = await client.query(
          `SELECT attendance_code FROM users WHERE attendance_code = ANY($1)`,
          [candidates]
        );
        return result.rows.map((r: any) => r.attendance_code);
      });

      const existingCodes = new Set(existing);

      /* Return first available code */
      for (const code of candidates) {
        if (!existingCodes.has(code)) {
          return code;
        }
      }
    }

    /* Fallback: generate 6-digit code if 4-digit space is exhausted */
    return String(Math.floor(100000 + Math.random() * 900000));
  }

  private async comparePassword(password: string, hash: string): Promise<boolean> {
    return bcrypt.compare(password, hash);
  }

  private generateToken(user: UserResponse): string {
    const payload = {
      sub: user.id,
      email: user.email,
      name: user.name,
      role: user.role || 'client',
      gymId: user.gymId || null,
      tenantSchemaName: user.gym?.tenantSchemaName || null,
    };
    return this.jwtService.sign(payload);
  }

  private toUserResponse(user: any, gym?: any): UserResponse {
    return {
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role_code || user.role || 'client',
      avatar: user.avatar,
      status: user.status || 'active',
      phone: user.phone,
      attendanceCode: user.attendance_code || user.attendanceCode,
      gymId: gym?.id,
      gym: gym ? {
        id: gym.id,
        name: gym.name,
        logo: gym.logo || undefined,
        city: gym.city || undefined,
        state: gym.state || undefined,
        tenantSchemaName: gym.tenantSchemaName || gym.tenant_schema_name,
      } : undefined,
      createdAt: user.created_at || user.createdAt,
      updatedAt: user.updated_at || user.updatedAt,
    };
  }

  /**
   * Register a new admin with their gym (creates tenant schema)
   */
  async registerAdminWithGym(dto: RegisterAdminWithGymDto): Promise<AuthResponse> {
    // Check if user already exists in any tenant
    const existingMapping = await this.prisma.userTenantMapping.findUnique({
      where: { email: dto.user.email },
    });

    if (existingMapping) {
      throw new ConflictException('User with this email already exists');
    }

    // Find the 'admin' role from Lookup table
    const adminRole = await this.prisma.lookup.findFirst({
      where: {
        lookupType: { code: 'USER_ROLE' },
        code: 'admin',
      },
    });

    if (!adminRole) {
      throw new Error('Admin role not found in lookup table');
    }

    // Hash password before transaction
    const passwordHash = await this.hashPassword(dto.user.password);

    // Create gym and get gym ID first
    const gym = await this.prisma.gym.create({
      data: {
        name: dto.gym.name,
        tenantSchemaName: 'pending', // Will update after getting ID
        phone: dto.gym.phone,
        email: dto.gym.email,
        address: dto.gym.address,
        city: dto.gym.city,
        state: dto.gym.state,
        zipCode: dto.gym.zipCode,
        country: dto.gym.country || 'India',
        isActive: true,
      },
    });

    // Update tenant schema name with the gym ID
    const tenantSchemaName = this.tenantService.getTenantSchemaName(gym.id);
    await this.prisma.gym.update({
      where: { id: gym.id },
      data: { tenantSchemaName },
    });

    // Create the tenant schema with all tables
    await this.tenantService.createTenantSchema(gym.id);

    // Generate unique attendance code for the new user
    const attendanceCode = await this.generateUniqueAttendanceCode(gym.id);

    // Create admin user in the tenant schema
    const createdUser = await this.tenantService.executeInTenant(gym.id, async (client) => {
      const result = await client.query(
        `INSERT INTO users (name, email, password_hash, role_id, status, join_date, attendance_code, created_at, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, NOW(), NOW())
         RETURNING *`,
        [dto.user.name, dto.user.email, passwordHash, adminRole.id, 'active', new Date(), attendanceCode]
      );
      return result.rows[0];
    });

    // Create user-tenant mapping in public schema
    await this.prisma.userTenantMapping.create({
      data: {
        email: dto.user.email,
        gymId: gym.id,
        tenantUserId: createdUser.id,
        role: 'admin',
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

      await this.prisma.gymSubscription.create({
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

    const updatedGym = await this.prisma.gym.findUnique({
      where: { id: gym.id },
    });

    const user = this.toUserResponse({ ...createdUser, role_code: 'admin' }, updatedGym);
    const accessToken = this.generateToken(user);

    return {
      user,
      accessToken,
      tokens: {
        accessToken,
        expiresIn: 604800, // 7 days in seconds
        tokenType: 'Bearer',
      },
    };
  }

  /**
   * Login user - checks superadmin first, then tenant users
   */
  async login(loginDto: LoginDto): Promise<AuthResponse> {
    // First, check if this is a superadmin login
    const systemUser = await this.prisma.systemUser.findUnique({
      where: { email: loginDto.email },
    });

    if (systemUser) {
      // Superadmin login flow
      if (!systemUser.isActive) {
        throw new UnauthorizedException('Your account has been deactivated');
      }

      const isPasswordValid = await this.comparePassword(
        loginDto.password,
        systemUser.passwordHash,
      );

      if (!isPasswordValid) {
        throw new UnauthorizedException('Invalid credentials');
      }

      // Update last login time
      await this.prisma.systemUser.update({
        where: { id: systemUser.id },
        data: { lastLoginAt: new Date() },
      });

      const user: UserResponse = {
        id: systemUser.id,
        name: systemUser.name,
        email: systemUser.email,
        role: systemUser.role,
        status: 'active',
      };

      const payload = {
        sub: systemUser.id,
        email: systemUser.email,
        name: systemUser.name,
        role: systemUser.role,
        gymId: null,
        tenantSchemaName: null,
        isSuperAdmin: true,
      };
      const accessToken = this.jwtService.sign(payload);

      return {
        user,
        accessToken,
        tokens: {
          accessToken,
          expiresIn: 604800, // 7 days in seconds
          tokenType: 'Bearer',
        },
      };
    }

    // Regular tenant user login flow
    // Find which tenant the user belongs to
    const mapping = await this.prisma.userTenantMapping.findUnique({
      where: { email: loginDto.email },
      include: { gym: true },
    });

    if (!mapping || !mapping.isActive) {
      throw new UnauthorizedException('Invalid credentials');
    }

    // Get user from tenant schema
    const userData = await this.tenantService.executeInTenant(mapping.gymId, async (client) => {
      const result = await client.query(
        `SELECT u.*, l.code as role_code
         FROM users u
         LEFT JOIN public.lookups l ON l.id = u.role_id
         WHERE u.id = $1`,
        [mapping.tenantUserId]
      );
      return result.rows[0];
    });

    if (!userData) {
      throw new UnauthorizedException('Invalid credentials');
    }

    // Check if user is suspended
    if (userData.status === 'suspended') {
      throw new UnauthorizedException('Your account has been suspended');
    }

    // Check password with bcrypt
    const isPasswordValid = await this.comparePassword(
      loginDto.password,
      userData.password_hash,
    );

    if (!isPasswordValid) {
      throw new UnauthorizedException('Invalid credentials');
    }

    // Update last login time
    await this.tenantService.executeInTenant(mapping.gymId, async (client) => {
      await client.query(
        `UPDATE users SET last_login_at = NOW() WHERE id = $1`,
        [userData.id]
      );
    });

    const user = this.toUserResponse(userData, mapping.gym);
    const accessToken = this.generateToken(user);

    return {
      user,
      accessToken,
      tokens: {
        accessToken,
        expiresIn: 604800, // 7 days in seconds
        tokenType: 'Bearer',
      },
    };
  }

  /**
   * Get user profile from tenant schema
   */
  async getProfile(userId: number, gymId: number): Promise<UserResponse> {
    const gym = await this.prisma.gym.findUnique({
      where: { id: gymId },
    });

    if (!gym) {
      throw new UnauthorizedException('Gym not found');
    }

    const userData = await this.tenantService.executeInTenant(gymId, async (client) => {
      const result = await client.query(
        `SELECT u.*, l.code as role_code
         FROM users u
         LEFT JOIN public.lookups l ON l.id = u.role_id
         WHERE u.id = $1`,
        [userId]
      );
      return result.rows[0];
    });

    if (!userData) {
      throw new UnauthorizedException('User not found');
    }

    return this.toUserResponse(userData, gym);
  }

  /**
   * Update user profile in tenant schema
   */
  async updateProfile(
    userId: number,
    gymId: number,
    data: { name?: string; bio?: string; avatar?: string; phone?: string },
  ): Promise<UserResponse> {
    const gym = await this.prisma.gym.findUnique({
      where: { id: gymId },
    });

    if (!gym) {
      throw new UnauthorizedException('Gym not found');
    }

    const updates: string[] = [];
    const values: any[] = [];
    let paramIndex = 1;

    if (data.name) {
      updates.push(`name = $${paramIndex++}`);
      values.push(data.name);
    }
    if (data.bio !== undefined) {
      updates.push(`bio = $${paramIndex++}`);
      values.push(data.bio);
    }
    if (data.avatar !== undefined) {
      updates.push(`avatar = $${paramIndex++}`);
      values.push(data.avatar);
    }
    if (data.phone !== undefined) {
      updates.push(`phone = $${paramIndex++}`);
      values.push(data.phone);
    }

    updates.push(`updated_at = NOW()`);
    values.push(userId);

    const userData = await this.tenantService.executeInTenant(gymId, async (client) => {
      const result = await client.query(
        `UPDATE users SET ${updates.join(', ')} WHERE id = $${paramIndex} RETURNING *`,
        values
      );

      // Get role code
      const userWithRole = await client.query(
        `SELECT u.*, l.code as role_code
         FROM users u
         LEFT JOIN public.lookups l ON l.id = u.role_id
         WHERE u.id = $1`,
        [userId]
      );
      return userWithRole.rows[0];
    });

    return this.toUserResponse(userData, gym);
  }

  /**
   * Change password in tenant schema
   */
  async changePassword(
    userId: number,
    gymId: number,
    currentPassword: string,
    newPassword: string,
  ): Promise<{ success: boolean }> {
    const userData = await this.tenantService.executeInTenant(gymId, async (client) => {
      const result = await client.query(
        `SELECT * FROM users WHERE id = $1`,
        [userId]
      );
      return result.rows[0];
    });

    if (!userData) {
      throw new UnauthorizedException('User not found');
    }

    // Verify current password
    const isPasswordValid = await this.comparePassword(
      currentPassword,
      userData.password_hash,
    );

    if (!isPasswordValid) {
      throw new UnauthorizedException('Current password is incorrect');
    }

    // Update password
    const newPasswordHash = await this.hashPassword(newPassword);
    await this.tenantService.executeInTenant(gymId, async (client) => {
      await client.query(
        `UPDATE users SET password_hash = $1, updated_at = NOW() WHERE id = $2`,
        [newPasswordHash, userId]
      );
    });

    return { success: true };
  }

  /**
   * Refresh token
   */
  async refreshToken(userId: number, gymId: number): Promise<{ accessToken: string }> {
    const user = await this.getProfile(userId, gymId);
    return {
      accessToken: this.generateToken(user),
    };
  }

  /**
   * Search users within a gym's tenant schema
   */
  async searchUsers(
    query: string,
    currentUserId: number,
    gymId: number,
    page: number = 1,
    limit: number = 20,
  ): Promise<{ users: UserResponse[]; hasMore: boolean; page: number; total?: number }> {
    if (!query || query.length < 2) {
      return { users: [], hasMore: false, page: 1 };
    }

    const offset = (page - 1) * limit;
    const searchPattern = `%${query}%`;

    const { users, total } = await this.tenantService.executeInTenant(gymId, async (client) => {
      const [usersResult, countResult] = await Promise.all([
        client.query(
          `SELECT u.*, l.code as role_code
           FROM users u
           LEFT JOIN public.lookups l ON l.id = u.role_id
           WHERE u.id != $1
           AND (u.name ILIKE $2 OR u.email ILIKE $2)
           ORDER BY u.name
           LIMIT $3 OFFSET $4`,
          [currentUserId, searchPattern, limit, offset]
        ),
        client.query(
          `SELECT COUNT(*) as count FROM users
           WHERE id != $1
           AND (name ILIKE $2 OR email ILIKE $2)`,
          [currentUserId, searchPattern]
        ),
      ]);
      return {
        users: usersResult.rows,
        total: parseInt(countResult.rows[0].count, 10),
      };
    });

    const gym = await this.prisma.gym.findUnique({
      where: { id: gymId },
    });

    return {
      users: users.map((user: any) => ({
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role_code || 'client',
        avatar: user.avatar ?? undefined,
      })),
      hasMore: offset + users.length < total,
      page,
      total,
    };
  }

  /**
   * Logout user
   */
  async logout(userId: number): Promise<{ success: boolean }> {
    // In a production environment, you might want to:
    // - Invalidate the token in a blacklist
    // - Remove refresh tokens from database
    // For now, we just return success as JWT tokens are stateless
    return { success: true };
  }

  /**
   * Forgot password - reset password by email
   */
  async forgotPassword(email: string, newPassword: string): Promise<{ success: boolean }> {
    // Find the user's tenant mapping
    const mapping = await this.prisma.userTenantMapping.findUnique({
      where: { email },
    });

    if (!mapping) {
      throw new UnauthorizedException('User not found');
    }

    // Update password in tenant schema
    const newPasswordHash = await this.hashPassword(newPassword);
    await this.tenantService.executeInTenant(mapping.gymId, async (client) => {
      await client.query(
        `UPDATE users SET password_hash = $1, updated_at = NOW() WHERE id = $2`,
        [newPasswordHash, mapping.tenantUserId]
      );
    });

    return { success: true };
  }

  // ============================================
  // LEGACY METHODS (kept for backwards compatibility during migration)
  // These will be removed after full migration to tenant-based architecture
  // ============================================

  async register(createUserDto: CreateUserDto): Promise<AuthResponse> {
    throw new Error('Direct registration not supported. Use registerAdminWithGym for new gyms or invite users to existing gyms.');
  }

  async registerAdmin(createUserDto: CreateUserDto): Promise<AuthResponse> {
    throw new Error('Direct admin registration not supported. Use registerAdminWithGym instead.');
  }
}
