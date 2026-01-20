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

    // Get paginated data
    const gyms = await this.prisma.gym.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip,
      take,
    });

    return {
      data: gyms,
      pagination: createPaginationMeta(total, page, limit, noPagination),
    };
  }

  async findOne(id: number) {
    const gym = await this.prisma.gym.findUnique({
      where: { id },
    });

    if (!gym) {
      throw new NotFoundException(`Gym with ID ${id} not found`);
    }

    return gym;
  }

  async create(dto: CreateGymDto) {
    return this.prisma.gym.create({
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
