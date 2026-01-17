import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
  Headers,
  UnauthorizedException,
  UseGuards,
  Query,
} from '@nestjs/common';
import { AnnouncementsService } from './announcements.service';
import { CreateAnnouncementDto, UpdateAnnouncementDto } from './dto/create-announcement.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';

@Controller('announcements')
export class AnnouncementsController {
  constructor(private readonly announcementsService: AnnouncementsService) {}

  private getUserId(authHeader: string): string {
    if (!authHeader) {
      throw new UnauthorizedException('User ID header is required');
    }
    return authHeader;
  }

  // Get all announcements for admin
  @Get()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('superadmin', 'admin')
  findAll(@Headers('x-user-id') userId: string) {
    return this.announcementsService.findAll(this.getUserId(userId));
  }

  // Get published announcements (public)
  @Get('published')
  findPublished() {
    return this.announcementsService.findPublished();
  }

  // Get announcements by role
  @Get('role/:role')
  findByRole(@Param('role') role: string) {
    return this.announcementsService.findByRole(role);
  }

  // Get single announcement
  @Get(':id')
  findOne(@Headers('x-user-id') userId: string, @Param('id') id: string) {
    return this.announcementsService.findOne(this.getUserId(userId), id);
  }

  // Create new announcement
  @Post()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('superadmin', 'admin')
  create(
    @Headers('x-user-id') userId: string,
    @Body() createAnnouncementDto: CreateAnnouncementDto,
  ) {
    return this.announcementsService.create(this.getUserId(userId), createAnnouncementDto);
  }

  // Update announcement
  @Patch(':id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('superadmin', 'admin')
  update(
    @Headers('x-user-id') userId: string,
    @Param('id') id: string,
    @Body() updateAnnouncementDto: UpdateAnnouncementDto,
  ) {
    return this.announcementsService.update(this.getUserId(userId), id, updateAnnouncementDto);
  }

  // Publish announcement
  @Patch(':id/publish')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('superadmin', 'admin')
  publish(@Headers('x-user-id') userId: string, @Param('id') id: string) {
    return this.announcementsService.publish(this.getUserId(userId), id);
  }

  // Archive announcement
  @Patch(':id/archive')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('superadmin', 'admin')
  archive(@Headers('x-user-id') userId: string, @Param('id') id: string) {
    return this.announcementsService.archive(this.getUserId(userId), id);
  }

  // Delete announcement
  @Delete(':id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('superadmin', 'admin')
  remove(@Headers('x-user-id') userId: string, @Param('id') id: string) {
    return this.announcementsService.remove(this.getUserId(userId), id);
  }
}
