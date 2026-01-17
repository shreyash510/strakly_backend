import { Injectable, NotFoundException } from '@nestjs/common';
import { DatabaseService } from '../database/database.service';
import { CreateProgramDto, UpdateProgramDto } from './dto/create-program.dto';

export interface Program {
  id: string;
  title: string;
  description?: string;
  type: 'workout' | 'diet' | 'exercise';
  duration?: number;
  difficulty: 'beginner' | 'intermediate' | 'advanced';
  createdBy: string;
  gymId?: string;
  exercises: any[];
  isPublic: boolean;
  imageUrl?: string;
  createdAt: string;
  updatedAt: string;
}

@Injectable()
export class ProgramsService {
  private readonly collectionName = 'programs';

  constructor(private readonly databaseService: DatabaseService) {}

  async findAll(userId: string): Promise<Program[]> {
    return this.databaseService.getCollection<Program>(
      this.collectionName,
      userId,
    );
  }

  async findPublic(): Promise<Program[]> {
    const baseMongoService = this.databaseService['baseMongoService'];
    const model = baseMongoService.getModel(this.collectionName);
    const docs = await model.find({ isPublic: true }).sort({ createdAt: -1 }).lean();
    return docs.map((doc: any) => ({
      id: doc._id.toString(),
      ...doc,
      _id: undefined,
    }));
  }

  async findOne(userId: string, id: string): Promise<Program> {
    const program = await this.databaseService.getDocument<Program>(
      this.collectionName,
      userId,
      id,
    );

    if (!program) {
      throw new NotFoundException(`Program with ID ${id} not found`);
    }

    return program;
  }

  async create(userId: string, createProgramDto: CreateProgramDto): Promise<Program> {
    const programData = {
      ...createProgramDto,
      createdBy: userId,
      difficulty: createProgramDto.difficulty || 'beginner',
      exercises: createProgramDto.exercises || [],
      isPublic: createProgramDto.isPublic ?? false,
    };

    return this.databaseService.createDocument<Program>(
      this.collectionName,
      userId,
      programData,
    );
  }

  async update(
    userId: string,
    id: string,
    updateProgramDto: UpdateProgramDto,
  ): Promise<Program> {
    await this.findOne(userId, id);

    const program = await this.databaseService.updateDocument<Program>(
      this.collectionName,
      userId,
      id,
      updateProgramDto,
    );

    if (!program) {
      throw new NotFoundException(`Program with ID ${id} not found`);
    }

    return program;
  }

  async remove(userId: string, id: string): Promise<{ success: boolean }> {
    await this.findOne(userId, id);
    await this.databaseService.deleteDocument(this.collectionName, userId, id);
    return { success: true };
  }

  async findByGym(gymId: string): Promise<Program[]> {
    const baseMongoService = this.databaseService['baseMongoService'];
    const model = baseMongoService.getModel(this.collectionName);
    const docs = await model.find({ gymId }).sort({ createdAt: -1 }).lean();
    return docs.map((doc: any) => ({
      id: doc._id.toString(),
      ...doc,
      _id: undefined,
    }));
  }

  async findByType(userId: string, type: string): Promise<Program[]> {
    const programs = await this.findAll(userId);
    return programs.filter(p => p.type === type);
  }
}
