import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Subscription, SubscriptionDocument } from '../database/schemas/subscription.schema';
import { CreateSubscriptionDto } from './dto/create-subscription.dto';

@Injectable()
export class SubscriptionsService {
  constructor(
    @InjectModel(Subscription.name) private model: Model<SubscriptionDocument>,
  ) {}

  async create(dto: CreateSubscriptionDto, createdBy: string): Promise<Subscription> {
    const subscription = new this.model({
      ...dto,
      userId: new Types.ObjectId(dto.userId),
      gymId: new Types.ObjectId(dto.gymId),
      createdBy: new Types.ObjectId(createdBy),
    });
    return subscription.save();
  }

  async findAll(gymId: string): Promise<Subscription[]> {
    return this.model
      .find({ gymId: new Types.ObjectId(gymId), isArchived: false })
      .populate('userId', 'firstName lastName email')
      .sort({ createdAt: -1 })
      .exec();
  }

  async findByUser(userId: string): Promise<Subscription[]> {
    return this.model
      .find({ userId: new Types.ObjectId(userId), isArchived: false })
      .populate('gymId', 'name')
      .sort({ createdAt: -1 })
      .exec();
  }

  async findOne(id: string): Promise<Subscription> {
    const subscription = await this.model
      .findById(id)
      .populate('userId', 'firstName lastName email')
      .populate('gymId', 'name')
      .exec();
    if (!subscription) {
      throw new NotFoundException(`Subscription with ID ${id} not found`);
    }
    return subscription;
  }

  async update(id: string, dto: Partial<CreateSubscriptionDto>, updatedBy: string): Promise<Subscription> {
    const subscription = await this.model
      .findByIdAndUpdate(
        id,
        { ...dto, updatedBy: new Types.ObjectId(updatedBy) },
        { new: true },
      )
      .exec();
    if (!subscription) {
      throw new NotFoundException(`Subscription with ID ${id} not found`);
    }
    return subscription;
  }

  async updateStatus(id: string, status: string, updatedBy: string): Promise<Subscription> {
    const subscription = await this.model
      .findByIdAndUpdate(
        id,
        { status, updatedBy: new Types.ObjectId(updatedBy) },
        { new: true },
      )
      .exec();
    if (!subscription) {
      throw new NotFoundException(`Subscription with ID ${id} not found`);
    }
    return subscription;
  }

  async archive(id: string, archivedBy: string): Promise<Subscription> {
    const subscription = await this.model
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
    if (!subscription) {
      throw new NotFoundException(`Subscription with ID ${id} not found`);
    }
    return subscription;
  }
}
