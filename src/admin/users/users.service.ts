import { Injectable, NotFoundException, ConflictException } from '@nestjs/common';
import { InjectConnection } from '@nestjs/mongoose';
import { Connection, Model } from 'mongoose';
import * as bcrypt from 'bcrypt';
import { AdminCreateUserDto } from './dto/create-user.dto';
import { AdminUpdateUserDto } from './dto/update-user.dto';
import { UserSchema } from '../../database/schemas';

@Injectable()
export class AdminUsersService {
  private userModel: Model<any>;
  private readonly SALT_ROUNDS = 10;

  constructor(@InjectConnection() private connection: Connection) {
    this.userModel = this.connection.model('User', UserSchema);
  }

  async findAll(params: {
    page?: number;
    limit?: number;
    search?: string;
    role?: string;
    status?: string;
    gymId?: string;
  }) {
    const { page = 1, limit = 15, search, role, status, gymId } = params;
    const filter: any = {};

    if (search) {
      filter.$or = [
        { name: { $regex: search, $options: 'i' } },
        { email: { $regex: search, $options: 'i' } },
        { phone: { $regex: search, $options: 'i' } },
      ];
    }

    if (role && role !== 'all') {
      filter.role = role;
    }

    if (status && status !== 'all') {
      filter.status = status;
    }

    if (gymId && gymId !== 'all') {
      filter.gymId = gymId;
    }

    const skip = (page - 1) * limit;
    const [users, total] = await Promise.all([
      this.userModel
        .find(filter)
        .select('-passwordHash')
        .skip(skip)
        .limit(limit)
        .sort({ createdAt: -1 })
        .lean(),
      this.userModel.countDocuments(filter),
    ]);

    return {
      data: users.map((user: any) => ({
        id: user._id.toString(),
        ...user,
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
    const user = await this.userModel.findById(id).select('-passwordHash').lean();
    if (!user) {
      throw new NotFoundException(`User with ID ${id} not found`);
    }
    return {
      id: (user as any)._id.toString(),
      ...user,
      _id: undefined,
    };
  }

  async create(createUserDto: AdminCreateUserDto) {
    // Check if email already exists
    const existingUser = await this.userModel.findOne({ email: createUserDto.email });
    if (existingUser) {
      throw new ConflictException('User with this email already exists');
    }

    const { password, ...userData } = createUserDto;
    const passwordHash = await bcrypt.hash(password, this.SALT_ROUNDS);

    const user = await this.userModel.create({
      ...userData,
      passwordHash,
      joinDate: new Date().toISOString().split('T')[0],
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    const obj = user.toObject();
    const { passwordHash: _, ...result } = obj;
    return {
      id: obj._id.toString(),
      ...result,
      _id: undefined,
    };
  }

  async update(id: string, updateUserDto: AdminUpdateUserDto) {
    const user = await this.userModel
      .findByIdAndUpdate(
        id,
        { ...updateUserDto, updatedAt: new Date() },
        { new: true },
      )
      .select('-passwordHash')
      .lean();

    if (!user) {
      throw new NotFoundException(`User with ID ${id} not found`);
    }

    return {
      id: (user as any)._id.toString(),
      ...user,
      _id: undefined,
    };
  }

  async remove(id: string) {
    const result = await this.userModel.findByIdAndDelete(id);
    if (!result) {
      throw new NotFoundException(`User with ID ${id} not found`);
    }
    return { success: true, id };
  }

  async updatePassword(id: string, newPassword: string) {
    const passwordHash = await bcrypt.hash(newPassword, this.SALT_ROUNDS);
    const user = await this.userModel
      .findByIdAndUpdate(
        id,
        { passwordHash, updatedAt: new Date() },
        { new: true },
      )
      .select('-passwordHash')
      .lean();

    if (!user) {
      throw new NotFoundException(`User with ID ${id} not found`);
    }

    return { success: true };
  }
}
