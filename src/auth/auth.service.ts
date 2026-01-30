import {
  Injectable,
  UnauthorizedException,
  ConflictException,
  BadRequestException,
  NotFoundException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { PrismaService } from '../database/prisma.service';
import { TenantService } from '../tenant/tenant.service';
import { EmailService } from '../email/email.service';
import { BranchService } from '../branch/branch.service';
import { NotificationsService } from '../notifications/notifications.service';
import { CreateUserDto } from './dto/create-user.dto';
import { LoginDto } from './dto/login.dto';
import { RegisterAdminWithGymDto } from './dto/register-admin-with-gym.dto';
import { hashPassword, comparePassword } from '../common/utils';
import { PASSWORD_CONFIG, OTP_CONFIG } from '../common/constants';

export interface GymSubscriptionInfo {
  planCode: string;
  planName: string;
  status: string;
}

export interface GymInfo {
  id: number;
  name: string;
  logo?: string;
  city?: string;
  state?: string;
  tenantSchemaName: string;
  subscription?: GymSubscriptionInfo;
}

export interface GymAssignment {
  gymId: number;
  branchId: number | null; // null = all branches access
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
  emailVerified?: boolean;
  attendanceCode?: string;
  gymId?: number;
  gym?: GymInfo;
  gyms?: GymAssignment[]; // For multi-gym users
  branchIds?: number[]; // For branch_admin with multiple branches
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
  private readonly OTP_EXPIRY_MINUTES = OTP_CONFIG.EXPIRY_MINUTES;
  private readonly VERIFICATION_EXPIRY_MINUTES = 30;
  private readonly MAX_OTP_ATTEMPTS = 5;

  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
    private readonly tenantService: TenantService,
    private readonly emailService: EmailService,
    private readonly branchService: BranchService,
    private readonly notificationsService: NotificationsService,
  ) {}

  /**
   * Generate a 6-digit OTP
   */
  private generateOtp(): string {
    return Math.floor(100000 + Math.random() * 900000).toString();
  }


  private generateToken(user: UserResponse, gymAssignment?: GymAssignment, isAdmin: boolean = false): string {
    const payload = {
      sub: user.id,
      email: user.email,
      name: user.name,
      role: gymAssignment?.role || user.role || 'client',
      gymId: gymAssignment?.gymId || user.gymId || null,
      tenantSchemaName: gymAssignment?.gym?.tenantSchemaName || user.gym?.tenantSchemaName || null,
      branchId: gymAssignment?.branchId ?? null, // null = all branches access
      isAdmin, // Admin users are in public.users, not tenant.users
    };
    return this.jwtService.sign(payload);
  }

  private toUserResponse(user: any, gym?: any, gyms?: GymAssignment[], subscription?: any): UserResponse {
    return {
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role || 'client',
      avatar: user.avatar,
      status: user.status || 'active',
      phone: user.phone,
      emailVerified: user.emailVerified ?? user.email_verified ?? false,
      attendanceCode: user.attendance_code || user.attendanceCode,
      gymId: gym?.id,
      gym: gym ? {
        id: gym.id,
        name: gym.name,
        logo: gym.logo || undefined,
        city: gym.city || undefined,
        state: gym.state || undefined,
        tenantSchemaName: gym.tenantSchemaName || gym.tenant_schema_name,
        subscription: subscription ? {
          planCode: subscription.plan?.code,
          planName: subscription.plan?.name,
          status: subscription.status,
        } : undefined,
      } : undefined,
      gyms,
      branchIds: user.branchIds, // For branch_admin with multiple branches
      createdAt: user.created_at || user.createdAt,
      updatedAt: user.updated_at || user.updatedAt,
    };
  }

  private async getGymSubscription(gymId: number) {
    return this.prisma.saasGymSubscription.findFirst({
      where: { gymId, status: { in: ['active', 'trial'] } },
      include: { plan: true },
      orderBy: { createdAt: 'desc' },
    });
  }

  /**
   * Register a new admin with their gym (creates tenant schema)
   */
  async registerAdminWithGym(dto: RegisterAdminWithGymDto): Promise<AuthResponse> {
    // Check if user already exists in public.users
    const existingUser = await this.prisma.user.findUnique({
      where: { email: dto.user.email },
      include: {
        gymAssignments: true,
      },
    });

    // Block if user exists AND has verified email (completed signup properly)
    if (existingUser) {
      console.log('Found existing user:', existingUser.id, 'emailVerified:', existingUser.emailVerified, 'gymAssignments:', existingUser.gymAssignments?.length);

      if (existingUser.emailVerified) {
        throw new ConflictException('User with this email already exists');
      }

      // User exists but email not verified - they didn't complete signup properly
      // Clean up everything and let them start fresh
      console.log('Cleaning up incomplete user:', existingUser.id);

      // Delete gym assignments first
      if (existingUser.gymAssignments && existingUser.gymAssignments.length > 0) {
        for (const assignment of existingUser.gymAssignments) {
          // Delete the gym and its tenant schema
          try {
            const gym = await this.prisma.gym.findUnique({ where: { id: assignment.gymId } });
            if (gym?.tenantSchemaName && gym.tenantSchemaName !== 'pending') {
              await this.tenantService.dropTenantSchema(assignment.gymId);
            }
            // Delete subscriptions
            await this.prisma.saasGymSubscription.deleteMany({ where: { gymId: assignment.gymId } });
            // Delete the gym
            await this.prisma.gym.delete({ where: { id: assignment.gymId } });
            console.log('Cleaned up orphaned gym:', assignment.gymId);
          } catch (cleanupError) {
            console.error('Failed to cleanup gym:', assignment.gymId, cleanupError);
          }
        }
      }

      // Delete the user (this will cascade delete gym assignments due to onDelete: Cascade)
      try {
        await this.prisma.user.delete({
          where: { id: existingUser.id },
        });
        console.log('Deleted incomplete user:', existingUser.id);
      } catch (deleteError) {
        console.error('Failed to delete incomplete user:', deleteError);
        throw new ConflictException('User with this email already exists. Please try again later.');
      }
    }

    // Clean up any old email verification records for this email
    await this.prisma.emailVerification.deleteMany({
      where: { email: dto.user.email },
    });

    // Hash password before transaction
    const passwordHash = await hashPassword(dto.user.password);

    let gym: any;
    let createdUser: any;

    try {
      // Create gym and get gym ID first
      gym = await this.prisma.gym.create({
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
      console.log('Gym created:', gym.id);

      // Update tenant schema name with the gym ID
      const tenantSchemaName = this.tenantService.getTenantSchemaName(gym.id);
      await this.prisma.gym.update({
        where: { id: gym.id },
        data: { tenantSchemaName },
      });
      console.log('Tenant schema name updated:', tenantSchemaName);

      // Create the tenant schema with all tables (for clients)
      await this.tenantService.createTenantSchema(gym.id);
      console.log('Tenant schema created');

      // Create default branch for the gym
      await this.branchService.createDefaultBranch(gym.id, gym);
      console.log('Default branch created');

      // Create admin user in PUBLIC.users (not tenant schema)
      createdUser = await this.prisma.user.create({
        data: {
          email: dto.user.email,
          passwordHash,
          name: dto.user.name,
          phone: dto.user.phone,
          status: 'active',
        },
      });
      console.log('User created:', createdUser.id);
    } catch (error: any) {
      console.error('Registration error:', error.message || error);
      // Clean up gym if it was created but user creation failed
      if (gym?.id && !createdUser) {
        try {
          await this.prisma.gym.delete({ where: { id: gym.id } });
          console.log('Cleaned up orphaned gym:', gym.id);
        } catch (cleanupError) {
          console.error('Failed to clean up gym:', cleanupError);
        }
      }
      throw error;
    }

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

    // Generate and send email verification OTP
    const verificationOtp = this.generateOtp();
    const verificationExpiry = new Date(Date.now() + this.VERIFICATION_EXPIRY_MINUTES * 60 * 1000);

    await this.prisma.emailVerification.create({
      data: {
        email: dto.user.email,
        otp: verificationOtp,
        expiresAt: verificationExpiry,
        userType: 'admin',
        userId: createdUser.id,
        gymId: null, // Admin users are in public schema
      },
    });

    // Send verification email (non-blocking)
    this.emailService.sendEmailVerificationEmail(
      dto.user.email,
      dto.user.name,
      verificationOtp,
      this.VERIFICATION_EXPIRY_MINUTES,
    ).catch((error) => {
      console.error('Failed to send verification email:', error);
    });

    // Notify superadmins about new gym registration (non-blocking)
    this.notificationsService.notifyNewGymRegistration({
      gymId: gym.id,
      gymName: dto.gym.name,
      ownerName: dto.user.name,
    }).catch((error) => {
      console.error('Failed to send new gym notification:', error);
    });

    const gymAssignment: GymAssignment = {
      gymId: gym.id,
      branchId: null, // Admin has access to all branches
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

    const user = this.toUserResponse({ ...createdUser, role: 'admin', emailVerified: false }, updatedGym, [gymAssignment]);
    const accessToken = this.generateToken(user, gymAssignment, true); // isAdmin = true

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
   * Login user - checks superadmin first, then admin (public.users), then staff/clients (tenant.users)
   * Architecture: Admin in public.users, Staff (manager, trainer) + Clients in tenant.users
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

      const isPasswordValid = await comparePassword(
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

    // Check admin login in public.users (only admins are in public.users now)
    const adminUser = await this.prisma.user.findUnique({
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

    if (adminUser) {
      // Admin login flow
      if (adminUser.isDeleted) {
        throw new UnauthorizedException('Your account has been deleted');
      }

      if (adminUser.status === 'suspended') {
        throw new UnauthorizedException('Your account has been suspended');
      }

      if (adminUser.status === 'inactive') {
        throw new UnauthorizedException('Your account is inactive');
      }

      const isPasswordValid = await comparePassword(
        loginDto.password,
        adminUser.passwordHash,
      );

      if (!isPasswordValid) {
        throw new UnauthorizedException('Invalid credentials');
      }

      // Update last login time
      await this.prisma.user.update({
        where: { id: adminUser.id },
        data: { lastLoginAt: new Date() },
      });

      // Build gym assignments list
      const gymAssignments: GymAssignment[] = adminUser.gymAssignments.map((assignment) => ({
        gymId: assignment.gymId,
        branchId: assignment.branchId, // null = all branches access
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
        { ...adminUser, role: primaryAssignment.role },
        primaryAssignment.gym,
        gymAssignments
      );

      const accessToken = this.generateToken(user, primaryAssignment, true); // isAdmin = true

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

    // Check staff (manager, trainer) and client login in all tenant schemas
    const gyms = await this.prisma.gym.findMany({
      where: { isActive: true, tenantSchemaName: { not: null } },
    });

    for (const gym of gyms) {
      try {
        const schemaExists = await this.tenantService.tenantSchemaExists(gym.id);
        if (!schemaExists) continue;

        const tenantUser = await this.tenantService.executeInTenant(gym.id, async (client) => {
          const result = await client.query(
            `SELECT * FROM users WHERE email = $1`,
            [loginDto.email]
          );
          return result.rows[0];
        });

        if (tenantUser) {
          // Check user status
          if (tenantUser.status === 'suspended') {
            throw new UnauthorizedException('Your account has been suspended');
          }

          if (tenantUser.status === 'inactive') {
            throw new UnauthorizedException('Your account is inactive');
          }

          if (tenantUser.status === 'pending') {
            throw new UnauthorizedException('Your account is pending approval');
          }

          // Check password
          const isPasswordValid = await comparePassword(
            loginDto.password,
            tenantUser.password_hash,
          );

          if (!isPasswordValid) {
            throw new UnauthorizedException('Invalid credentials');
          }

          // Update last login time
          await this.tenantService.executeInTenant(gym.id, async (client) => {
            await client.query(
              `UPDATE users SET last_login_at = NOW() WHERE id = $1`,
              [tenantUser.id]
            );
          });

          // Get user's role from tenant schema (could be manager, trainer, branch_admin, or client)
          const userRole = tenantUser.role || 'client';

          // For branch_admin, fetch their assigned branch IDs
          let branchIds: number[] = [];
          if (userRole === 'branch_admin') {
            const branchAssignments = await this.tenantService.executeInTenant(gym.id, async (client) => {
              const result = await client.query(
                `SELECT branch_id FROM user_branch_xref WHERE user_id = $1 AND is_active = TRUE ORDER BY is_primary DESC`,
                [tenantUser.id]
              );
              return result.rows;
            });
            branchIds = branchAssignments.map((a: any) => a.branch_id);
          }

          const user = this.toUserResponse({ ...tenantUser, role: userRole, branchIds }, gym);
          const accessToken = this.generateToken(user, {
            gymId: gym.id,
            branchId: tenantUser.branch_id ?? null, // User's assigned branch
            role: userRole,
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
      branchId: assignment.branchId, // null = all branches access
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

    const accessToken = this.generateToken(userResponse, selectedAssignment, true); // isAdmin = true (only admins can switch gyms)

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
   * Get user profile - handles admin (public.users) and tenant users (manager/trainer/client in tenant.users)
   * Architecture: admin in public.users, manager/trainer/client in tenant.users
   */
  async getProfile(userId: number, gymId?: number, isTenantUser: boolean = false): Promise<UserResponse> {
    if (isTenantUser && gymId) {
      // Tenant user profile (manager, trainer, or client) from tenant schema
      const gym = await this.prisma.gym.findUnique({
        where: { id: gymId },
      });

      if (!gym) {
        throw new UnauthorizedException('Gym not found');
      }

      const tenantUser = await this.tenantService.executeInTenant(gymId, async (client) => {
        const result = await client.query(
          `SELECT * FROM users WHERE id = $1`,
          [userId]
        );
        return result.rows[0];
      });

      if (!tenantUser) {
        throw new UnauthorizedException('User not found');
      }

      // Get role from tenant user (could be manager, trainer, or client)
      const userRole = tenantUser.role || 'client';

      // Get subscription for gym
      const subscription = await this.getGymSubscription(gymId);

      return this.toUserResponse({ ...tenantUser, role: userRole }, gym, undefined, subscription);
    }

    // Admin profile from public.users
    const adminUser = await this.prisma.user.findUnique({
      where: { id: userId },
      include: {
        gymAssignments: {
          where: { isActive: true },
          include: { gym: true },
        },
      },
    });

    if (!adminUser) {
      throw new UnauthorizedException('User not found');
    }

    const gymAssignments: GymAssignment[] = adminUser.gymAssignments.map((assignment) => ({
      gymId: assignment.gymId,
      branchId: assignment.branchId, // null = all branches access
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

    // Get subscription for current gym
    const subscription = currentAssignment?.gymId
      ? await this.getGymSubscription(currentAssignment.gymId)
      : null;

    return this.toUserResponse(
      { ...adminUser, role: currentAssignment?.role || 'admin' },
      currentAssignment?.gym,
      gymAssignments,
      subscription
    );
  }

  /**
   * Update user profile - handles admin (public.users) and tenant users (tenant.users)
   * Architecture: admin in public.users, manager/trainer/client in tenant.users
   */
  async updateProfile(
    userId: number,
    gymId: number | undefined,
    data: { name?: string; bio?: string; avatar?: string; phone?: string },
    isTenantUser: boolean = false,
  ): Promise<UserResponse> {
    if (isTenantUser && gymId) {
      // Update tenant user (manager, trainer, or client) in tenant schema
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

      const tenantUser = await this.tenantService.executeInTenant(gymId, async (client) => {
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

      const userRole = tenantUser.role || 'client';
      return this.toUserResponse({ ...tenantUser, role: userRole }, gym);
    }

    // Update admin in public.users
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
      branchId: assignment.branchId, // null = all branches access
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
      { ...updatedUser, role: currentAssignment?.role || 'admin' },
      currentAssignment?.gym,
      gymAssignments
    );
  }

  /**
   * Change password - handles admin (public.users) and tenant users (tenant.users)
   * Architecture: admin in public.users, manager/trainer/client in tenant.users
   */
  async changePassword(
    userId: number,
    gymId: number | undefined,
    currentPassword: string,
    newPassword: string,
    isTenantUser: boolean = false,
  ): Promise<{ success: boolean }> {
    if (isTenantUser && gymId) {
      // Change password for tenant user (manager, trainer, or client) in tenant schema
      const tenantUser = await this.tenantService.executeInTenant(gymId, async (client) => {
        const result = await client.query(
          `SELECT * FROM users WHERE id = $1`,
          [userId]
        );
        return result.rows[0];
      });

      if (!tenantUser) {
        throw new UnauthorizedException('User not found');
      }

      const isPasswordValid = await comparePassword(
        currentPassword,
        tenantUser.password_hash,
      );

      if (!isPasswordValid) {
        throw new UnauthorizedException('Current password is incorrect');
      }

      const newPasswordHash = await hashPassword(newPassword);
      await this.tenantService.executeInTenant(gymId, async (client) => {
        await client.query(
          `UPDATE users SET password_hash = $1, updated_at = NOW() WHERE id = $2`,
          [newPasswordHash, userId]
        );
      });

      return { success: true };
    }

    // Change password for admin in public.users
    const adminUser = await this.prisma.user.findUnique({
      where: { id: userId },
    });

    if (!adminUser) {
      throw new UnauthorizedException('User not found');
    }

    const isPasswordValid = await comparePassword(
      currentPassword,
      adminUser.passwordHash,
    );

    if (!isPasswordValid) {
      throw new UnauthorizedException('Current password is incorrect');
    }

    const newPasswordHash = await hashPassword(newPassword);
    await this.prisma.user.update({
      where: { id: userId },
      data: { passwordHash: newPasswordHash },
    });

    return { success: true };
  }

  /**
   * Refresh token
   */
  async refreshToken(userId: number, gymId?: number, isTenantUser: boolean = false): Promise<{ accessToken: string }> {
    const user = await this.getProfile(userId, gymId, isTenantUser);

    const gymAssignment = gymId && user.gyms
      ? user.gyms.find((g) => g.gymId === gymId)
      : user.gyms?.[0];

    // Admin users (not tenant users) need isAdmin flag
    const isAdmin = !isTenantUser && user.role === 'admin';

    return {
      accessToken: this.generateToken(user, gymAssignment, isAdmin),
    };
  }

  /**
   * Search staff users - searches admins (public.users) and staff (tenant.users) for a specific gym
   * Architecture: admin in public.users, manager/trainer in tenant.users
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

    const searchPattern = `%${query}%`;

    // Search admins in public.users
    const admins = await this.prisma.user.findMany({
      where: {
        id: { not: currentUserId },
        isDeleted: false,
        OR: [
          { name: { contains: query, mode: 'insensitive' } },
          { email: { contains: query, mode: 'insensitive' } },
        ],
        gymAssignments: {
          some: { gymId, isActive: true, role: 'admin' },
        },
      },
      include: {
        gymAssignments: {
          where: { gymId, isActive: true },
        },
      },
      orderBy: { name: 'asc' },
    });

    // Search staff (manager/trainer) in tenant.users
    const tenantStaff = await this.tenantService.executeInTenant(gymId, async (client) => {
      const result = await client.query(
        `SELECT * FROM users
         WHERE id != $1
         AND role IN ('manager', 'trainer')
         AND (name ILIKE $2 OR email ILIKE $2)
         ORDER BY name ASC`,
        [currentUserId, searchPattern]
      );
      return result.rows;
    });

    // Combine results
    const allUsers: UserResponse[] = [
      ...admins.map((user) => ({
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.gymAssignments[0]?.role || 'admin',
        avatar: user.avatar ?? undefined,
      })),
      ...tenantStaff.map((user: any) => ({
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role || 'staff',
        avatar: user.avatar ?? undefined,
      })),
    ];

    // Sort and paginate
    allUsers.sort((a, b) => a.name.localeCompare(b.name));
    const total = allUsers.length;
    const offset = (page - 1) * limit;
    const paginatedUsers = allUsers.slice(offset, offset + limit);

    return {
      users: paginatedUsers,
      hasMore: offset + paginatedUsers.length < total,
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
   * Request password reset - sends OTP to email
   * Architecture: admin in public.users, manager/trainer/client in tenant.users
   */
  async requestPasswordReset(email: string): Promise<{ success: boolean; message: string; emailFound: boolean }> {
    // Find user in any location
    const userInfo = await this.findUserByEmail(email);

    if (!userInfo) {
      return {
        success: false,
        message: 'No account found with this email address.',
        emailFound: false,
      };
    }

    // Invalidate any existing OTPs for this email
    await this.prisma.emailVerification.updateMany({
      where: { email, userType: 'password_reset', isUsed: false },
      data: { isUsed: true },
    });

    // Generate and save new OTP
    const otp = this.generateOtp();
    const expiresAt = new Date(Date.now() + this.OTP_EXPIRY_MINUTES * 60 * 1000);

    await this.prisma.emailVerification.create({
      data: {
        email,
        otp,
        expiresAt,
        userType: 'password_reset',
        userId: 0, // Not needed for password reset
        gymId: userInfo.gymId,
      },
    });

    // Send OTP email
    await this.emailService.sendPasswordResetOtpEmail(
      email,
      userInfo.userName,
      otp,
      this.OTP_EXPIRY_MINUTES,
    );

    return {
      success: true,
      message: 'Verification code sent to your email.',
      emailFound: true,
    };
  }

  /**
   * Verify OTP without resetting password
   */
  async verifyOtp(email: string, otp: string): Promise<{ success: boolean; valid: boolean }> {
    const otpRecord = await this.prisma.emailVerification.findFirst({
      where: {
        email,
        otp,
        userType: 'password_reset',
        isUsed: false,
        expiresAt: { gt: new Date() },
      },
      orderBy: { createdAt: 'desc' },
    });

    if (!otpRecord) {
      // Check if there's an expired or used OTP
      const anyOtpRecord = await this.prisma.emailVerification.findFirst({
        where: { email, userType: 'password_reset' },
        orderBy: { createdAt: 'desc' },
      });

      if (anyOtpRecord) {
        // Increment attempts
        await this.prisma.emailVerification.update({
          where: { id: anyOtpRecord.id },
          data: { attempts: { increment: 1 } },
        });

        if (anyOtpRecord.attempts >= this.MAX_OTP_ATTEMPTS) {
          throw new BadRequestException('Too many failed attempts. Please request a new code.');
        }
      }

      return { success: true, valid: false };
    }

    return { success: true, valid: true };
  }

  /**
   * Reset password with OTP verification
   */
  async resetPasswordWithOtp(
    email: string,
    otp: string,
    newPassword: string,
  ): Promise<{ success: boolean }> {
    // Find and validate OTP
    const otpRecord = await this.prisma.emailVerification.findFirst({
      where: {
        email,
        otp,
        userType: 'password_reset',
        isUsed: false,
        expiresAt: { gt: new Date() },
      },
      orderBy: { createdAt: 'desc' },
    });

    if (!otpRecord) {
      // Increment attempts for any existing record
      const anyOtpRecord = await this.prisma.emailVerification.findFirst({
        where: { email, userType: 'password_reset', isUsed: false },
        orderBy: { createdAt: 'desc' },
      });

      if (anyOtpRecord) {
        await this.prisma.emailVerification.update({
          where: { id: anyOtpRecord.id },
          data: { attempts: { increment: 1 } },
        });

        if (anyOtpRecord.attempts >= this.MAX_OTP_ATTEMPTS) {
          throw new BadRequestException('Too many failed attempts. Please request a new code.');
        }
      }

      throw new BadRequestException('Invalid or expired verification code.');
    }

    // Mark OTP as used
    await this.prisma.emailVerification.update({
      where: { id: otpRecord.id },
      data: { isUsed: true },
    });

    // Find user to determine where to update password
    const userInfo = await this.findUserByEmail(email);
    if (!userInfo) {
      throw new BadRequestException('User not found.');
    }

    // Hash new password
    const newPasswordHash = await hashPassword(newPassword);

    // Update password based on user type
    if (userInfo.userType === 'admin' || userInfo.userType === 'system') {
      // Update in public.users
      await this.prisma.user.update({
        where: { email },
        data: { passwordHash: newPasswordHash },
      });
    } else if (userInfo.userType === 'system_admin') {
      // Update in system_users
      await this.prisma.systemUser.update({
        where: { email },
        data: { passwordHash: newPasswordHash },
      });
    } else if (userInfo.gymId) {
      // Update in tenant schema
      await this.tenantService.executeInTenant(userInfo.gymId, async (client) => {
        await client.query(
          `UPDATE users SET password_hash = $1, updated_at = NOW() WHERE email = $2`,
          [newPasswordHash, email]
        );
      });
    }

    // Send success email
    await this.emailService.sendPasswordResetSuccessEmail(email, userInfo.userName);

    // Cleanup old OTPs for this email
    await this.prisma.emailVerification.deleteMany({
      where: {
        email,
        userType: 'password_reset',
        createdAt: { lt: new Date(Date.now() - 24 * 60 * 60 * 1000) }, // Older than 24 hours
      },
    });

    return { success: true };
  }

  /**
   * Find user by email across all user tables
   */
  private async findUserByEmail(
    email: string,
  ): Promise<{ userName: string; userType: string; gymId?: number } | null> {
    // Check system_users (superadmin)
    const systemUser = await this.prisma.systemUser.findUnique({
      where: { email },
    });

    if (systemUser) {
      return {
        userName: systemUser.name,
        userType: 'system_admin',
      };
    }

    // Check public.users (admin)
    const adminUser = await this.prisma.user.findUnique({
      where: { email },
    });

    if (adminUser) {
      return {
        userName: adminUser.name,
        userType: 'admin',
      };
    }

    // Check all tenant schemas for staff and clients
    const gyms = await this.prisma.gym.findMany({
      where: { isActive: true, tenantSchemaName: { not: null } },
    });

    for (const gym of gyms) {
      try {
        const schemaExists = await this.tenantService.tenantSchemaExists(gym.id);
        if (!schemaExists) continue;

        const tenantUser = await this.tenantService.executeInTenant(gym.id, async (client) => {
          const result = await client.query(
            `SELECT name, role FROM users WHERE email = $1`,
            [email]
          );
          return result.rows[0];
        });

        if (tenantUser) {
          return {
            userName: tenantUser.name,
            userType: tenantUser.role || 'client',
            gymId: gym.id,
          };
        }
      } catch (e) {
        // Skip gyms with errors
      }
    }

    return null;
  }

  /**
   * Resend OTP for password reset
   */
  async resendOtp(email: string): Promise<{ success: boolean; message: string }> {
    // Check if there's a recent OTP (less than 1 minute old)
    const recentOtp = await this.prisma.emailVerification.findFirst({
      where: {
        email,
        userType: 'password_reset',
        isUsed: false,
        createdAt: { gt: new Date(Date.now() - 60 * 1000) }, // Last minute
      },
    });

    if (recentOtp) {
      throw new BadRequestException('Please wait before requesting a new code.');
    }

    // Use the same logic as requestPasswordReset
    return this.requestPasswordReset(email);
  }

  // ============================================
  // EMAIL VERIFICATION METHODS
  // ============================================

  /**
   * Verify email with OTP
   */
  async verifyEmail(
    email: string,
    otp: string,
  ): Promise<{ success: boolean; message: string }> {
    // Find and validate OTP
    const verificationRecord = await this.prisma.emailVerification.findFirst({
      where: {
        email,
        otp,
        isUsed: false,
        expiresAt: { gt: new Date() },
      },
      orderBy: { createdAt: 'desc' },
    });

    if (!verificationRecord) {
      // Increment attempts for any existing record
      const anyRecord = await this.prisma.emailVerification.findFirst({
        where: { email, isUsed: false },
        orderBy: { createdAt: 'desc' },
      });

      if (anyRecord) {
        await this.prisma.emailVerification.update({
          where: { id: anyRecord.id },
          data: { attempts: { increment: 1 } },
        });

        if (anyRecord.attempts >= this.MAX_OTP_ATTEMPTS) {
          throw new BadRequestException('Too many failed attempts. Please request a new code.');
        }
      }

      throw new BadRequestException('Invalid or expired verification code.');
    }

    // Mark verification as used
    await this.prisma.emailVerification.update({
      where: { id: verificationRecord.id },
      data: { isUsed: true },
    });

    // Update user's emailVerified status based on user type
    if (verificationRecord.userType === 'admin') {
      // Update in public.users
      await this.prisma.user.update({
        where: { id: verificationRecord.userId },
        data: { emailVerified: true },
      });
    } else if (verificationRecord.gymId) {
      // Update in tenant schema (for staff/clients)
      await this.tenantService.executeInTenant(verificationRecord.gymId, async (client) => {
        await client.query(
          `UPDATE users SET email_verified = true, updated_at = NOW() WHERE id = $1`,
          [verificationRecord.userId]
        );
      });
    }

    // Cleanup old verification records for this email
    await this.prisma.emailVerification.deleteMany({
      where: {
        email,
        createdAt: { lt: new Date(Date.now() - 24 * 60 * 60 * 1000) }, // Older than 24 hours
      },
    });

    return {
      success: true,
      message: 'Email verified successfully.',
    };
  }

  /**
   * Resend email verification OTP
   */
  async resendVerificationEmail(email: string): Promise<{ success: boolean; message: string }> {
    // Check if there's a recent verification (less than 1 minute old)
    const recentVerification = await this.prisma.emailVerification.findFirst({
      where: {
        email,
        isUsed: false,
        createdAt: { gt: new Date(Date.now() - 60 * 1000) }, // Last minute
      },
    });

    if (recentVerification) {
      throw new BadRequestException('Please wait before requesting a new code.');
    }

    // Find user
    const user = await this.prisma.user.findUnique({
      where: { email },
    });

    if (!user) {
      // Don't reveal if user exists
      return {
        success: true,
        message: 'If an account exists with this email, you will receive a verification code shortly.',
      };
    }

    if (user.emailVerified) {
      throw new BadRequestException('Email is already verified.');
    }

    // Invalidate any existing verification codes
    await this.prisma.emailVerification.updateMany({
      where: { email, isUsed: false },
      data: { isUsed: true },
    });

    // Generate new OTP
    const verificationOtp = this.generateOtp();
    const verificationExpiry = new Date(Date.now() + this.VERIFICATION_EXPIRY_MINUTES * 60 * 1000);

    await this.prisma.emailVerification.create({
      data: {
        email,
        otp: verificationOtp,
        expiresAt: verificationExpiry,
        userType: 'admin',
        userId: user.id,
        gymId: null,
      },
    });

    // Send verification email
    await this.emailService.sendEmailVerificationEmail(
      email,
      user.name,
      verificationOtp,
      this.VERIFICATION_EXPIRY_MINUTES,
    );

    return {
      success: true,
      message: 'Verification code sent successfully.',
    };
  }

  /**
   * Send signup verification OTP (before registration)
   */
  async sendSignupVerificationOtp(email: string, name: string): Promise<{ success: boolean; message: string }> {
    // Check if email already exists
    const existingUser = await this.prisma.user.findUnique({
      where: { email },
    });

    // Allow resending OTP if user exists but email is not verified
    if (existingUser && existingUser.emailVerified) {
      throw new ConflictException('User with this email already exists');
    }

    const existingSystemUser = await this.prisma.systemUser.findUnique({
      where: { email },
    });

    // System users (superadmins) are always considered verified
    if (existingSystemUser) {
      throw new ConflictException('Email already exists');
    }

    // Check rate limit (1 minute)
    const recentOtp = await this.prisma.emailVerification.findFirst({
      where: {
        email,
        isUsed: false,
        createdAt: { gt: new Date(Date.now() - 60 * 1000) },
      },
    });

    if (recentOtp) {
      throw new BadRequestException('Please wait before requesting a new code.');
    }

    // Invalidate any existing OTPs
    await this.prisma.emailVerification.updateMany({
      where: { email, isUsed: false },
      data: { isUsed: true },
    });

    // Generate new OTP
    const otp = this.generateOtp();
    const expiresAt = new Date(Date.now() + this.VERIFICATION_EXPIRY_MINUTES * 60 * 1000);

    await this.prisma.emailVerification.create({
      data: {
        email,
        otp,
        expiresAt,
        userType: 'signup',
        userId: 0, // No user yet
        gymId: null,
      },
    });

    // Send verification email
    try {
      const emailResult = await this.emailService.sendEmailVerificationEmail(
        email,
        name,
        otp,
        this.VERIFICATION_EXPIRY_MINUTES,
      );

      if (!emailResult.success) {
        console.error('Email sending failed:', emailResult.error);
        throw new BadRequestException('Failed to send verification email. Please try again.');
      }
    } catch (error) {
      console.error('Email sending error:', error);
      throw new BadRequestException('Failed to send verification email. Please try again.');
    }

    return {
      success: true,
      message: 'Verification code sent successfully.',
    };
  }

  /**
   * Verify signup OTP (before registration)
   */
  async verifySignupOtp(email: string, otp: string): Promise<{ success: boolean; valid: boolean }> {
    const verificationRecord = await this.prisma.emailVerification.findFirst({
      where: {
        email,
        otp,
        userType: 'signup',
        isUsed: false,
        expiresAt: { gt: new Date() },
      },
      orderBy: { createdAt: 'desc' },
    });

    if (!verificationRecord) {
      const anyRecord = await this.prisma.emailVerification.findFirst({
        where: { email, userType: 'signup', isUsed: false },
        orderBy: { createdAt: 'desc' },
      });

      if (anyRecord) {
        await this.prisma.emailVerification.update({
          where: { id: anyRecord.id },
          data: { attempts: { increment: 1 } },
        });

        if (anyRecord.attempts >= this.MAX_OTP_ATTEMPTS) {
          throw new BadRequestException('Too many failed attempts. Please request a new code.');
        }
      }

      return { success: true, valid: false };
    }

    // Mark as used
    await this.prisma.emailVerification.update({
      where: { id: verificationRecord.id },
      data: { isUsed: true },
    });

    return { success: true, valid: true };
  }

  /**
   * TEMPORARY: Get OTP from database for testing
   * Remove this method when email service is working
   */
  async getSignupOtpTemporary(email: string): Promise<{ success: boolean; otp?: string; message: string }> {
    const verificationRecord = await this.prisma.emailVerification.findFirst({
      where: {
        email,
        userType: 'signup',
        isUsed: false,
        expiresAt: { gt: new Date() },
      },
      orderBy: { createdAt: 'desc' },
    });

    if (!verificationRecord) {
      return {
        success: false,
        message: 'No active OTP found for this email. Please request a new code.',
      };
    }

    return {
      success: true,
      otp: verificationRecord.otp,
      message: 'Email service is temporarily unavailable. Use this OTP to verify.',
    };
  }

  /**
   * TEMPORARY: Get password reset OTP from database for testing
   * Remove this method when email service is working
   */
  async getPasswordResetOtpTemporary(email: string): Promise<{ success: boolean; otp?: string; message: string }> {
    const otpRecord = await this.prisma.emailVerification.findFirst({
      where: {
        email,
        userType: 'password_reset',
        isUsed: false,
        expiresAt: { gt: new Date() },
      },
      orderBy: { createdAt: 'desc' },
    });

    if (!otpRecord) {
      return {
        success: false,
        message: 'No active OTP found for this email. Please request a new code.',
      };
    }

    return {
      success: true,
      otp: otpRecord.otp,
      message: 'Email service is temporarily unavailable. Use this OTP to verify.',
    };
  }

  /**
   * Check if user's email is verified
   */
  async checkEmailVerification(userId: number, isTenantUser: boolean = false, gymId?: number): Promise<{ verified: boolean }> {
    if (isTenantUser && gymId) {
      const tenantUser = await this.tenantService.executeInTenant(gymId, async (client) => {
        const result = await client.query(
          `SELECT email_verified FROM users WHERE id = $1`,
          [userId]
        );
        return result.rows[0];
      });

      return { verified: tenantUser?.email_verified ?? false };
    }

    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { emailVerified: true },
    });

    return { verified: user?.emailVerified ?? false };
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

  /**
   * Impersonate a gym as superadmin
   * Creates a temporary token that allows superadmin to access gym as admin
   */
  async impersonateGym(
    superAdminId: number,
    gymId: number,
  ): Promise<{
    accessToken: string;
    gym: GymInfo;
    expiresIn: number;
  }> {
    // Verify the user is a superadmin
    const systemUser = await this.prisma.systemUser.findUnique({
      where: { id: superAdminId },
    });

    if (!systemUser || systemUser.role !== 'superadmin') {
      throw new UnauthorizedException('Only superadmins can impersonate gyms');
    }

    // Get the gym
    const gym = await this.prisma.gym.findUnique({
      where: { id: gymId },
    });

    if (!gym) {
      throw new NotFoundException(`Gym with ID ${gymId} not found`);
    }

    if (!gym.isActive) {
      throw new BadRequestException('Cannot access inactive gym');
    }

    // Get gym subscription
    const subscription = await this.getGymSubscription(gymId);

    // Generate impersonation token with shorter expiry (2 hours)
    const payload = {
      sub: superAdminId,
      email: systemUser.email,
      name: systemUser.name,
      role: 'admin', // Act as admin within the gym
      gymId: gym.id,
      tenantSchemaName: gym.tenantSchemaName,
      branchId: null, // Access to all branches
      isImpersonating: true,
      originalRole: 'superadmin',
      impersonatedGymId: gym.id,
    };

    const accessToken = this.jwtService.sign(payload, { expiresIn: '2h' });

    return {
      accessToken,
      gym: {
        id: gym.id,
        name: gym.name,
        logo: gym.logo || undefined,
        city: gym.city || undefined,
        state: gym.state || undefined,
        tenantSchemaName: gym.tenantSchemaName!,
        subscription: subscription ? {
          planCode: subscription.plan?.code,
          planName: subscription.plan?.name,
          status: subscription.status,
        } : undefined,
      },
      expiresIn: 7200, // 2 hours in seconds
    };
  }
}
