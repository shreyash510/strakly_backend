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
    @Request() req: any,
  ) {
    if (!file) {
      throw new BadRequestException('No file uploaded');
    }

    // Use provided userId or current user's ID
    const targetUserId = userId || req.user?.userId || req.user?.id || req.user?.sub;
    const gymId = req.user?.gymId;

    if (!targetUserId) {
      throw new BadRequestException('User ID is required');
    }

    const result = await this.uploadService.uploadAvatar(file, targetUserId, oldUrl);

    // Update user's avatar in database
    if (gymId) {
      try {
        await this.usersService.update(
          parseInt(String(targetUserId)),
          gymId,
          { avatar: result.url },
        );
      } catch (error) {
        console.error('Failed to update user avatar in database:', error);
        // Don't throw - the upload succeeded, just log the DB update failure
      }
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
