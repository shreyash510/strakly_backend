import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectConnection } from '@nestjs/mongoose';
import { Connection, Model } from 'mongoose';
import { CreateProgramDto } from './dto/create-program.dto';
import { UpdateProgramDto } from './dto/update-program.dto';
import { ProgramSchema, UserSchema } from '../../database/schemas';

@Injectable()
export class ProgramsService {
  private programModel: Model<any>;
  private userModel: Model<any>;

  constructor(@InjectConnection() private connection: Connection) {
    this.programModel = this.connection.model('Program', ProgramSchema);
    this.userModel = this.connection.model('User', UserSchema);
  }

  async findAll(params: {
    page?: number;
    limit?: number;
    search?: string;
    type?: string;
    status?: string;
    difficulty?: string;
  }) {
    const { page = 1, limit = 15, search, type, status, difficulty } = params;
    const filter: any = {};

    if (search) {
      filter.$or = [
        { title: { $regex: search, $options: 'i' } },
        { description: { $regex: search, $options: 'i' } },
        { category: { $regex: search, $options: 'i' } },
      ];
    }

    if (type && type !== 'all') {
      filter.type = type;
    }

    if (status && status !== 'all') {
      filter.status = status;
    }

    if (difficulty && difficulty !== 'all') {
      filter.difficulty = difficulty;
    }

    const skip = (page - 1) * limit;
    const [programs, total] = await Promise.all([
      this.programModel.find(filter).skip(skip).limit(limit).sort({ createdAt: -1 }).lean(),
      this.programModel.countDocuments(filter),
    ]);

    // Get author names
    const authorIds = programs.map((p: any) => p.createdBy);
    const authors = await this.userModel.find({ _id: { $in: authorIds } }).select('name').lean();
    const authorMap = new Map(authors.map((a: any) => [a._id.toString(), a.name]));

    return {
      data: programs.map((program: any) => ({
        id: program._id.toString(),
        ...program,
        _id: undefined,
        authorId: program.createdBy?.toString(),
        authorName: authorMap.get(program.createdBy?.toString()) || 'Unknown',
        totalEnrollments: program.totalEnrollments || 0,
        rating: program.rating || 0,
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
    const program = await this.programModel.findById(id).lean();
    if (!program) {
      throw new NotFoundException(`Program with ID ${id} not found`);
    }

    const author = await this.userModel.findById((program as any).createdBy).select('name').lean();

    return {
      id: (program as any)._id.toString(),
      ...program,
      _id: undefined,
      authorId: (program as any).createdBy?.toString(),
      authorName: (author as any)?.name || 'Unknown',
      totalEnrollments: (program as any).totalEnrollments || 0,
      rating: (program as any).rating || 0,
    };
  }

  async create(createProgramDto: CreateProgramDto, userId: string) {
    const program = await this.programModel.create({
      ...createProgramDto,
      createdBy: userId,
      totalEnrollments: 0,
      rating: 0,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    return this.findOne(program._id.toString());
  }

  async update(id: string, updateProgramDto: UpdateProgramDto) {
    const program = await this.programModel
      .findByIdAndUpdate(
        id,
        { ...updateProgramDto, updatedAt: new Date() },
        { new: true },
      )
      .lean();

    if (!program) {
      throw new NotFoundException(`Program with ID ${id} not found`);
    }

    return this.findOne(id);
  }

  async remove(id: string) {
    const result = await this.programModel.findByIdAndDelete(id);
    if (!result) {
      throw new NotFoundException(`Program with ID ${id} not found`);
    }
    return { success: true, id };
  }
}
