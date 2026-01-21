import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';
import { CreateGymDto, UpdateGymDto } from './dto/gym.dto';
import {
  PaginationParams,
  PaginatedResponse,
  getPaginationParams,
  createPaginationMeta,
} from '../common/pagination.util';

export interface GymFilters extends PaginationParams {
  status?: string;
  includeInactive?: boolean;
}

@Injectable()
export class GymService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(filters: GymFilters = {}): Promise<PaginatedResponse<any>> {
    const { page, limit, skip, take, noPagination } = getPaginationParams(filters);

    const where: any = {};

    // Handle status filter
    if (filters.status && filters.status !== 'all') {
      where.isActive = filters.status === 'active';
    } else if (!filters.includeInactive) {
      where.isActive = true;
    }

    // Apply search filter
    if (filters.search) {
      where.OR = [
        { name: { contains: filters.search, mode: 'insensitive' } },
        { email: { contains: filters.search, mode: 'insensitive' } },
        { phone: { contains: filters.search, mode: 'insensitive' } },
        { city: { contains: filters.search, mode: 'insensitive' } },
      ];
    }

    // Get total count
    const total = await this.prisma.gym.count({ where });

    // Get paginated data with owner info
    const gyms = await this.prisma.gym.findMany({
      where,
      include: {
        gymUsers: {
          where: { role: 'admin', isActive: true },
          include: {
            user: {
              select: { id: true, name: true, email: true },
            },
          },
          take: 1,
        },
      },
      orderBy: { createdAt: 'desc' },
      skip,
      take,
    });

    // Format response with owner info
    const formattedGyms = gyms.map((gym) => {
      const owner = gym.gymUsers[0]?.user || null;
      const { gymUsers, ...gymData } = gym;
      return {
        ...gymData,
        owner,
      };
    });

    return {
      data: formattedGyms,
      pagination: createPaginationMeta(total, page, limit, noPagination),
    };
  }

  async findOne(id: number) {
    const gym = await this.prisma.gym.findUnique({
      where: { id },
      include: {
        gymUsers: {
          where: { role: 'admin', isActive: true },
          include: {
            user: {
              select: { id: true, name: true, email: true },
            },
          },
          take: 1,
        },
      },
    });

    if (!gym) {
      throw new NotFoundException(`Gym with ID ${id} not found`);
    }

    // Format response with owner info
    const owner = gym.gymUsers[0]?.user || null;
    const { gymUsers, ...gymData } = gym;
    return {
      ...gymData,
      owner,
    };
  }

  async create(dto: CreateGymDto) {
    // Create gym and user-gym relationship in a transaction
    const result = await this.prisma.$transaction(async (tx) => {
      // Create the gym
      const gym = await tx.gym.create({
        data: {
          name: dto.name,
          description: dto.description,
          logo: dto.logo,
          phone: dto.phone,
          email: dto.email,
          website: dto.website,
          address: dto.address,
          city: dto.city,
          state: dto.state,
          zipCode: dto.zipCode,
          country: dto.country || 'India',
          openingTime: dto.openingTime,
          closingTime: dto.closingTime,
          capacity: dto.capacity,
          amenities: dto.amenities || [],
          isActive: dto.isActive ?? true,
        },
      });

      // Update the admin user's gymId
      await tx.user.update({
        where: { id: dto.userId },
        data: { gymId: gym.id },
      });

      // Create the user-gym relationship (keeping for backward compatibility)
      await tx.userGymXref.create({
        data: {
          userId: dto.userId,
          gymId: gym.id,
          role: 'admin',
          isActive: true,
        },
      });

      return gym;
    });

    // Return gym with owner info
    return this.findOne(result.id);
  }

  async update(id: number, dto: UpdateGymDto) {
    await this.findOne(id);

    return this.prisma.gym.update({
      where: { id },
      data: dto,
    });
  }

  async remove(id: number) {
    await this.findOne(id);

    await this.prisma.gym.delete({
      where: { id },
    });

    return { success: true, message: 'Gym deleted successfully' };
  }

  async toggleStatus(id: number) {
    const gym = await this.findOne(id);

    return this.prisma.gym.update({
      where: { id },
      data: { isActive: !gym.isActive },
    });
  }
}
