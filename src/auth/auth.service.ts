import {
  Injectable,
  UnauthorizedException,
  ConflictException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { DatabaseService } from '../database/database.service';
import { CreateUserDto } from './dto/create-user.dto';
import { LoginDto } from './dto/login.dto';
import * as bcrypt from 'bcrypt';

export interface User {
  id: string;
  name: string;
  email: string;
  passwordHash: string;
  role?: string;
  status?: string;
  avatar?: string;
  createdAt: string;
  updatedAt: string;
}

export interface UserResponse {
  id: string;
  name: string;
  email: string;
  role?: string;
  avatar?: string;
  status?: string;
  createdAt?: string;
  updatedAt?: string;
}

export interface AuthResponse {
  user: UserResponse;
  accessToken: string;
  tokens?: {
    accessToken: string;
    refreshToken?: string;
    expiresIn: number;
    tokenType: string;
  };
}

@Injectable()
export class AuthService {
  private readonly SALT_ROUNDS = 10;

  constructor(
    private readonly databaseService: DatabaseService,
    private readonly jwtService: JwtService,
  ) {}

  private async hashPassword(password: string): Promise<string> {
    return bcrypt.hash(password, this.SALT_ROUNDS);
  }

  private async comparePassword(password: string, hash: string): Promise<boolean> {
    return bcrypt.compare(password, hash);
  }

  private generateToken(user: UserResponse): string {
    const payload = {
      sub: user.id,
      email: user.email,
      name: user.name,
      role: user.role || 'user',
    };
    return this.jwtService.sign(payload);
  }

  async register(createUserDto: CreateUserDto): Promise<AuthResponse> {
    // Check if user already exists
    const existingUser = await this.databaseService.findUserByEmail(createUserDto.email);

    if (existingUser) {
      throw new ConflictException('User with this email already exists');
    }

    const userData = {
      name: createUserDto.name,
      email: createUserDto.email,
      passwordHash: await this.hashPassword(createUserDto.password),
      role: 'user',
      status: 'active',
      joinDate: new Date().toISOString().split('T')[0],
    };

    const createdUser = await this.databaseService.createUser(userData);

    const user: UserResponse = {
      id: createdUser.id,
      name: createdUser.name,
      email: createdUser.email,
      role: createdUser.role || 'user',
      avatar: createdUser.avatar,
      status: createdUser.status || 'active',
      createdAt: createdUser.createdAt,
      updatedAt: createdUser.updatedAt,
    };

    const accessToken = this.generateToken(user);

    return {
      user,
      accessToken,
      tokens: {
        accessToken,
        expiresIn: 604800, // 7 days in seconds
        tokenType: 'Bearer',
      },
    };
  }

  async login(loginDto: LoginDto): Promise<AuthResponse> {
    const userData = await this.databaseService.findUserByEmail(loginDto.email);

    if (!userData) {
      throw new UnauthorizedException('Invalid credentials');
    }

    // Check if user is suspended
    if (userData.status === 'suspended') {
      throw new UnauthorizedException('Your account has been suspended');
    }

    // Check password with bcrypt
    const isPasswordValid = await this.comparePassword(
      loginDto.password,
      userData.passwordHash,
    );

    if (!isPasswordValid) {
      throw new UnauthorizedException('Invalid credentials');
    }

    // Update last login time
    await this.databaseService.updateUser(userData.id, {
      lastLoginAt: new Date().toISOString(),
    });

    const user: UserResponse = {
      id: userData.id,
      name: userData.name,
      email: userData.email,
      role: userData.role || 'user',
      avatar: userData.avatar,
      status: userData.status || 'active',
      createdAt: userData.createdAt,
      updatedAt: userData.updatedAt,
    };

    const accessToken = this.generateToken(user);

    return {
      user,
      accessToken,
      tokens: {
        accessToken,
        expiresIn: 604800, // 7 days in seconds
        tokenType: 'Bearer',
      },
    };
  }

  async getProfile(userId: string): Promise<UserResponse> {
    const userData = await this.databaseService.findUserById(userId);

    if (!userData) {
      throw new UnauthorizedException('User not found');
    }

    return {
      id: userData.id,
      name: userData.name,
      email: userData.email,
      role: userData.role || 'user',
      avatar: userData.avatar,
      status: userData.status || 'active',
      createdAt: userData.createdAt,
      updatedAt: userData.updatedAt,
    };
  }

  async updateProfile(
    userId: string,
    data: { name?: string; bio?: string; avatar?: string; phone?: string },
  ): Promise<UserResponse> {
    const userData = await this.databaseService.updateUser(userId, data);

    return {
      id: userData.id,
      name: userData.name,
      email: userData.email,
      role: userData.role || 'user',
      avatar: userData.avatar,
      status: userData.status || 'active',
      createdAt: userData.createdAt,
      updatedAt: userData.updatedAt,
    };
  }

  async changePassword(
    userId: string,
    currentPassword: string,
    newPassword: string,
  ): Promise<{ success: boolean }> {
    const userData = await this.databaseService.findUserById(userId);

    if (!userData) {
      throw new UnauthorizedException('User not found');
    }

    // Verify current password
    const isPasswordValid = await this.comparePassword(
      currentPassword,
      userData.passwordHash,
    );

    if (!isPasswordValid) {
      throw new UnauthorizedException('Current password is incorrect');
    }

    // Update password
    await this.databaseService.updateUser(userId, {
      passwordHash: await this.hashPassword(newPassword),
    });

    return { success: true };
  }

  async refreshToken(userId: string): Promise<{ accessToken: string }> {
    const user = await this.getProfile(userId);
    return {
      accessToken: this.generateToken(user),
    };
  }

  async searchUsers(
    query: string,
    currentUserId: string,
    page: number = 1,
    limit: number = 20,
  ): Promise<{ users: UserResponse[]; hasMore: boolean; page: number; total?: number }> {
    if (!query || query.length < 2) {
      return { users: [], hasMore: false, page: 1 };
    }
    const result = await this.databaseService.searchUsers(query, currentUserId, page, limit);
    return {
      users: result.users.map((user) => ({
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role || 'user',
        avatar: user.avatar,
      })),
      hasMore: result.hasMore,
      page: result.page,
      total: result.total,
    };
  }

  async logout(userId: string): Promise<{ success: boolean }> {
    // In a production environment, you might want to:
    // - Invalidate the token in a blacklist
    // - Remove refresh tokens from database
    // For now, we just return success as JWT tokens are stateless
    return { success: true };
  }
}
