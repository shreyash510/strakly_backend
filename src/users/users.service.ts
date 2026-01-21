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
}

@Injectable()
export class UsersService {
  private readonly SALT_ROUNDS = 10;

  constructor(private readonly prisma: PrismaService) {}

  private async hashPassword(password: string): Promise<string> {
    return bcrypt.hash(password, this.SALT_ROUNDS);
  }

  private async generateUniqueAttendanceCode(): Promise<string> {
    const characters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    let code: string;
    let isUnique = false;

    while (!isUnique) {
      code = '';
      for (let i = 0; i < 4; i++) {
        code += characters.charAt(Math.floor(Math.random() * characters.length));
      }

      const existing = await this.prisma.user.findUnique({
        where: { attendanceCode: code },
      });

      if (!existing) {
        isUnique = true;
      }
    }

    return code!;
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
      createdAt: user.createdAt,
      updatedAt: user.updatedAt,
    };
  }

  async create(createUserDto: CreateUserDto): Promise<any> {
    if (!createUserDto.password) {
      throw new BadRequestException('Password is required');
    }

    const existingUser = await this.prisma.user.findUnique({
      where: { email: createUserDto.email },
    });

    if (existingUser) {
      throw new ConflictException('User with this email already exists');
    }

    const roleCode = createUserDto.role || 'admin';
    const roleLookup = await this.prisma.lookup.findFirst({
      where: {
        lookupType: { code: 'USER_ROLE' },
        code: roleCode,
      },
    });

    if (!roleLookup) {
      throw new NotFoundException(`Role ${roleCode} not found`);
    }

    const attendanceCode = await this.generateUniqueAttendanceCode();

    const user = await this.prisma.user.create({
      data: {
        name: createUserDto.name,
        email: createUserDto.email,
        passwordHash: await this.hashPassword(createUserDto.password),
        phone: createUserDto.phone,
        avatar: createUserDto.avatar,
        bio: createUserDto.bio,
        roleId: roleLookup.id,
        status: createUserDto.status || 'active',
        dateOfBirth: createUserDto.dateOfBirth,
        gender: createUserDto.gender,
        address: createUserDto.address,
        city: createUserDto.city,
        state: createUserDto.state,
        zipCode: createUserDto.zipCode,
        joinDate: new Date().toISOString().split('T')[0],
        attendanceCode,
      },
      include: {
        role: true,
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
      },
    });

    if (!user) {
      throw new NotFoundException(`User with ID ${id} not found`);
    }

    return this.formatUser(user);
  }

  async findByRole(role: string): Promise<PaginatedResponse<any>> {
    return this.findAll({ role, noPagination: true });
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
      },
    });

    return this.formatUser(user);
  }

  async remove(id: number): Promise<{ success: boolean }> {
    await this.findOne(id);
    await this.prisma.user.delete({ where: { id } });
    return { success: true };
  }

  async updateStatus(userId: number, status: string): Promise<any> {
    return this.update(userId, { status } as UpdateUserDto);
  }
}
