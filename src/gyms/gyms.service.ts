import { Injectable, NotFoundException } from '@nestjs/common';
import { DatabaseService } from '../database/database.service';
import { CreateGymDto, UpdateGymDto } from './dto/create-gym.dto';

export interface Gym {
  id: string;
  name: string;
  address: string;
  city: string;
  state: string;
  zipCode: string;
  country?: string;
  phone?: string;
  email: string;
  website?: string;
  description?: string;
  openingTime?: string;
  closingTime?: string;
  capacity?: number;
  monthlyFee?: number;
  isActive: boolean;
  status: 'active' | 'inactive' | 'pending';
  amenities: string[];
  totalMembers: number;
  totalTrainers: number;
  createdAt: string;
  updatedAt: string;
}

@Injectable()
export class GymsService {
  private readonly collectionName = 'gyms';

  constructor(private readonly databaseService: DatabaseService) {}

  async findAll(userId: string): Promise<Gym[]> {
    return this.databaseService.getCollection<Gym>(
      this.collectionName,
      userId,
    );
  }

  async findOne(userId: string, id: string): Promise<Gym> {
    const gym = await this.databaseService.getDocument<Gym>(
      this.collectionName,
      userId,
      id,
    );

    if (!gym) {
      throw new NotFoundException(`Gym with ID ${id} not found`);
    }

    return gym;
  }

  async create(userId: string, createGymDto: CreateGymDto): Promise<Gym> {
    const gymData = {
      ...createGymDto,
      isActive: createGymDto.isActive ?? true,
      status: 'active' as const,
      amenities: createGymDto.amenities || [],
      totalMembers: 0,
      totalTrainers: 0,
    };

    return this.databaseService.createDocument<Gym>(
      this.collectionName,
      userId,
      gymData,
    );
  }

  async update(
    userId: string,
    id: string,
    updateGymDto: UpdateGymDto,
  ): Promise<Gym> {
    await this.findOne(userId, id);

    const gym = await this.databaseService.updateDocument<Gym>(
      this.collectionName,
      userId,
      id,
      updateGymDto,
    );

    if (!gym) {
      throw new NotFoundException(`Gym with ID ${id} not found`);
    }

    return gym;
  }

  async remove(userId: string, id: string): Promise<{ success: boolean }> {
    await this.findOne(userId, id);
    await this.databaseService.deleteDocument(this.collectionName, userId, id);
    return { success: true };
  }

  async updateMemberCount(userId: string, id: string, increment: number): Promise<Gym> {
    const gym = await this.findOne(userId, id);
    const newCount = Math.max(0, gym.totalMembers + increment);

    return this.databaseService.updateDocument<Gym>(
      this.collectionName,
      userId,
      id,
      { totalMembers: newCount },
    );
  }

  async updateTrainerCount(userId: string, id: string, increment: number): Promise<Gym> {
    const gym = await this.findOne(userId, id);
    const newCount = Math.max(0, gym.totalTrainers + increment);

    return this.databaseService.updateDocument<Gym>(
      this.collectionName,
      userId,
      id,
      { totalTrainers: newCount },
    );
  }
}
