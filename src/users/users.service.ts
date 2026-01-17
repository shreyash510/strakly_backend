import { Injectable, NotFoundException } from '@nestjs/common';
import { DatabaseService } from '../database/database.service';
import { CreateUserDto, UpdateUserDto, UserRole, UserStatus, Gender } from './dto/create-user.dto';

export interface User {
  id: string;
  name: string;
  email: string;
  phone?: string;
  avatar?: string;
  bio?: string;
  role: UserRole;
  status: UserStatus;
  dateOfBirth?: string;
  gender?: Gender;
  address?: string;
  city?: string;
  state?: string;
  zipCode?: string;
  gymId?: string;
  trainerId?: string;
  streak: number;
  createdAt: string;
  updatedAt: string;
}

@Injectable()
export class UsersService {
  private readonly collectionName = 'users';

  constructor(private readonly databaseService: DatabaseService) {}

  async findAll(adminUserId: string, filters?: { role?: string; status?: string; gymId?: string }): Promise<User[]> {
    const users = await this.databaseService.getCollection<User>(
      this.collectionName,
      adminUserId,
    );

    // Apply filters if provided
    let filteredUsers = users;
    if (filters?.role) {
      filteredUsers = filteredUsers.filter(u => u.role === filters.role);
    }
    if (filters?.status) {
      filteredUsers = filteredUsers.filter(u => u.status === filters.status);
    }
    if (filters?.gymId) {
      filteredUsers = filteredUsers.filter(u => u.gymId === filters.gymId);
    }

    return filteredUsers;
  }

  async findOne(adminUserId: string, id: string): Promise<User> {
    const user = await this.databaseService.getDocument<User>(
      this.collectionName,
      adminUserId,
      id,
    );

    if (!user) {
      throw new NotFoundException(`User with ID ${id} not found`);
    }

    return user;
  }

  async findByRole(adminUserId: string, role: UserRole): Promise<User[]> {
    const users = await this.findAll(adminUserId);
    return users.filter(u => u.role === role);
  }

  async create(adminUserId: string, createUserDto: CreateUserDto): Promise<User> {
    const userData = {
      ...createUserDto,
      role: createUserDto.role || 'user',
      status: createUserDto.status || 'active',
      streak: 0,
    };

    // Remove password from stored data (would be handled by auth service)
    delete (userData as any).password;

    return this.databaseService.createDocument<User>(
      this.collectionName,
      adminUserId,
      userData,
    );
  }

  async update(
    adminUserId: string,
    id: string,
    updateUserDto: UpdateUserDto,
  ): Promise<User> {
    await this.findOne(adminUserId, id);

    const user = await this.databaseService.updateDocument<User>(
      this.collectionName,
      adminUserId,
      id,
      updateUserDto,
    );

    if (!user) {
      throw new NotFoundException(`User with ID ${id} not found`);
    }

    return user;
  }

  async remove(adminUserId: string, id: string): Promise<{ success: boolean }> {
    await this.findOne(adminUserId, id);
    await this.databaseService.deleteDocument(this.collectionName, adminUserId, id);
    return { success: true };
  }

  async assignToGym(adminUserId: string, userId: string, gymId: string): Promise<User> {
    return this.update(adminUserId, userId, { gymId });
  }

  async assignToTrainer(adminUserId: string, userId: string, trainerId: string): Promise<User> {
    return this.update(adminUserId, userId, { trainerId });
  }

  async updateStatus(adminUserId: string, userId: string, status: UserStatus): Promise<User> {
    return this.update(adminUserId, userId, { status });
  }
}
