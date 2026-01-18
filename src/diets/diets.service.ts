import { Injectable, NotFoundException } from '@nestjs/common';
import { DatabaseService } from '../database/database.service';
import { CreateDietDto } from './dto/create-diet.dto';
import { UpdateDietDto } from './dto/update-diet.dto';

export interface DietMeal {
  name: string;
  time?: string;
  foods: string[];
  calories?: number;
}

export interface Diet {
  id: string;
  title: string;
  description?: string;
  category: string;
  difficulty: 'beginner' | 'intermediate' | 'advanced';
  duration: number;
  status: 'draft' | 'active' | 'archived';
  meals: DietMeal[];
  dailyCalories?: number;
  macros?: {
    protein: number;
    carbs: number;
    fats: number;
  };
  createdBy: string;
  gymId?: string;
  createdAt: string;
  updatedAt: string;
}

@Injectable()
export class DietsService {
  private readonly collectionName = 'diets';

  constructor(private readonly databaseService: DatabaseService) {}

  async findAll(
    userId: string,
    filters?: {
      category?: string;
      status?: string;
      difficulty?: string;
      gymId?: string;
      page?: number;
      limit?: number;
    },
  ): Promise<{ data: Diet[]; total: number; page: number; limit: number }> {
    const diets = await this.databaseService.getCollection<Diet>(
      this.collectionName,
      userId,
    );

    let filteredDiets = diets;

    if (filters?.category) {
      filteredDiets = filteredDiets.filter(d => d.category === filters.category);
    }
    if (filters?.status) {
      filteredDiets = filteredDiets.filter(d => d.status === filters.status);
    }
    if (filters?.difficulty) {
      filteredDiets = filteredDiets.filter(d => d.difficulty === filters.difficulty);
    }
    if (filters?.gymId) {
      filteredDiets = filteredDiets.filter(d => d.gymId === filters.gymId);
    }

    const page = filters?.page || 1;
    const limit = filters?.limit || 10;
    const startIndex = (page - 1) * limit;
    const endIndex = startIndex + limit;

    const paginatedDiets = filteredDiets.slice(startIndex, endIndex);

    return {
      data: paginatedDiets,
      total: filteredDiets.length,
      page,
      limit,
    };
  }

  async findOne(userId: string, id: string): Promise<Diet> {
    const diet = await this.databaseService.getDocument<Diet>(
      this.collectionName,
      userId,
      id,
    );

    if (!diet) {
      throw new NotFoundException(`Diet with ID ${id} not found`);
    }

    return diet;
  }

  async findMyDiets(userId: string): Promise<Diet[]> {
    const baseMongoService = this.databaseService['baseMongoService'];
    const model = baseMongoService.getModel(this.collectionName);
    const docs = await model
      .find({ createdBy: userId })
      .sort({ createdAt: -1 })
      .lean();
    return docs.map((doc: any) => ({
      id: doc._id.toString(),
      ...doc,
      _id: undefined,
    }));
  }

  async findByGym(gymId: string): Promise<Diet[]> {
    const baseMongoService = this.databaseService['baseMongoService'];
    const model = baseMongoService.getModel(this.collectionName);
    const docs = await model.find({ gymId }).sort({ createdAt: -1 }).lean();
    return docs.map((doc: any) => ({
      id: doc._id.toString(),
      ...doc,
      _id: undefined,
    }));
  }

  async create(userId: string, createDietDto: CreateDietDto): Promise<Diet> {
    const dietData = {
      ...createDietDto,
      createdBy: userId,
      difficulty: createDietDto.difficulty || 'beginner',
      status: createDietDto.status || 'draft',
      meals: createDietDto.meals || [],
    };

    return this.databaseService.createDocument<Diet>(
      this.collectionName,
      userId,
      dietData,
    );
  }

  async update(
    userId: string,
    id: string,
    updateDietDto: UpdateDietDto,
  ): Promise<Diet> {
    await this.findOne(userId, id);

    const diet = await this.databaseService.updateDocument<Diet>(
      this.collectionName,
      userId,
      id,
      updateDietDto,
    );

    if (!diet) {
      throw new NotFoundException(`Diet with ID ${id} not found`);
    }

    return diet;
  }

  async remove(userId: string, id: string): Promise<{ success: boolean }> {
    await this.findOne(userId, id);
    await this.databaseService.deleteDocument(this.collectionName, userId, id);
    return { success: true };
  }
}
