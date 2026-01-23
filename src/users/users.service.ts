import { Injectable, NotFoundException, ConflictException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';
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
  gymId?: number;
}

@Injectable()
export class UsersService {
  private readonly SALT_ROUNDS = 10;

  constructor(private readonly prisma: PrismaService) {}

  private async hashPassword(password: string): Promise<string> {
    return bcrypt.hash(password, this.SALT_ROUNDS);
  }

  private async generateUniqueAttendanceCode(): Promise<string> {
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

      /* Check which codes already exist in single query */
      const existing = await this.prisma.user.findMany({
        where: { attendanceCode: { in: candidates } },
        select: { attendanceCode: true },
      });

      const existingCodes = new Set(existing.map(u => u.attendanceCode));

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

  private formatUser(user: any) {
    return {
      id: user.id,
      name: user.name,
      email: user.email,
      phone: user.phone,
      avatar: user.avatar,
      bio: user.bio,
      role: user.role?.code || 'member',
      status: user.status,
      dateOfBirth: user.dateOfBirth,
      gender: user.gender,
      address: user.address,
      city: user.city,
      state: user.state,
      zipCode: user.zipCode,
      attendanceCode: user.attendanceCode,
      gymId: user.gymId,
      gym: user.gym ? {
        id: user.gym.id,
        name: user.gym.name,
        logo: user.gym.logo,
        city: user.gym.city,
        state: user.gym.state,
      } : null,
      bodyMetrics: user.bodyMetrics || null,
      bodyMetricsHistory: user.bodyMetricsHistory || [],
      createdAt: user.createdAt,
      updatedAt: user.updatedAt,
    };
  }

  async create(createUserDto: CreateUserDto, creatorId?: number): Promise<any> {
    if (!createUserDto.password) {
      throw new BadRequestException('Password is required');
    }

    const roleCode = createUserDto.role || 'admin';

    /* Parallelize initial queries for better performance */
    const [existingUser, roleLookup, attendanceCode, creator, gymAssociation, passwordHash] = await Promise.all([
      /* Check if email already exists */
      this.prisma.user.findUnique({
        where: { email: createUserDto.email },
        select: { id: true },
      }),
      /* Find role lookup */
      this.prisma.lookup.findFirst({
        where: {
          lookupType: { code: 'USER_ROLE' },
          code: roleCode,
        },
        select: { id: true },
      }),
      /* Generate unique attendance code */
      this.generateUniqueAttendanceCode(),
      /* Get creator's gym (if creatorId provided) */
      creatorId ? this.prisma.user.findUnique({
        where: { id: creatorId },
        select: { gymId: true },
      }) : null,
      /* Get creator's gym association */
      creatorId ? this.prisma.userGymXref.findFirst({
        where: { userId: creatorId, isActive: true },
        select: { gymId: true },
      }) : null,
      /* Hash password in parallel */
      this.hashPassword(createUserDto.password),
    ]);

    if (existingUser) {
      throw new ConflictException('User with this email already exists');
    }

    if (!roleLookup) {
      throw new NotFoundException(`Role ${roleCode} not found`);
    }

    /* Determine gymId: provided > creator's gym > creator's gym association */
    const gymId = createUserDto.gymId || creator?.gymId || gymAssociation?.gymId || undefined;

    const user = await this.prisma.user.create({
      data: {
        name: createUserDto.name,
        email: createUserDto.email,
        passwordHash,
        phone: createUserDto.phone,
        avatar: createUserDto.avatar,
        bio: createUserDto.bio,
        roleId: roleLookup.id,
        status: createUserDto.status || 'active',
        dateOfBirth: createUserDto.dateOfBirth ? new Date(createUserDto.dateOfBirth) : undefined,
        gender: createUserDto.gender,
        address: createUserDto.address,
        city: createUserDto.city,
        state: createUserDto.state,
        zipCode: createUserDto.zipCode,
        joinDate: new Date(),
        attendanceCode,
        gymId,
      },
      include: {
        role: true,
        gym: true,
      },
    });

    return this.formatUser(user);
  }

  async findAll(filters: UserFilters = {}): Promise<PaginatedResponse<any>> {
    const { page, limit, skip, take, noPagination } = getPaginationParams(filters);

    const where: any = {};

    if (filters.role && filters.role !== 'all') {
      where.role = { code: filters.role };
    }
    if (filters.status && filters.status !== 'all') {
      where.status = filters.status;
    }
    if (filters.gymId) {
      where.gymId = filters.gymId;
    }

    // Apply search filter
    if (filters.search) {
      where.OR = [
        { name: { contains: filters.search, mode: 'insensitive' } },
        { email: { contains: filters.search, mode: 'insensitive' } },
        { phone: { contains: filters.search, mode: 'insensitive' } },
      ];
    }

    // Get total count
    const total = await this.prisma.user.count({ where });

    // Get paginated data
    const users = await this.prisma.user.findMany({
      where,
      include: {
        role: true,
        gym: true,
      },
      orderBy: { createdAt: 'desc' },
      skip,
      take,
    });

    return {
      data: users.map(user => this.formatUser(user)),
      pagination: createPaginationMeta(total, page, limit, noPagination),
    };
  }

  async findOne(id: number): Promise<any> {
    const user = await this.prisma.user.findUnique({
      where: { id },
      include: {
        role: true,
        gym: true,
        bodyMetrics: true,
        bodyMetricsHistory: {
          orderBy: { measuredAt: 'desc' },
          take: 50,
        },
      },
    });

    if (!user) {
      throw new NotFoundException(`User with ID ${id} not found`);
    }

    return this.formatUser(user);
  }

  async findByRole(role: string, gymId?: number): Promise<PaginatedResponse<any>> {
    return this.findAll({ role, gymId, noPagination: true });
  }

  async update(id: number, updateUserDto: UpdateUserDto): Promise<any> {
    await this.findOne(id);

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

    const user = await this.prisma.user.update({
      where: { id },
      data: {
        ...updateData,
        ...(roleId && { roleId }),
      },
      include: {
        role: true,
        gym: true,
      },
    });

    return this.formatUser(user);
  }

  async remove(id: number): Promise<{ success: boolean }> {
    const user = await this.prisma.user.findUnique({
      where: { id },
      include: {
        role: true,
        memberships: { where: { status: { in: ['active', 'pending'] } } },
      },
    });

    if (!user) {
      throw new NotFoundException(`User with ID ${id} not found`);
    }

    // Block deletion if user has active or pending memberships
    if (user.memberships && user.memberships.length > 0) {
      throw new BadRequestException(
        'Cannot delete user. User has active or pending memberships. Please cancel the memberships first.',
      );
    }

    // Use transaction to delete user and their associations
    await this.prisma.$transaction(async (tx) => {
      // Delete user-gym associations (these are just linking records)
      await tx.userGymXref.deleteMany({
        where: { userId: id },
      });

      // Delete the user
      await tx.user.delete({ where: { id } });
    });

    return { success: true };
  }

  async updateStatus(userId: number, status: string): Promise<any> {
    return this.update(userId, { status } as UpdateUserDto);
  }

  async resetPassword(
    userId: number,
    newPassword: string,
  ): Promise<{ success: boolean }> {
    await this.findOne(userId);

    const passwordHash = await this.hashPassword(newPassword);

    await this.prisma.user.update({
      where: { id: userId },
      data: { passwordHash },
    });

    return { success: true };
  }

  async regenerateAttendanceCode(userId: number): Promise<{ success: boolean; attendanceCode: string }> {
    await this.findOne(userId);

    const attendanceCode = await this.generateUniqueAttendanceCode();

    await this.prisma.user.update({
      where: { id: userId },
      data: { attendanceCode },
    });

    return { success: true, attendanceCode };
  }

  /* Approve a pending registration request */
  async approveRequest(userId: number, role: string): Promise<any> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: { role: true },
    });

    if (!user) {
      throw new NotFoundException(`User with ID ${userId} not found`);
    }

    if (user.status !== 'pending') {
      throw new BadRequestException('Only pending requests can be approved');
    }

    /* Find the role lookup */
    const roleLookup = await this.prisma.lookup.findFirst({
      where: {
        lookupType: { code: 'USER_ROLE' },
        code: role,
      },
    });

    if (!roleLookup) {
      throw new NotFoundException(`Role ${role} not found`);
    }

    const updatedUser = await this.prisma.user.update({
      where: { id: userId },
      data: {
        status: 'active',
        roleId: roleLookup.id,
      },
      include: {
        role: true,
        gym: true,
      },
    });

    return this.formatUser(updatedUser);
  }

  /* Reject a pending registration request */
  async rejectRequest(userId: number): Promise<any> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: { role: true },
    });

    if (!user) {
      throw new NotFoundException(`User with ID ${userId} not found`);
    }

    if (user.status !== 'pending') {
      throw new BadRequestException('Only pending requests can be rejected');
    }

    const updatedUser = await this.prisma.user.update({
      where: { id: userId },
      data: {
        status: 'rejected',
      },
      include: {
        role: true,
        gym: true,
      },
    });

    return this.formatUser(updatedUser);
  }
}
