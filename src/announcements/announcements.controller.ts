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
  ParseIntPipe,
  Req,
} from '@nestjs/common';
import { AnnouncementsService } from './announcements.service';
import {
  CreateAnnouncementDto,
  UpdateAnnouncementDto,
  AnnouncementFiltersDto,
} from './dto/announcement.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { ManagerPermissionsGuard } from '../auth/guards/manager-permissions.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { ManagerPermission } from '../auth/decorators/manager-permission.decorator';
import { GymId } from '../common/decorators/gym-id.decorator';
import { UserId } from '../common/decorators/user-id.decorator';
import { NotificationsGateway } from '../notifications/notifications.gateway';
import type { AuthenticatedRequest } from '../common/types';
import { resolveEffectiveBranchId } from '../common';

@Controller('announcements')
@UseGuards(JwtAuthGuard, RolesGuard, ManagerPermissionsGuard)
@Roles('superadmin', 'admin', 'manager')
export class AnnouncementsController {
  constructor(
    private readonly announcementsService: AnnouncementsService,
    private readonly notificationsGateway: NotificationsGateway,
  ) {}

  @Get()
  async findAll(
    @GymId() gymId: number,
    @Query() filters: AnnouncementFiltersDto,
  ) {
    return this.announcementsService.findAll(gymId, filters);
  }

  @Get('active')
  async getActive(
    @Req() req: AuthenticatedRequest,
    @GymId() gymId: number,
    @Query('platform') platform?: 'dashboard' | 'mobile',
    @Query('branchId') branchId?: string,
  ) {
    return this.announcementsService.getActive(
      gymId,
      platform || 'dashboard',
      resolveEffectiveBranchId(req.user, branchId) ?? undefined,
    );
  }

  @Get(':id')
  async findOne(
    @Param('id', ParseIntPipe) id: number,
    @GymId() gymId: number,
  ) {
    return this.announcementsService.findOne(id, gymId);
  }

  @Post()
  @ManagerPermission('announcements', 'create')
  async create(
    @Body() dto: CreateAnnouncementDto,
    @GymId() gymId: number,
    @UserId() userId: number,
  ) {
    const result = await this.announcementsService.create(dto, gymId, userId);
    this.notificationsGateway.emitAnnouncementChanged(gymId, { action: 'created' });
    return result;
  }

  @Patch(':id')
  @ManagerPermission('announcements', 'update')
  async update(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateAnnouncementDto,
    @GymId() gymId: number,
  ) {
    const result = await this.announcementsService.update(id, gymId, dto);
    this.notificationsGateway.emitAnnouncementChanged(gymId, { action: 'updated' });
    return result;
  }

  @Patch(':id/toggle-pin')
  @ManagerPermission('announcements', 'update')
  async togglePin(
    @Param('id', ParseIntPipe) id: number,
    @GymId() gymId: number,
  ) {
    const result = await this.announcementsService.togglePin(id, gymId);
    this.notificationsGateway.emitAnnouncementChanged(gymId, { action: 'updated' });
    return result;
  }

  @Delete(':id')
  @ManagerPermission('announcements', 'delete')
  async delete(@Param('id', ParseIntPipe) id: number, @GymId() gymId: number) {
    const result = await this.announcementsService.delete(id, gymId);
    this.notificationsGateway.emitAnnouncementChanged(gymId, { action: 'deleted' });
    return result;
  }
}
