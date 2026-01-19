import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';
import { UpdateUserDto } from './dto/create-user.dto';

@Injectable()
export class UsersService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(filters?: { role?: string; status?: string }): Promise<any[]> {
    const where: any = {};

    if (filters?.role) {
      where.role = { code: filters.role };
    }
    if (filters?.status) {
      where.status = filters.status;
    }

    const users = await this.prisma.user.findMany({
      where,
      include: {
        role: true,
      },
      orderBy: { createdAt: 'desc' },
    });

    return users.map(user => ({
      id: user.id,
      name: user.name,
      email: user.email,
      phone: user.phone,
      avatar: user.avatar,
      bio: user.bio,
      role: user.role?.code || 'user',
      status: user.status,
      dateOfBirth: user.dateOfBirth,
      gender: user.gender,
      address: user.address,
      city: user.city,
      state: user.state,
      zipCode: user.zipCode,
      createdAt: user.createdAt,
      updatedAt: user.updatedAt,
    }));
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

    return {
      id: user.id,
      name: user.name,
      email: user.email,
      phone: user.phone,
      avatar: user.avatar,
      bio: user.bio,
      role: user.role?.code || 'user',
      status: user.status,
      dateOfBirth: user.dateOfBirth,
      gender: user.gender,
      address: user.address,
      city: user.city,
      state: user.state,
      zipCode: user.zipCode,
      createdAt: user.createdAt,
      updatedAt: user.updatedAt,
    };
  }

  async findByRole(role: string): Promise<any[]> {
    return this.findAll({ role });
  }

  async update(id: number, updateUserDto: UpdateUserDto): Promise<any> {
    await this.findOne(id);

    // Extract role from DTO and handle separately
    const { role: roleCode, ...updateData } = updateUserDto;

    let roleId: string | undefined;
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

    return {
      id: user.id,
      name: user.name,
      email: user.email,
      phone: user.phone,
      avatar: user.avatar,
      bio: user.bio,
      role: user.role?.code || 'user',
      status: user.status,
      dateOfBirth: user.dateOfBirth,
      gender: user.gender,
      address: user.address,
      city: user.city,
      state: user.state,
      zipCode: user.zipCode,
      createdAt: user.createdAt,
      updatedAt: user.updatedAt,
    };
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
