import { Injectable, NotFoundException, ConflictException } from '@nestjs/common';
import { InjectConnection } from '@nestjs/mongoose';
import { Connection, Model } from 'mongoose';
import * as bcrypt from 'bcrypt';
import { CreateTrainerDto } from './dto/create-trainer.dto';
import { UpdateTrainerDto } from './dto/update-trainer.dto';
import { TrainerSchema, UserSchema } from '../../database/schemas';

@Injectable()
export class TrainersService {
  private trainerModel: Model<any>;
  private userModel: Model<any>;
  private readonly SALT_ROUNDS = 10;

  constructor(@InjectConnection() private connection: Connection) {
    this.trainerModel = this.connection.model('Trainer', TrainerSchema);
    this.userModel = this.connection.model('User', UserSchema);
  }

  async findAll(params: {
    page?: number;
    limit?: number;
    search?: string;
    status?: string;
    specialization?: string;
    gymId?: string;
  }) {
    const { page = 1, limit = 15, search, status, specialization, gymId } = params;

    // Get all trainers with their user info
    const userFilter: any = { role: 'trainer' };

    if (search) {
      userFilter.$or = [
        { name: { $regex: search, $options: 'i' } },
        { email: { $regex: search, $options: 'i' } },
        { phone: { $regex: search, $options: 'i' } },
      ];
    }

    if (status && status !== 'all') {
      userFilter.status = status;
    }

    if (gymId && gymId !== 'all') {
      userFilter.gymId = gymId;
    }

    const skip = (page - 1) * limit;

    // Get users who are trainers
    const [users, total] = await Promise.all([
      this.userModel
        .find(userFilter)
        .select('-passwordHash')
        .skip(skip)
        .limit(limit)
        .sort({ createdAt: -1 })
        .lean(),
      this.userModel.countDocuments(userFilter),
    ]);

    // Get trainer-specific data
    const userIds = users.map((u: any) => u._id);
    const trainerData = await this.trainerModel.find({ userId: { $in: userIds } }).lean();
    const trainerMap = new Map(trainerData.map((t: any) => [t.userId.toString(), t]));

    const trainers = users.map((user: any) => {
      const trainer = trainerMap.get(user._id.toString()) || {};
      return {
        id: user._id.toString(),
        name: user.name,
        email: user.email,
        phone: user.phone,
        avatar: user.avatar,
        status: user.status || 'active',
        gymId: user.gymId,
        specializations: (trainer as any).specializations || [],
        certifications: (trainer as any).certifications || [],
        experience: (trainer as any).experience || 0,
        hourlyRate: (trainer as any).hourlyRate || 0,
        bio: (trainer as any).bio || user.bio,
        rating: (trainer as any).rating || 0,
        totalClients: (trainer as any).totalClients || 0,
        dateOfBirth: user.dateOfBirth,
        gender: user.gender,
        address: user.address,
        city: user.city,
        state: user.state,
        zipCode: user.zipCode,
        joinDate: user.joinDate || user.createdAt,
        createdAt: user.createdAt,
        updatedAt: user.updatedAt,
      };
    });

    // Filter by specialization if needed
    let filteredTrainers = trainers;
    if (specialization && specialization !== 'all') {
      filteredTrainers = trainers.filter((t) =>
        t.specializations.includes(specialization),
      );
    }

    return {
      data: filteredTrainers,
      pagination: {
        page,
        limit,
        total: specialization && specialization !== 'all' ? filteredTrainers.length : total,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  async findOne(id: string) {
    const user = await this.userModel.findById(id).select('-passwordHash').lean();
    if (!user || (user as any).role !== 'trainer') {
      throw new NotFoundException(`Trainer with ID ${id} not found`);
    }

    const trainer = await this.trainerModel.findOne({ userId: id }).lean();

    return {
      id: (user as any)._id.toString(),
      name: (user as any).name,
      email: (user as any).email,
      phone: (user as any).phone,
      avatar: (user as any).avatar,
      status: (user as any).status || 'active',
      gymId: (user as any).gymId,
      specializations: trainer?.specializations || [],
      certifications: trainer?.certifications || [],
      experience: trainer?.experience || 0,
      hourlyRate: trainer?.hourlyRate || 0,
      bio: trainer?.bio || (user as any).bio,
      rating: trainer?.rating || 0,
      totalClients: trainer?.totalClients || 0,
      dateOfBirth: (user as any).dateOfBirth,
      gender: (user as any).gender,
      address: (user as any).address,
      city: (user as any).city,
      state: (user as any).state,
      zipCode: (user as any).zipCode,
      joinDate: (user as any).joinDate || (user as any).createdAt,
      createdAt: (user as any).createdAt,
      updatedAt: (user as any).updatedAt,
    };
  }

  async create(createTrainerDto: CreateTrainerDto) {
    // Check if email already exists
    const existingUser = await this.userModel.findOne({ email: createTrainerDto.email });
    if (existingUser) {
      throw new ConflictException('User with this email already exists');
    }

    // Create user with trainer role
    const { specializations, certifications, experience, hourlyRate, bio, ...userData } = createTrainerDto;
    const passwordHash = await bcrypt.hash('trainer123', this.SALT_ROUNDS); // Default password

    const user = await this.userModel.create({
      ...userData,
      passwordHash,
      role: 'trainer',
      joinDate: new Date().toISOString().split('T')[0],
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    // Create trainer-specific data
    await this.trainerModel.create({
      userId: user._id,
      gymId: userData.gymId,
      specializations: specializations || [],
      certifications: certifications || [],
      experience: experience || 0,
      hourlyRate: hourlyRate || 0,
      bio: bio || '',
      rating: 0,
      totalClients: 0,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    return this.findOne(user._id.toString());
  }

  async update(id: string, updateTrainerDto: UpdateTrainerDto) {
    const user = await this.userModel.findById(id);
    if (!user || user.role !== 'trainer') {
      throw new NotFoundException(`Trainer with ID ${id} not found`);
    }

    const { specializations, certifications, experience, hourlyRate, bio, ...userData } = updateTrainerDto;

    // Update user data
    await this.userModel.findByIdAndUpdate(id, {
      ...userData,
      updatedAt: new Date(),
    });

    // Update trainer-specific data
    await this.trainerModel.findOneAndUpdate(
      { userId: id },
      {
        specializations,
        certifications,
        experience,
        hourlyRate,
        bio,
        updatedAt: new Date(),
      },
      { upsert: true },
    );

    return this.findOne(id);
  }

  async remove(id: string) {
    const user = await this.userModel.findById(id);
    if (!user || user.role !== 'trainer') {
      throw new NotFoundException(`Trainer with ID ${id} not found`);
    }

    await this.trainerModel.deleteOne({ userId: id });
    await this.userModel.findByIdAndDelete(id);

    return { success: true, id };
  }
}
