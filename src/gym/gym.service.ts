import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';
import { CreateGymDto, UpdateGymDto } from './dto/gym.dto';

@Injectable()
export class GymService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(includeInactive = false) {
    const where = includeInactive ? {} : { isActive: true };

    return this.prisma.gym.findMany({
      where,
      orderBy: { createdAt: 'desc' },
    });
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
