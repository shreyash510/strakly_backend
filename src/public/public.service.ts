import {
  Injectable,
  Logger,
  ConflictException,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';
import { TenantService } from '../tenant/tenant.service';
import { UploadService } from '../upload/upload.service';
import { NotificationHelperService } from '../notifications/notification-helper.service';
import { MemberRegistrationDto } from './dto/member-registration.dto';
import { hashPassword, generateUniqueAttendanceCode } from '../common/utils';
import { NotificationType } from '../notifications/notification-types';
import { randomBytes } from 'crypto';

@Injectable()
export class PublicService {
  private readonly logger = new Logger(PublicService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly tenantService: TenantService,
    private readonly uploadService: UploadService,
    private readonly notificationHelper: NotificationHelperService,
  ) {}

  async registerMember(dto: MemberRegistrationDto) {
    /* Validate gym exists and is active */
    const gym = await this.prisma.gym.findUnique({
      where: { id: dto.gymId },
    });

    if (!gym) {
      throw new NotFoundException('Gym not found');
    }

    if (!gym.isActive) {
      throw new BadRequestException(
        'This gym is not accepting new registrations',
      );
    }

    /* Check if email already exists in tenant schema */
    const existingClient = await this.tenantService.executeInTenant(
      dto.gymId,
      async (client) => {
        const result = await client.query(
          `SELECT id FROM users WHERE email = $1`,
          [dto.email.toLowerCase()],
        );
        return result.rows[0];
      },
    );

    if (existingClient) {
      throw new ConflictException(
        'A user with this email already exists in this gym',
      );
    }

    /* Also check public.users (staff) and system_users */
    const existingStaff = await this.prisma.user.findUnique({
      where: { email: dto.email.toLowerCase() },
    });

    if (existingStaff) {
      throw new ConflictException(
        'This email is already registered as a staff member',
      );
    }

    const existingSystemUser = await this.prisma.systemUser.findUnique({
      where: { email: dto.email.toLowerCase() },
    });

    if (existingSystemUser) {
      throw new ConflictException('This email is already registered');
    }

    /* Generate unique attendance code */
    const attendanceCode = await generateUniqueAttendanceCode(
      dto.gymId,
      this.tenantService,
    );

    /* Validate branch if provided */
    if (dto.branchId) {
      const branchExists = await this.tenantService.executeInTenant(
        dto.gymId,
        async (client) => {
          const result = await client.query(
            `SELECT id FROM branches WHERE id = $1 AND is_active = true`,
            [dto.branchId],
          );
          return result.rows[0];
        },
      );

      if (!branchExists) {
        throw new BadRequestException('Invalid branch selected');
      }
    }

    /* Create the user in tenant schema as an onboarding client */
    const user = await this.tenantService.executeInTenant(
      dto.gymId,
      async (client) => {
        const result = await client.query(
          `INSERT INTO users (name, email, password_hash, phone, gender, role, status, join_date, attendance_code, branch_id, created_at, updated_at)
         VALUES ($1, $2, $3, $4, $5, 'client', 'onboarding', COALESCE($6::timestamp, NOW()), $7, $8, NOW(), NOW())
         RETURNING id, name, email, status, created_at`,
          [
            dto.name,
            dto.email.toLowerCase(),
            await hashPassword(dto.password || randomBytes(16).toString('hex')),
            dto.phone,
            dto.gender,
            dto.joinDate || null,
            attendanceCode,
            dto.branchId || null,
          ],
        );
        return result.rows[0];
      },
    );

    /* Handle avatar upload if provided */
    if (dto.avatar) {
      try {
        // Convert base64 to buffer
        const base64Data = dto.avatar.replace(/^data:image\/\w+;base64,/, '');
        const buffer = Buffer.from(base64Data, 'base64');

        // Determine mime type from base64 header
        const mimeMatch = dto.avatar.match(/^data:(image\/\w+);base64,/);
        const mimeType = mimeMatch ? mimeMatch[1] : 'image/jpeg';

        // Create a mock file object for uploadService
        const mockFile = {
          buffer,
          mimetype: mimeType,
          originalname: 'avatar.jpg',
          size: buffer.length,
        } as Express.Multer.File;

        // Upload avatar
        const uploadResult = await this.uploadService.uploadAvatar(
          mockFile,
          user.id,
        );

        // Update user with avatar URL
        await this.tenantService.executeInTenant(dto.gymId, async (client) => {
          await client.query(`UPDATE users SET avatar = $1 WHERE id = $2`, [
            uploadResult.url,
            user.id,
          ]);
        });
      } catch (error) {
        // Avatar upload failed, but user was created - don't fail the registration
        this.logger.error('Failed to upload avatar during registration', error);
      }
    }

    /* Notify admin and branch_admin users about new registration */
    await this.notificationHelper.notifyStaff(
      dto.gymId,
      dto.branchId || null,
      {
        type: NotificationType.NEW_MEMBER_REGISTRATION,
        title: 'New Member Registration',
        message: `${dto.name} has registered and is awaiting approval.`,
        actionUrl: `/clients/${user.id}`,
        data: {
          entityId: user.id,
          entityType: 'user',
          userId: user.id,
          metadata: { name: dto.name, email: dto.email },
        },
      },
    );

    return {
      success: true,
      message:
        'Registration submitted successfully. Please wait for admin approval.',
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
      throw new BadRequestException(
        'This gym is not accepting new registrations',
      );
    }

    return gym;
  }

  /* Get branch info for public registration page */
  async getBranchInfo(gymId: number, branchId: number) {
    const gym = await this.prisma.gym.findUnique({
      where: { id: gymId },
      select: { isActive: true },
    });

    if (!gym) {
      throw new NotFoundException('Gym not found');
    }

    if (!gym.isActive) {
      throw new BadRequestException(
        'This gym is not accepting new registrations',
      );
    }

    const branch = await this.tenantService.executeInTenant(
      gymId,
      async (client) => {
        const result = await client.query(
          `SELECT id, name, address, city, state, phone FROM branches WHERE id = $1 AND is_active = true`,
          [branchId],
        );
        return result.rows[0];
      },
    );

    if (!branch) {
      throw new NotFoundException('Branch not found');
    }

    return branch;
  }
}
