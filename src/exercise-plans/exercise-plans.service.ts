import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { ExercisePlan, ExercisePlanDocument } from '../database/schemas/exercise-plan.schema';
import { CreateExercisePlanDto } from './dto/create-exercise-plan.dto';

@Injectable()
export class ExercisePlansService {
  constructor(
    @InjectModel(ExercisePlan.name) private model: Model<ExercisePlanDocument>,
  ) {}

  async create(dto: CreateExercisePlanDto, createdBy: string): Promise<ExercisePlan> {
    const plan = new this.model({
      ...dto,
      userId: new Types.ObjectId(dto.userId),
      gymId: new Types.ObjectId(dto.gymId),
      createdBy: new Types.ObjectId(createdBy),
    });
    return plan.save();
  }

  async findAll(gymId: string): Promise<ExercisePlan[]> {
    return this.model
      .find({ gymId: new Types.ObjectId(gymId), isArchived: false })
      .populate('userId', 'firstName lastName email')
      .populate('createdBy', 'firstName lastName')
      .exec();
  }

  async findByUser(userId: string): Promise<ExercisePlan[]> {
    return this.model
      .find({ userId: new Types.ObjectId(userId), isArchived: false, isActive: true })
      .populate('createdBy', 'firstName lastName')
      .exec();
  }

  async findOne(id: string): Promise<ExercisePlan> {
    const plan = await this.model
      .findById(id)
      .populate('userId', 'firstName lastName email')
      .populate('createdBy', 'firstName lastName')
      .exec();
    if (!plan) {
      throw new NotFoundException(`Exercise plan with ID ${id} not found`);
    }
    return plan;
  }

  async update(id: string, dto: Partial<CreateExercisePlanDto>, updatedBy: string): Promise<ExercisePlan> {
    const plan = await this.model
      .findByIdAndUpdate(
        id,
        { ...dto, updatedBy: new Types.ObjectId(updatedBy) },
        { new: true },
      )
      .exec();
    if (!plan) {
      throw new NotFoundException(`Exercise plan with ID ${id} not found`);
    }
    return plan;
  }

  async archive(id: string, archivedBy: string): Promise<ExercisePlan> {
    const plan = await this.model
      .findByIdAndUpdate(
        id,
        {
          isArchived: true,
          archivedAt: new Date(),
          archivedBy: new Types.ObjectId(archivedBy),
        },
        { new: true },
      )
      .exec();
    if (!plan) {
      throw new NotFoundException(`Exercise plan with ID ${id} not found`);
    }
    return plan;
  }
}
