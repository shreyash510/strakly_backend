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
} from '@nestjs/common';
import { AnnouncementsService } from './announcements.service';
import {
  CreateAnnouncementDto,
  UpdateAnnouncementDto,
  AnnouncementFiltersDto,
} from './dto/announcement.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { PlanFeaturesGuard } from '../auth/guards/plan-features.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { PlanFeatures } from '../auth/decorators/plan-features.decorator';
import { PLAN_FEATURES } from '../common/constants/features';
import { GymId } from '../common/decorators/gym-id.decorator';
import { OptionalBranchId } from '../common/decorators/branch-id.decorator';
import { UserId } from '../common/decorators/user-id.decorator';

@Controller('announcements')
@UseGuards(JwtAuthGuard, RolesGuard, PlanFeaturesGuard)
@Roles('superadmin', 'admin', 'branch_admin', 'manager')
@PlanFeatures(PLAN_FEATURES.ANNOUNCEMENTS)
export class AnnouncementsController {
  constructor(private readonly announcementsService: AnnouncementsService) {}

  @Get()
  async findAll(
    @GymId() gymId: number,
    @OptionalBranchId() branchId: number | null,
    @Query() filters: AnnouncementFiltersDto,
  ) {
    return this.announcementsService.findAll(gymId, branchId, filters);
  }

  @Get('active')
  async getActive(
    @GymId() gymId: number,
    @OptionalBranchId() branchId: number | null,
    @Query('platform') platform?: 'dashboard' | 'mobile',
  ) {
    return this.announcementsService.getActive(
      gymId,
      branchId,
      platform || 'dashboard',
    );
  }

  @Get(':id')
  async findOne(
    @Param('id', ParseIntPipe) id: number,
    @GymId() gymId: number,
    @OptionalBranchId() branchId: number | null,
  ) {
    return this.announcementsService.findOne(id, gymId, branchId);
  }

  @Post()
  async create(
    @Body() dto: CreateAnnouncementDto,
    @GymId() gymId: number,
    @UserId() userId: number,
  ) {
    return this.announcementsService.create(dto, gymId, userId);
  }

  @Patch(':id')
  async update(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateAnnouncementDto,
    @GymId() gymId: number,
  ) {
    return this.announcementsService.update(id, gymId, dto);
  }

  @Patch(':id/toggle-pin')
  async togglePin(
    @Param('id', ParseIntPipe) id: number,
    @GymId() gymId: number,
  ) {
    return this.announcementsService.togglePin(id, gymId);
  }

  @Delete(':id')
  async delete(@Param('id', ParseIntPipe) id: number, @GymId() gymId: number) {
    return this.announcementsService.delete(id, gymId);
  }
}
