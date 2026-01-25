import {
  Injectable,
  ConflictException,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';
import { TenantService } from '../tenant/tenant.service';
import { MemberRegistrationDto } from './dto/member-registration.dto';
import * as bcrypt from 'bcrypt';

@Injectable()
export class PublicService {
  private readonly SALT_ROUNDS = 10;

  constructor(
    private readonly prisma: PrismaService,
    private readonly tenantService: TenantService,
  ) {}

  private async hashPassword(password: string): Promise<string> {
    return bcrypt.hash(password, this.SALT_ROUNDS);
  }

  private async generateUniqueAttendanceCode(gymId: number): Promise<string> {
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

      /* Check which codes already exist in tenant schema */
      const existing = await this.tenantService.executeInTenant(gymId, async (client) => {
        const result = await client.query(
          `SELECT attendance_code FROM users WHERE attendance_code = ANY($1)`,
          [candidates]
        );
        return result.rows.map((r: any) => r.attendance_code);
      });

      const existingCodes = new Set(existing);

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

    /* Check if email already exists in tenant schema */
    const existingClient = await this.tenantService.executeInTenant(dto.gymId, async (client) => {
      const result = await client.query(
        `SELECT id FROM users WHERE email = $1`,
        [dto.email.toLowerCase()]
      );
      return result.rows[0];
    });

    if (existingClient) {
      throw new ConflictException('A user with this email already exists in this gym');
    }

    /* Also check public.users (staff) and system_users */
    const existingStaff = await this.prisma.user.findUnique({
      where: { email: dto.email.toLowerCase() },
    });

    if (existingStaff) {
      throw new ConflictException('This email is already registered as a staff member');
    }

    const existingSystemUser = await this.prisma.systemUser.findUnique({
      where: { email: dto.email.toLowerCase() },
    });

    if (existingSystemUser) {
      throw new ConflictException('This email is already registered');
    }

    /* Generate unique attendance code */
    const attendanceCode = await this.generateUniqueAttendanceCode(dto.gymId);

    /* Create the user in tenant schema as a pending client */
    const user = await this.tenantService.executeInTenant(dto.gymId, async (client) => {
      const result = await client.query(
        `INSERT INTO users (name, email, password_hash, phone, role, status, join_date, attendance_code, created_at, updated_at)
         VALUES ($1, $2, $3, $4, 'client', 'pending', NOW(), $5, NOW(), NOW())
         RETURNING id, name, email, status, created_at`,
        [
          dto.name,
          dto.email.toLowerCase(),
          await this.hashPassword(dto.password),
          dto.phone || null,
          attendanceCode,
        ]
      );
      return result.rows[0];
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
