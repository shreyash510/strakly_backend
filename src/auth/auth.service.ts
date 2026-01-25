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

export interface GymAssignment {
  gymId: number;
  role: string;
  isPrimary: boolean;
  gym: GymInfo;
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
  gyms?: GymAssignment[]; // For multi-gym users
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
  requiresGymSelection?: boolean; // True if user has multiple gyms
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

  private generateToken(user: UserResponse, gymAssignment?: GymAssignment): string {
    const payload = {
      sub: user.id,
      email: user.email,
      name: user.name,
      role: gymAssignment?.role || user.role || 'client',
      gymId: gymAssignment?.gymId || user.gymId || null,
      tenantSchemaName: gymAssignment?.gym?.tenantSchemaName || user.gym?.tenantSchemaName || null,
    };
    return this.jwtService.sign(payload);
  }

  private toUserResponse(user: any, gym?: any, gyms?: GymAssignment[]): UserResponse {
    return {
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role || 'client',
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
      gyms,
      createdAt: user.created_at || user.createdAt,
      updatedAt: user.updated_at || user.updatedAt,
    };
  }

  /**
   * Register a new admin with their gym (creates tenant schema)
   */
  async registerAdminWithGym(dto: RegisterAdminWithGymDto): Promise<AuthResponse> {
    // Check if user already exists in public.users
    const existingUser = await this.prisma.user.findUnique({
      where: { email: dto.user.email },
    });

    if (existingUser) {
      throw new ConflictException('User with this email already exists');
    }

    // Also check system_users table
    const existingSystemUser = await this.prisma.systemUser.findUnique({
      where: { email: dto.user.email },
    });

    if (existingSystemUser) {
      throw new ConflictException('Email already exists as a system user');
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

    // Create the tenant schema with all tables (for clients)
    await this.tenantService.createTenantSchema(gym.id);

    // Create admin user in PUBLIC.users (not tenant schema)
    const createdUser = await this.prisma.user.create({
      data: {
        email: dto.user.email,
        passwordHash,
        name: dto.user.name,
        phone: dto.user.phone,
        status: 'active',
      },
    });

    // Create user-gym assignment with admin role
    await this.prisma.userGymXref.create({
      data: {
        userId: createdUser.id,
        gymId: gym.id,
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

    const updatedGym = await this.prisma.gym.findUnique({
      where: { id: gym.id },
    });

    const gymAssignment: GymAssignment = {
      gymId: gym.id,
      role: 'admin',
      isPrimary: true,
      gym: {
        id: updatedGym!.id,
        name: updatedGym!.name,
        logo: updatedGym!.logo || undefined,
        city: updatedGym!.city || undefined,
        state: updatedGym!.state || undefined,
        tenantSchemaName: updatedGym!.tenantSchemaName!,
      },
    };

    const user = this.toUserResponse({ ...createdUser, role: 'admin' }, updatedGym, [gymAssignment]);
    const accessToken = this.generateToken(user, gymAssignment);

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
   * Login user - checks superadmin first, then staff (public.users), then clients (tenant.users)
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

    // Check staff login (admin, manager, trainer) in public.users
    const staffUser = await this.prisma.user.findUnique({
      where: { email: loginDto.email },
      include: {
        gymAssignments: {
          where: { isActive: true },
          include: {
            gym: true,
          },
        },
      },
    });

    if (staffUser) {
      // Staff login flow
      if (staffUser.isDeleted) {
        throw new UnauthorizedException('Your account has been deleted');
      }

      if (staffUser.status === 'suspended') {
        throw new UnauthorizedException('Your account has been suspended');
      }

      if (staffUser.status === 'inactive') {
        throw new UnauthorizedException('Your account is inactive');
      }

      const isPasswordValid = await this.comparePassword(
        loginDto.password,
        staffUser.passwordHash,
      );

      if (!isPasswordValid) {
        throw new UnauthorizedException('Invalid credentials');
      }

      // Update last login time
      await this.prisma.user.update({
        where: { id: staffUser.id },
        data: { lastLoginAt: new Date() },
      });

      // Build gym assignments list
      const gymAssignments: GymAssignment[] = staffUser.gymAssignments.map((assignment) => ({
        gymId: assignment.gymId,
        role: assignment.role,
        isPrimary: assignment.isPrimary,
        gym: {
          id: assignment.gym.id,
          name: assignment.gym.name,
          logo: assignment.gym.logo || undefined,
          city: assignment.gym.city || undefined,
          state: assignment.gym.state || undefined,
          tenantSchemaName: assignment.gym.tenantSchemaName!,
        },
      }));

      if (gymAssignments.length === 0) {
        throw new UnauthorizedException('You are not assigned to any gym');
      }

      // Find primary gym or use first gym
      const primaryAssignment = gymAssignments.find((g) => g.isPrimary) || gymAssignments[0];
      const hasMultipleGyms = gymAssignments.length > 1;

      const user = this.toUserResponse(
        { ...staffUser, role: primaryAssignment.role },
        primaryAssignment.gym,
        gymAssignments
      );

      const accessToken = this.generateToken(user, primaryAssignment);

      return {
        user,
        accessToken,
        tokens: {
          accessToken,
          expiresIn: 604800, // 7 days in seconds
          tokenType: 'Bearer',
        },
        requiresGymSelection: hasMultipleGyms,
      };
    }

    // Check client login in all tenant schemas
    // This is a fallback - clients typically login via mobile app with gym code
    const gyms = await this.prisma.gym.findMany({
      where: { isActive: true, tenantSchemaName: { not: null } },
    });

    for (const gym of gyms) {
      try {
        const schemaExists = await this.tenantService.tenantSchemaExists(gym.id);
        if (!schemaExists) continue;

        const clientData = await this.tenantService.executeInTenant(gym.id, async (client) => {
          const result = await client.query(
            `SELECT * FROM users WHERE email = $1`,
            [loginDto.email]
          );
          return result.rows[0];
        });

        if (clientData) {
          // Check client status
          if (clientData.status === 'suspended') {
            throw new UnauthorizedException('Your account has been suspended');
          }

          // Check password
          const isPasswordValid = await this.comparePassword(
            loginDto.password,
            clientData.password_hash,
          );

          if (!isPasswordValid) {
            throw new UnauthorizedException('Invalid credentials');
          }

          // Update last login time
          await this.tenantService.executeInTenant(gym.id, async (client) => {
            await client.query(
              `UPDATE users SET last_login_at = NOW() WHERE id = $1`,
              [clientData.id]
            );
          });

          const user = this.toUserResponse({ ...clientData, role: 'client' }, gym);
          const accessToken = this.generateToken(user, {
            gymId: gym.id,
            role: 'client',
            isPrimary: true,
            gym: {
              id: gym.id,
              name: gym.name,
              logo: gym.logo || undefined,
              city: gym.city || undefined,
              state: gym.state || undefined,
              tenantSchemaName: gym.tenantSchemaName!,
            },
          });

          return {
            user,
            accessToken,
            tokens: {
              accessToken,
              expiresIn: 604800,
              tokenType: 'Bearer',
            },
          };
        }
      } catch (e) {
        // Skip gyms with errors (schema might not exist)
        if (e instanceof UnauthorizedException) {
          throw e;
        }
      }
    }

    throw new UnauthorizedException('Invalid credentials');
  }

  /**
   * Switch gym for staff with multiple gym assignments
   */
  async switchGym(userId: number, targetGymId: number): Promise<AuthResponse> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: {
        gymAssignments: {
          where: { isActive: true },
          include: { gym: true },
        },
      },
    });

    if (!user) {
      throw new UnauthorizedException('User not found');
    }

    const targetAssignment = user.gymAssignments.find((a) => a.gymId === targetGymId);
    if (!targetAssignment) {
      throw new UnauthorizedException('You are not assigned to this gym');
    }

    const gymAssignments: GymAssignment[] = user.gymAssignments.map((assignment) => ({
      gymId: assignment.gymId,
      role: assignment.role,
      isPrimary: assignment.isPrimary,
      gym: {
        id: assignment.gym.id,
        name: assignment.gym.name,
        logo: assignment.gym.logo || undefined,
        city: assignment.gym.city || undefined,
        state: assignment.gym.state || undefined,
        tenantSchemaName: assignment.gym.tenantSchemaName!,
      },
    }));

    const selectedAssignment = gymAssignments.find((g) => g.gymId === targetGymId)!;

    const userResponse = this.toUserResponse(
      { ...user, role: selectedAssignment.role },
      selectedAssignment.gym,
      gymAssignments
    );

    const accessToken = this.generateToken(userResponse, selectedAssignment);

    return {
      user: userResponse,
      accessToken,
      tokens: {
        accessToken,
        expiresIn: 604800,
        tokenType: 'Bearer',
      },
    };
  }

  /**
   * Get user profile - handles both staff (public.users) and clients (tenant.users)
   */
  async getProfile(userId: number, gymId?: number, isClient: boolean = false): Promise<UserResponse> {
    if (isClient && gymId) {
      // Client profile from tenant schema
      const gym = await this.prisma.gym.findUnique({
        where: { id: gymId },
      });

      if (!gym) {
        throw new UnauthorizedException('Gym not found');
      }

      const clientData = await this.tenantService.executeInTenant(gymId, async (client) => {
        const result = await client.query(
          `SELECT * FROM users WHERE id = $1`,
          [userId]
        );
        return result.rows[0];
      });

      if (!clientData) {
        throw new UnauthorizedException('User not found');
      }

      return this.toUserResponse({ ...clientData, role: 'client' }, gym);
    }

    // Staff profile from public.users
    const staffUser = await this.prisma.user.findUnique({
      where: { id: userId },
      include: {
        gymAssignments: {
          where: { isActive: true },
          include: { gym: true },
        },
      },
    });

    if (!staffUser) {
      throw new UnauthorizedException('User not found');
    }

    const gymAssignments: GymAssignment[] = staffUser.gymAssignments.map((assignment) => ({
      gymId: assignment.gymId,
      role: assignment.role,
      isPrimary: assignment.isPrimary,
      gym: {
        id: assignment.gym.id,
        name: assignment.gym.name,
        logo: assignment.gym.logo || undefined,
        city: assignment.gym.city || undefined,
        state: assignment.gym.state || undefined,
        tenantSchemaName: assignment.gym.tenantSchemaName!,
      },
    }));

    // Find the specific gym assignment if gymId is provided
    let currentAssignment = gymId
      ? gymAssignments.find((g) => g.gymId === gymId)
      : gymAssignments.find((g) => g.isPrimary) || gymAssignments[0];

    return this.toUserResponse(
      { ...staffUser, role: currentAssignment?.role || 'staff' },
      currentAssignment?.gym,
      gymAssignments
    );
  }

  /**
   * Update user profile - handles both staff and clients
   */
  async updateProfile(
    userId: number,
    gymId: number | undefined,
    data: { name?: string; bio?: string; avatar?: string; phone?: string },
    isClient: boolean = false,
  ): Promise<UserResponse> {
    if (isClient && gymId) {
      // Update client in tenant schema
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

      const clientData = await this.tenantService.executeInTenant(gymId, async (client) => {
        await client.query(
          `UPDATE users SET ${updates.join(', ')} WHERE id = $${paramIndex}`,
          values
        );

        const result = await client.query(
          `SELECT * FROM users WHERE id = $1`,
          [userId]
        );
        return result.rows[0];
      });

      return this.toUserResponse({ ...clientData, role: 'client' }, gym);
    }

    // Update staff in public.users
    const updateData: any = {};
    if (data.name) updateData.name = data.name;
    if (data.bio !== undefined) updateData.bio = data.bio;
    if (data.avatar !== undefined) updateData.avatar = data.avatar;
    if (data.phone !== undefined) updateData.phone = data.phone;

    const updatedUser = await this.prisma.user.update({
      where: { id: userId },
      data: updateData,
      include: {
        gymAssignments: {
          where: { isActive: true },
          include: { gym: true },
        },
      },
    });

    const gymAssignments: GymAssignment[] = updatedUser.gymAssignments.map((assignment) => ({
      gymId: assignment.gymId,
      role: assignment.role,
      isPrimary: assignment.isPrimary,
      gym: {
        id: assignment.gym.id,
        name: assignment.gym.name,
        logo: assignment.gym.logo || undefined,
        city: assignment.gym.city || undefined,
        state: assignment.gym.state || undefined,
        tenantSchemaName: assignment.gym.tenantSchemaName!,
      },
    }));

    const currentAssignment = gymId
      ? gymAssignments.find((g) => g.gymId === gymId)
      : gymAssignments.find((g) => g.isPrimary) || gymAssignments[0];

    return this.toUserResponse(
      { ...updatedUser, role: currentAssignment?.role || 'staff' },
      currentAssignment?.gym,
      gymAssignments
    );
  }

  /**
   * Change password - handles both staff and clients
   */
  async changePassword(
    userId: number,
    gymId: number | undefined,
    currentPassword: string,
    newPassword: string,
    isClient: boolean = false,
  ): Promise<{ success: boolean }> {
    if (isClient && gymId) {
      // Change password for client in tenant schema
      const clientData = await this.tenantService.executeInTenant(gymId, async (client) => {
        const result = await client.query(
          `SELECT * FROM users WHERE id = $1`,
          [userId]
        );
        return result.rows[0];
      });

      if (!clientData) {
        throw new UnauthorizedException('User not found');
      }

      const isPasswordValid = await this.comparePassword(
        currentPassword,
        clientData.password_hash,
      );

      if (!isPasswordValid) {
        throw new UnauthorizedException('Current password is incorrect');
      }

      const newPasswordHash = await this.hashPassword(newPassword);
      await this.tenantService.executeInTenant(gymId, async (client) => {
        await client.query(
          `UPDATE users SET password_hash = $1, updated_at = NOW() WHERE id = $2`,
          [newPasswordHash, userId]
        );
      });

      return { success: true };
    }

    // Change password for staff in public.users
    const staffUser = await this.prisma.user.findUnique({
      where: { id: userId },
    });

    if (!staffUser) {
      throw new UnauthorizedException('User not found');
    }

    const isPasswordValid = await this.comparePassword(
      currentPassword,
      staffUser.passwordHash,
    );

    if (!isPasswordValid) {
      throw new UnauthorizedException('Current password is incorrect');
    }

    const newPasswordHash = await this.hashPassword(newPassword);
    await this.prisma.user.update({
      where: { id: userId },
      data: { passwordHash: newPasswordHash },
    });

    return { success: true };
  }

  /**
   * Refresh token
   */
  async refreshToken(userId: number, gymId?: number, isClient: boolean = false): Promise<{ accessToken: string }> {
    const user = await this.getProfile(userId, gymId, isClient);

    const gymAssignment = gymId && user.gyms
      ? user.gyms.find((g) => g.gymId === gymId)
      : user.gyms?.[0];

    return {
      accessToken: this.generateToken(user, gymAssignment),
    };
  }

  /**
   * Search staff users within public.users (for a specific gym)
   */
  async searchStaff(
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

    const [users, totalResult] = await Promise.all([
      this.prisma.user.findMany({
        where: {
          id: { not: currentUserId },
          isDeleted: false,
          OR: [
            { name: { contains: query, mode: 'insensitive' } },
            { email: { contains: query, mode: 'insensitive' } },
          ],
          gymAssignments: {
            some: { gymId, isActive: true },
          },
        },
        include: {
          gymAssignments: {
            where: { gymId, isActive: true },
          },
        },
        skip: offset,
        take: limit,
        orderBy: { name: 'asc' },
      }),
      this.prisma.user.count({
        where: {
          id: { not: currentUserId },
          isDeleted: false,
          OR: [
            { name: { contains: query, mode: 'insensitive' } },
            { email: { contains: query, mode: 'insensitive' } },
          ],
          gymAssignments: {
            some: { gymId, isActive: true },
          },
        },
      }),
    ]);

    return {
      users: users.map((user) => ({
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.gymAssignments[0]?.role || 'staff',
        avatar: user.avatar ?? undefined,
      })),
      hasMore: offset + users.length < totalResult,
      page,
      total: totalResult,
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
    // First check public.users (staff)
    const staffUser = await this.prisma.user.findUnique({
      where: { email },
    });

    if (staffUser) {
      const newPasswordHash = await this.hashPassword(newPassword);
      await this.prisma.user.update({
        where: { id: staffUser.id },
        data: { passwordHash: newPasswordHash },
      });
      return { success: true };
    }

    // Check all tenant schemas for clients
    const gyms = await this.prisma.gym.findMany({
      where: { isActive: true, tenantSchemaName: { not: null } },
    });

    for (const gym of gyms) {
      try {
        const schemaExists = await this.tenantService.tenantSchemaExists(gym.id);
        if (!schemaExists) continue;

        const clientData = await this.tenantService.executeInTenant(gym.id, async (client) => {
          const result = await client.query(
            `SELECT id FROM users WHERE email = $1`,
            [email]
          );
          return result.rows[0];
        });

        if (clientData) {
          const newPasswordHash = await this.hashPassword(newPassword);
          await this.tenantService.executeInTenant(gym.id, async (client) => {
            await client.query(
              `UPDATE users SET password_hash = $1, updated_at = NOW() WHERE id = $2`,
              [newPasswordHash, clientData.id]
            );
          });
          return { success: true };
        }
      } catch (e) {
        // Skip gyms with errors
      }
    }

    throw new UnauthorizedException('User not found');
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
