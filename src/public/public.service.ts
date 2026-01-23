import {
  Injectable,
  ConflictException,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';
import { MemberRegistrationDto } from './dto/member-registration.dto';
import * as bcrypt from 'bcrypt';

@Injectable()
export class PublicService {
  private readonly SALT_ROUNDS = 10;

  constructor(private readonly prisma: PrismaService) {}

  private async hashPassword(password: string): Promise<string> {
    return bcrypt.hash(password, this.SALT_ROUNDS);
  }

  private async generateUniqueAttendanceCode(): Promise<string> {
    /* Generate batch of candidate codes and check in single query for efficiency */
    const batchSize = 10;
    const maxAttempts = 5;

    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      /* Generate batch of random 4-digit codes */
      const candidates: string[] = [];
      for (let i = 0; i < batchSize; i++) {
        const code = String(Math.floor(1000 + Math.random() * 9000));
        candidates.push(code);
      }

      /* Check which codes already exist in single query */
      const existing = await this.prisma.user.findMany({
        where: { attendanceCode: { in: candidates } },
        select: { attendanceCode: true },
      });

      const existingCodes = new Set(existing.map((u) => u.attendanceCode));

      /* Return first available code */
      for (const code of candidates) {
        if (!existingCodes.has(code)) {
          return code;
        }
      }
    }

    /* Fallback: generate 6-digit code if 4-digit space is exhausted */
    return String(Math.floor(100000 + Math.random() * 900000));
  }

  async registerMember(dto: MemberRegistrationDto) {
    /* Validate gym exists and is active */
    const gym = await this.prisma.gym.findUnique({
      where: { id: dto.gymId },
    });

    if (!gym) {
      throw new NotFoundException('Gym not found');
    }

    if (!gym.isActive) {
      throw new BadRequestException('This gym is not accepting new registrations');
    }

    /* Check if email already exists */
    const existingUser = await this.prisma.user.findUnique({
      where: { email: dto.email.toLowerCase() },
    });

    if (existingUser) {
      throw new ConflictException('A user with this email already exists');
    }

    /* Find the 'client' role from Lookup table */
    const memberRole = await this.prisma.lookup.findFirst({
      where: {
        lookupType: { code: 'USER_ROLE' },
        code: 'client',
      },
    });

    if (!memberRole) {
      throw new Error('Default member role not found in lookup table');
    }

    /* Generate unique attendance code */
    const attendanceCode = await this.generateUniqueAttendanceCode();

    /* Create the user with pending status */
    const user = await this.prisma.user.create({
      data: {
        name: dto.name,
        email: dto.email.toLowerCase(),
        passwordHash: await this.hashPassword(dto.password),
        phone: dto.phone || null,
        roleId: memberRole.id,
        gymId: dto.gymId,
        status: 'pending',
        joinDate: new Date(),
        attendanceCode,
      },
      select: {
        id: true,
        name: true,
        email: true,
        status: true,
        createdAt: true,
      },
    });

    return {
      success: true,
      message: 'Registration submitted successfully. Please wait for admin approval.',
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
      },
    };
  }

  /* Get gym info for public registration page */
  async getGymInfo(gymId: number) {
    const gym = await this.prisma.gym.findUnique({
      where: { id: gymId },
      select: {
        id: true,
        name: true,
        logo: true,
        city: true,
        state: true,
        isActive: true,
      },
    });

    if (!gym) {
      throw new NotFoundException('Gym not found');
    }

    if (!gym.isActive) {
      throw new BadRequestException('This gym is not accepting new registrations');
    }

    return gym;
  }
}
