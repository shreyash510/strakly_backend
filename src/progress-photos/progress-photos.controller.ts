import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  Query,
  UseGuards,
  UseInterceptors,
  UploadedFile,
  ParseIntPipe,
  BadRequestException,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ProgressPhotosService } from './progress-photos.service';
import {
  CreateProgressPhotoDto,
  UpdateProgressPhotoDto,
  PhotoFiltersDto,
} from './dto/progress-photo.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { GymId } from '../common/decorators/gym-id.decorator';
import { UserId, CurrentUserRole } from '../common/decorators/user-id.decorator';
import { ApiTags, ApiBearerAuth, ApiOperation, ApiConsumes } from '@nestjs/swagger';

@ApiTags('progress-photos')
@Controller('progress-photos')
@UseGuards(JwtAuthGuard, RolesGuard)
@ApiBearerAuth()
export class ProgressPhotosController {
  constructor(private readonly progressPhotosService: ProgressPhotosService) {}

  @Post('upload')
  @Roles('admin', 'branch_admin', 'manager', 'trainer')
  @ApiOperation({ summary: 'Upload a progress photo' })
  @ApiConsumes('multipart/form-data')
  @UseInterceptors(
    FileInterceptor('file', {
      limits: { fileSize: 10 * 1024 * 1024 },
      fileFilter: (_req, file, callback) => {
        if (!file.mimetype.match(/^image\/(jpeg|png|webp|gif)$/)) {
          return callback(
            new BadRequestException('Only image files (JPG, PNG, WebP, GIF) are allowed'),
            false,
          );
        }
        callback(null, true);
      },
    }),
  )
  async upload(
    @UploadedFile() file: Express.Multer.File,
    @Body() dto: CreateProgressPhotoDto,
    @GymId() gymId: number,
    @UserId() userId: number,
  ) {
    if (!file) {
      throw new BadRequestException('File is required');
    }
    return this.progressPhotosService.upload(file, gymId, dto, userId);
  }

  @Get('user/:userId')
  @Roles('admin', 'branch_admin', 'manager', 'trainer')
  @ApiOperation({ summary: 'Get progress photos for a user' })
  async findByUser(
    @Param('userId', ParseIntPipe) userId: number,
    @GymId() gymId: number,
    @Query() filters: PhotoFiltersDto,
    @UserId() requesterId: number,
    @CurrentUserRole() requesterRole: string,
  ) {
    return this.progressPhotosService.findByUser(userId, gymId, filters, requesterId, requesterRole);
  }

  @Get('me')
  @ApiOperation({ summary: 'Get my progress photos' })
  async findMyPhotos(
    @UserId() userId: number,
    @GymId() gymId: number,
    @Query() filters: PhotoFiltersDto,
  ) {
    return this.progressPhotosService.findMyPhotos(userId, gymId, filters);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get a progress photo by ID' })
  async findOne(
    @Param('id', ParseIntPipe) id: number,
    @GymId() gymId: number,
    @UserId() requesterId: number,
    @CurrentUserRole() requesterRole: string,
  ) {
    return this.progressPhotosService.findOne(id, gymId, requesterId, requesterRole);
  }

  @Patch(':id')
  @Roles('admin', 'branch_admin', 'manager', 'trainer')
  @ApiOperation({ summary: 'Update progress photo metadata' })
  async update(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateProgressPhotoDto,
    @GymId() gymId: number,
  ) {
    return this.progressPhotosService.update(id, gymId, dto);
  }

  @Delete(':id')
  @Roles('admin', 'branch_admin', 'manager')
  @ApiOperation({ summary: 'Soft delete a progress photo' })
  async remove(
    @Param('id', ParseIntPipe) id: number,
    @GymId() gymId: number,
  ) {
    return this.progressPhotosService.softDelete(id, gymId);
  }
}
