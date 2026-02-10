import {
  Controller,
  Post,
  UseInterceptors,
  UploadedFile,
  Body,
  UseGuards,
  Request,
  BadRequestException,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { UploadService } from './upload.service';
import { UsersService } from '../users/users.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import type { AuthenticatedRequest } from '../common/types';

@Controller('upload')
@UseGuards(JwtAuthGuard)
export class UploadController {
  constructor(
    private readonly uploadService: UploadService,
    private readonly usersService: UsersService,
  ) {}

  /**
   * Upload avatar image
   * POST /upload/avatar
   *
   * Body (multipart/form-data):
   * - file: Image file (max 5MB)
   * - userId: Optional user ID (for admin uploading on behalf of user)
   * - oldUrl: Optional old avatar URL to delete
   */
  @Post('avatar')
  @UseInterceptors(
    FileInterceptor('file', {
      limits: {
        fileSize: 5 * 1024 * 1024, // 5MB max input
      },
      fileFilter: (req, file, callback) => {
        if (!file.mimetype.startsWith('image/')) {
          return callback(new BadRequestException('Only image files are allowed'), false);
        }
        callback(null, true);
      },
    }),
  )
  async uploadAvatar(
    @UploadedFile() file: Express.Multer.File,
    @Body('userId') userId: string,
    @Body('oldUrl') oldUrl: string,
    @Request() req: AuthenticatedRequest,
  ) {
    if (!file) {
      throw new BadRequestException('No file uploaded');
    }

    // Use provided userId or current user's ID
    const targetUserId = userId || req.user?.userId;
    const gymId = req.user?.gymId;
    const userRole = req.user?.role;

    if (!targetUserId) {
      throw new BadRequestException('User ID is required');
    }

    const result = await this.uploadService.uploadAvatar(file, targetUserId, oldUrl);

    // Update user's avatar in database
    // Determine user type based on role (normalize to lowercase for comparison)
    const normalizedRole = userRole?.toLowerCase();
    const isSuperadmin = normalizedRole === 'superadmin';
    const isAdmin = normalizedRole === 'admin';
    const isTenantUser = ['manager', 'trainer', 'branch_admin', 'client'].includes(normalizedRole);

    // For tenant users (staff/client), gymId is required
    if (isTenantUser && !gymId) {
      throw new BadRequestException('Gym ID is required for staff and client users');
    }

    // For admin users, gymId is also required
    if (isAdmin && !gymId) {
      throw new BadRequestException('Gym ID is required to update profile');
    }

    // If no recognized role and no gymId, we can't update the profile
    // Exception: superadmins don't need gym context
    if (!isSuperadmin && !isAdmin && !isTenantUser && !gymId) {
      throw new BadRequestException('Unable to update profile: missing gym context');
    }

    // Update profile
    try {
      if (isSuperadmin && !userId) {
        // For superadmin updating their own profile, update directly in public.users table
        await this.usersService.updateSuperadminProfile(
          parseInt(String(targetUserId)),
          { avatar: result.url },
        );
      } else if (gymId) {
        // When uploading for another user (userId provided), let auto-detection find the user
        // Only pass 'admin' when the user is updating their OWN profile AND they are an admin
        const isUpdatingSelf = !userId || userId === String(req.user?.userId);
        const userTypeHint = (isUpdatingSelf && isAdmin) ? 'admin' : undefined;

        await this.usersService.update(
          parseInt(String(targetUserId)),
          gymId,
          { avatar: result.url },
          userTypeHint, // Let auto-detection work when uploading for others
        );
      }
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : String(error);
      throw new BadRequestException(`Avatar uploaded but failed to update profile: ${msg}`);
    }

    return {
      success: true,
      url: result.url,
      size: result.size,
      message: 'Avatar uploaded successfully',
    };
  }

  /**
   * Upload gym logo
   * POST /upload/gym-logo
   *
   * Body (multipart/form-data):
   * - file: Image file (max 5MB)
   * - gymId: Gym ID
   * - oldUrl: Optional old logo URL to delete
   */
  @Post('gym-logo')
  @UseInterceptors(
    FileInterceptor('file', {
      limits: {
        fileSize: 5 * 1024 * 1024, // 5MB max input
      },
      fileFilter: (req, file, callback) => {
        if (!file.mimetype.startsWith('image/')) {
          return callback(new BadRequestException('Only image files are allowed'), false);
        }
        callback(null, true);
      },
    }),
  )
  async uploadGymLogo(
    @UploadedFile() file: Express.Multer.File,
    @Body('gymId') gymId: string,
    @Body('oldUrl') oldUrl: string,
  ) {
    if (!file) {
      throw new BadRequestException('No file uploaded');
    }

    if (!gymId) {
      throw new BadRequestException('Gym ID is required');
    }

    const result = await this.uploadService.uploadGymLogo(file, gymId, oldUrl);

    return {
      success: true,
      url: result.url,
      size: result.size,
      message: 'Gym logo uploaded successfully',
    };
  }
}
