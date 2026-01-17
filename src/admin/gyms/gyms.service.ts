import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectConnection } from '@nestjs/mongoose';
import { Connection, Model } from 'mongoose';
import { CreateGymDto } from './dto/create-gym.dto';
import { UpdateGymDto } from './dto/update-gym.dto';
import { GymSchema } from '../../database/schemas';

@Injectable()
export class GymsService {
  private gymModel: Model<any>;

  constructor(@InjectConnection() private connection: Connection) {
    this.gymModel = this.connection.model('Gym', GymSchema);
  }

  async findAll(params: {
    page?: number;
    limit?: number;
    search?: string;
    status?: string;
  }) {
    const { page = 1, limit = 15, search, status } = params;
    const filter: any = {};

    if (search) {
      filter.$or = [
        { name: { $regex: search, $options: 'i' } },
        { city: { $regex: search, $options: 'i' } },
        { email: { $regex: search, $options: 'i' } },
      ];
    }

    if (status && status !== 'all') {
      filter.status = status;
    }

    const skip = (page - 1) * limit;
    const [gyms, total] = await Promise.all([
      this.gymModel.find(filter).skip(skip).limit(limit).sort({ createdAt: -1 }).lean(),
      this.gymModel.countDocuments(filter),
    ]);

    return {
      data: gyms.map((gym: any) => ({
        id: gym._id.toString(),
        ...gym,
        _id: undefined,
      })),
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  async findOne(id: string) {
    const gym = await this.gymModel.findById(id).lean();
    if (!gym) {
      throw new NotFoundException(`Gym with ID ${id} not found`);
    }
    return {
      id: (gym as any)._id.toString(),
      ...gym,
      _id: undefined,
    };
  }

  async create(createGymDto: CreateGymDto) {
    const gym = await this.gymModel.create({
      ...createGymDto,
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    const obj = gym.toObject();
    return {
      id: obj._id.toString(),
      ...obj,
      _id: undefined,
    };
  }

  async update(id: string, updateGymDto: UpdateGymDto) {
    const gym = await this.gymModel
      .findByIdAndUpdate(
        id,
        { ...updateGymDto, updatedAt: new Date() },
        { new: true },
      )
      .lean();

    if (!gym) {
      throw new NotFoundException(`Gym with ID ${id} not found`);
    }

    return {
      id: (gym as any)._id.toString(),
      ...gym,
      _id: undefined,
    };
  }

  async remove(id: string) {
    const result = await this.gymModel.findByIdAndDelete(id);
    if (!result) {
      throw new NotFoundException(`Gym with ID ${id} not found`);
    }
    return { success: true, id };
  }
}
