import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Gym, GymDocument } from '../database/schemas/gym.schema';
import { UserGym, UserGymDocument } from '../database/schemas/user-gym.schema';
import { CreateGymDto } from './dto/create-gym.dto';
import { UpdateGymDto } from './dto/update-gym.dto';

@Injectable()
export class GymsService {
  constructor(
    @InjectModel(Gym.name) private gymModel: Model<GymDocument>,
    @InjectModel(UserGym.name) private userGymModel: Model<UserGymDocument>,
  ) {}

  async create(createGymDto: CreateGymDto, adminId: string, createdBy: string): Promise<Gym> {
    const gym = new this.gymModel({
      ...createGymDto,
      adminId: new Types.ObjectId(adminId),
      createdBy: new Types.ObjectId(createdBy),
    });
    const savedGym = await gym.save();

    // Add admin to user_gyms
    await this.userGymModel.create({
      userId: new Types.ObjectId(adminId),
      gymId: savedGym._id,
      createdBy: new Types.ObjectId(createdBy),
    });

    return savedGym;
  }

  async findAll(query: { isArchived?: boolean } = {}): Promise<Gym[]> {
    const filter: any = { isArchived: false };
    if (query.isArchived !== undefined) {
      filter.isArchived = query.isArchived;
    }
    return this.gymModel.find(filter).populate('adminId', 'firstName lastName email').exec();
  }

  async findOne(id: string): Promise<Gym> {
    const gym = await this.gymModel
      .findById(id)
      .populate('adminId', 'firstName lastName email')
      .exec();
    if (!gym) {
      throw new NotFoundException(`Gym with ID ${id} not found`);
    }
    return gym;
  }

  async findByAdmin(adminId: string): Promise<Gym[]> {
    return this.gymModel.find({ adminId: new Types.ObjectId(adminId), isArchived: false }).exec();
  }

  async update(id: string, updateGymDto: UpdateGymDto, updatedBy: string): Promise<Gym> {
    const gym = await this.gymModel
      .findByIdAndUpdate(
        id,
        { ...updateGymDto, updatedBy: new Types.ObjectId(updatedBy) },
        { new: true },
      )
      .exec();
    if (!gym) {
      throw new NotFoundException(`Gym with ID ${id} not found`);
    }
    return gym;
  }

  async activate(id: string, updatedBy: string): Promise<Gym> {
    const gym = await this.gymModel
      .findByIdAndUpdate(
        id,
        {
          isActive: true,
          activatedAt: new Date(),
          updatedBy: new Types.ObjectId(updatedBy),
        },
        { new: true },
      )
      .exec();
    if (!gym) {
      throw new NotFoundException(`Gym with ID ${id} not found`);
    }
    return gym;
  }

  async archive(id: string, archivedBy: string): Promise<Gym> {
    const gym = await this.gymModel
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
    if (!gym) {
      throw new NotFoundException(`Gym with ID ${id} not found`);
    }
    return gym;
  }

  async addUserToGym(userId: string, gymId: string, createdBy: string): Promise<UserGym> {
    return this.userGymModel.create({
      userId: new Types.ObjectId(userId),
      gymId: new Types.ObjectId(gymId),
      createdBy: new Types.ObjectId(createdBy),
    });
  }

  async removeUserFromGym(userId: string, gymId: string): Promise<void> {
    await this.userGymModel.deleteOne({
      userId: new Types.ObjectId(userId),
      gymId: new Types.ObjectId(gymId),
    });
  }

  async getGymUsers(gymId: string): Promise<UserGym[]> {
    return this.userGymModel
      .find({ gymId: new Types.ObjectId(gymId) })
      .populate('userId', 'firstName lastName email role')
      .exec();
  }
}
