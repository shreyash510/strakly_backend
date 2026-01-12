import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Announcement, AnnouncementDocument } from '../database/schemas/announcement.schema';
import { CreateAnnouncementDto } from './dto/create-announcement.dto';

@Injectable()
export class AnnouncementsService {
  constructor(
    @InjectModel(Announcement.name) private model: Model<AnnouncementDocument>,
  ) {}

  async create(dto: CreateAnnouncementDto, createdBy: string): Promise<Announcement> {
    const announcement = new this.model({
      ...dto,
      gymId: new Types.ObjectId(dto.gymId),
      createdBy: new Types.ObjectId(createdBy),
    });
    return announcement.save();
  }

  async findAll(gymId: string): Promise<Announcement[]> {
    return this.model
      .find({ gymId: new Types.ObjectId(gymId), isArchived: false, isActive: true })
      .populate('createdBy', 'firstName lastName')
      .sort({ createdAt: -1 })
      .exec();
  }

  async findOne(id: string): Promise<Announcement> {
    const announcement = await this.model
      .findById(id)
      .populate('createdBy', 'firstName lastName')
      .exec();
    if (!announcement) {
      throw new NotFoundException(`Announcement with ID ${id} not found`);
    }
    return announcement;
  }

  async update(id: string, dto: Partial<CreateAnnouncementDto>, updatedBy: string): Promise<Announcement> {
    const announcement = await this.model
      .findByIdAndUpdate(
        id,
        { ...dto, updatedBy: new Types.ObjectId(updatedBy) },
        { new: true },
      )
      .exec();
    if (!announcement) {
      throw new NotFoundException(`Announcement with ID ${id} not found`);
    }
    return announcement;
  }

  async archive(id: string, archivedBy: string): Promise<Announcement> {
    const announcement = await this.model
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
    if (!announcement) {
      throw new NotFoundException(`Announcement with ID ${id} not found`);
    }
    return announcement;
  }
}
