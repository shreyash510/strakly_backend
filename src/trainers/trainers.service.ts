import { Injectable, NotFoundException } from '@nestjs/common';
import { DatabaseService } from '../database/database.service';
import { CreateTrainerDto, UpdateTrainerDto, TrainerStatus, TrainerSpecialization } from './dto/create-trainer.dto';

export interface Trainer {
  id: string;
  name: string;
  email: string;
  phone?: string;
  avatar?: string;
  bio?: string;
  specializations: TrainerSpecialization[];
  certifications: string[];
  experience: number;
  hourlyRate: number;
  gymId?: string;
  status: TrainerStatus;
  totalClients: number;
  rating: number;
  dateOfBirth?: string;
  gender?: 'male' | 'female' | 'other';
  address?: string;
  city?: string;
  state?: string;
  zipCode?: string;
  joinDate: string;
  createdAt: string;
  updatedAt: string;
}

@Injectable()
export class TrainersService {
  private readonly collectionName = 'trainers';

  constructor(private readonly databaseService: DatabaseService) {}

  async findAll(userId: string, filters?: { gymId?: string; status?: string }): Promise<Trainer[]> {
    const trainers = await this.databaseService.getCollection<Trainer>(
      this.collectionName,
      userId,
    );

    let filteredTrainers = trainers;
    if (filters?.gymId) {
      filteredTrainers = filteredTrainers.filter(t => t.gymId === filters.gymId);
    }
    if (filters?.status) {
      filteredTrainers = filteredTrainers.filter(t => t.status === filters.status);
    }

    return filteredTrainers;
  }

  async findOne(userId: string, id: string): Promise<Trainer> {
    const trainer = await this.databaseService.getDocument<Trainer>(
      this.collectionName,
      userId,
      id,
    );

    if (!trainer) {
      throw new NotFoundException(`Trainer with ID ${id} not found`);
    }

    return trainer;
  }

  async findByGym(userId: string, gymId: string): Promise<Trainer[]> {
    return this.findAll(userId, { gymId });
  }

  async create(userId: string, createTrainerDto: CreateTrainerDto): Promise<Trainer> {
    const trainerData = {
      ...createTrainerDto,
      specializations: createTrainerDto.specializations || [],
      certifications: createTrainerDto.certifications || [],
      experience: createTrainerDto.experience || 0,
      hourlyRate: createTrainerDto.hourlyRate || 0,
      status: createTrainerDto.status || 'active',
      totalClients: 0,
      rating: 0,
      joinDate: new Date().toISOString(),
    };

    return this.databaseService.createDocument<Trainer>(
      this.collectionName,
      userId,
      trainerData,
    );
  }

  async update(
    userId: string,
    id: string,
    updateTrainerDto: UpdateTrainerDto,
  ): Promise<Trainer> {
    await this.findOne(userId, id);

    const trainer = await this.databaseService.updateDocument<Trainer>(
      this.collectionName,
      userId,
      id,
      updateTrainerDto,
    );

    if (!trainer) {
      throw new NotFoundException(`Trainer with ID ${id} not found`);
    }

    return trainer;
  }

  async remove(userId: string, id: string): Promise<{ success: boolean }> {
    await this.findOne(userId, id);
    await this.databaseService.deleteDocument(this.collectionName, userId, id);
    return { success: true };
  }

  async updateClientCount(userId: string, id: string, increment: number): Promise<Trainer> {
    const trainer = await this.findOne(userId, id);
    const newCount = Math.max(0, trainer.totalClients + increment);

    return this.databaseService.updateDocument<Trainer>(
      this.collectionName,
      userId,
      id,
      { totalClients: newCount },
    );
  }

  async updateRating(userId: string, id: string, rating: number): Promise<Trainer> {
    return this.databaseService.updateDocument<Trainer>(
      this.collectionName,
      userId,
      id,
      { rating },
    );
  }
}
