import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
  UseGuards,
} from '@nestjs/common';
import { AnnouncementsService } from './announcements.service';
import { CreateAnnouncementDto } from './dto/create-announcement.dto';
import { JwtAuthGuard, RolesGuard, PermissionsGuard } from '../auth/guards';
import { Roles, Permissions, CurrentUser } from '../auth/decorators';
import { GymRoles } from '../common/constants';

@Controller('announcements')
@UseGuards(JwtAuthGuard, RolesGuard, PermissionsGuard)
export class AnnouncementsController {
  constructor(private readonly service: AnnouncementsService) {}

  @Post()
  @Roles(GymRoles.ADMIN)
  @Permissions('ANNOUNCEMENT_CREATE')
  create(@Body() dto: CreateAnnouncementDto, @CurrentUser() user: any) {
    return this.service.create(dto, user.userId);
  }

  @Get('gym/:gymId')
  @Permissions('ANNOUNCEMENT_READ')
  findAll(@Param('gymId') gymId: string) {
    return this.service.findAll(gymId);
  }

  @Get(':id')
  @Permissions('ANNOUNCEMENT_READ')
  findOne(@Param('id') id: string) {
    return this.service.findOne(id);
  }

  @Patch(':id')
  @Roles(GymRoles.ADMIN)
  @Permissions('ANNOUNCEMENT_UPDATE')
  update(
    @Param('id') id: string,
    @Body() dto: Partial<CreateAnnouncementDto>,
    @CurrentUser() user: any,
  ) {
    return this.service.update(id, dto, user.userId);
  }

  @Delete(':id')
  @Roles(GymRoles.ADMIN)
  @Permissions('ANNOUNCEMENT_DELETE')
  archive(@Param('id') id: string, @CurrentUser() user: any) {
    return this.service.archive(id, user.userId);
  }
}
