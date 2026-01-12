import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { TrainerAssignment, TrainerAssignmentDocument } from '../database/schemas/trainer-assignment.schema';
import { CreateTrainerAssignmentDto } from './dto/create-trainer-assignment.dto';

@Injectable()
export class TrainerAssignmentsService {
  constructor(
    @InjectModel(TrainerAssignment.name) private model: Model<TrainerAssignmentDocument>,
  ) {}

  async create(dto: CreateTrainerAssignmentDto, assignedBy: string): Promise<TrainerAssignment> {
    const assignment = new this.model({
      trainerId: new Types.ObjectId(dto.trainerId),
      userId: new Types.ObjectId(dto.userId),
      gymId: new Types.ObjectId(dto.gymId),
      assignedBy: new Types.ObjectId(assignedBy),
      createdBy: new Types.ObjectId(assignedBy),
    });
    return assignment.save();
  }

  async findByGym(gymId: string): Promise<TrainerAssignment[]> {
    return this.model
      .find({ gymId: new Types.ObjectId(gymId), isArchived: false })
      .populate('trainerId', 'firstName lastName email')
      .populate('userId', 'firstName lastName email')
      .exec();
  }

  async findByTrainer(trainerId: string): Promise<TrainerAssignment[]> {
    return this.model
      .find({ trainerId: new Types.ObjectId(trainerId), isArchived: false, isActive: true })
      .populate('userId', 'firstName lastName email')
      .exec();
  }

  async findByUser(userId: string): Promise<TrainerAssignment[]> {
    return this.model
      .find({ userId: new Types.ObjectId(userId), isArchived: false, isActive: true })
      .populate('trainerId', 'firstName lastName email')
      .exec();
  }

  async deactivate(id: string, updatedBy: string): Promise<TrainerAssignment> {
    const assignment = await this.model
      .findByIdAndUpdate(
        id,
        { isActive: false, updatedBy: new Types.ObjectId(updatedBy) },
        { new: true },
      )
      .exec();
    if (!assignment) {
      throw new NotFoundException(`Assignment with ID ${id} not found`);
    }
    return assignment;
  }

  async archive(id: string, archivedBy: string): Promise<TrainerAssignment> {
    const assignment = await this.model
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
    if (!assignment) {
      throw new NotFoundException(`Assignment with ID ${id} not found`);
    }
    return assignment;
  }
}
