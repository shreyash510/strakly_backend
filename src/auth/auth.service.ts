import {
  Injectable,
  UnauthorizedException,
  ConflictException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { PrismaService } from '../database/prisma.service';
import { CreateUserDto } from './dto/create-user.dto';
import { LoginDto } from './dto/login.dto';
import * as bcrypt from 'bcrypt';

export interface UserResponse {
  id: string;
  name: string;
  email: string;
  role?: string;
  avatar?: string;
  status?: string;
  phone?: string;
  attendanceCode?: string;
  createdAt?: Date;
  updatedAt?: Date;
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
    private readonly prisma: PrismaService,
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

  private toUserResponse(user: any): UserResponse {
    return {
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role || 'user',
      avatar: user.avatar,
      status: user.status || 'active',
      phone: user.phone,
      attendanceCode: user.attendanceCode,
      createdAt: user.createdAt,
      updatedAt: user.updatedAt,
    };
  }

  async register(createUserDto: CreateUserDto): Promise<AuthResponse> {
    // Check if user already exists
    const existingUser = await this.prisma.user.findUnique({
      where: { email: createUserDto.email },
    });

    if (existingUser) {
      throw new ConflictException('User with this email already exists');
    }

    const createdUser = await this.prisma.user.create({
      data: {
        name: createUserDto.name,
        email: createUserDto.email,
        passwordHash: await this.hashPassword(createUserDto.password),
        role: 'user',
        status: 'active',
        joinDate: new Date().toISOString().split('T')[0],
      },
    });

    const user = this.toUserResponse(createdUser);
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
    const userData = await this.prisma.user.findUnique({
      where: { email: loginDto.email },
    });

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
    await this.prisma.user.update({
      where: { id: userData.id },
      data: { lastLoginAt: new Date().toISOString() },
    });

    const user = this.toUserResponse(userData);
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
    const userData = await this.prisma.user.findUnique({
      where: { id: userId },
    });

    if (!userData) {
      throw new UnauthorizedException('User not found');
    }

    return this.toUserResponse(userData);
  }

  async updateProfile(
    userId: string,
    data: { name?: string; bio?: string; avatar?: string; phone?: string },
  ): Promise<UserResponse> {
    const userData = await this.prisma.user.update({
      where: { id: userId },
      data,
    });

    return this.toUserResponse(userData);
  }

  async changePassword(
    userId: string,
    currentPassword: string,
    newPassword: string,
  ): Promise<{ success: boolean }> {
    const userData = await this.prisma.user.findUnique({
      where: { id: userId },
    });

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
    await this.prisma.user.update({
      where: { id: userId },
      data: { passwordHash: await this.hashPassword(newPassword) },
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

    const skip = (page - 1) * limit;

    const [users, total] = await Promise.all([
      this.prisma.user.findMany({
        where: {
          AND: [
            { id: { not: currentUserId } },
            {
              OR: [
                { name: { contains: query, mode: 'insensitive' } },
                { email: { contains: query, mode: 'insensitive' } },
              ],
            },
          ],
        },
        skip,
        take: limit,
        select: {
          id: true,
          name: true,
          email: true,
          avatar: true,
          role: true,
        },
      }),
      this.prisma.user.count({
        where: {
          AND: [
            { id: { not: currentUserId } },
            {
              OR: [
                { name: { contains: query, mode: 'insensitive' } },
                { email: { contains: query, mode: 'insensitive' } },
              ],
            },
          ],
        },
      }),
    ]);

    return {
      users: users.map((user) => ({
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role || 'user',
        avatar: user.avatar ?? undefined,
      })),
      hasMore: skip + users.length < total,
      page,
      total,
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
