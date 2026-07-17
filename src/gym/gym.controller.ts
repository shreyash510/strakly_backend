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
  Res,
  Request,
  ParseIntPipe,
  BadRequestException,
} from '@nestjs/common';
import type { Response } from 'express';
import {
  ApiTags,
  ApiOperation,
  ApiBearerAuth,
  ApiQuery,
} from '@nestjs/swagger';
import { GymService } from './gym.service';
import { CreateGymDto, UpdateGymDto, BulkForceDeleteGymDto } from './dto/gym.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { setPaginationHeaders } from '../common/pagination.util';
import { NotificationsGateway } from '../notifications/notifications.gateway';
import type { AuthenticatedRequest } from '../common/types';

@ApiTags('gyms')
@Controller('gyms')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('superadmin', 'admin')
@ApiBearerAuth()
export class GymController {
  constructor(
    private readonly gymService: GymService,
    private readonly notificationsGateway: NotificationsGateway,
  ) {}

  @Get('profile')
  @Roles('superadmin', 'admin', 'manager', 'trainer')
  @ApiOperation({ summary: 'Get current user gym profile with branch details' })
  async getProfile(@Request() req: AuthenticatedRequest) {
    const gymId = req.user?.gymId;
    if (!gymId) {
      throw new BadRequestException('No gym associated with this user');
    }
    return this.gymService.getProfile(gymId);
  }

  @Get()
  @ApiOperation({
    summary: 'Get all gyms with optional filters and pagination',
  })
  @ApiQuery({
    name: 'page',
    required: false,
    type: Number,
    description: 'Page number (default: 1)',
  })
  @ApiQuery({
    name: 'limit',
    required: false,
    type: Number,
    description: 'Items per page (default: 10, max: 100)',
  })
  @ApiQuery({
    name: 'search',
    required: false,
    type: String,
    description: 'Search by name, email, phone, or city',
  })
  @ApiQuery({
    name: 'status',
    required: false,
    type: String,
    description: 'Filter by status (active/inactive)',
  })
  @ApiQuery({
    name: 'includeInactive',
    required: false,
    type: Boolean,
    description: 'Include inactive gyms',
  })
  @ApiQuery({
    name: 'noPagination',
    required: false,
    type: Boolean,
    description: 'Disable pagination',
  })
  async findAll(
    @Request() req: AuthenticatedRequest,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
    @Query('search') search?: string,
    @Query('status') status?: string,
    @Query('includeInactive') includeInactive?: string,
    @Query('noPagination') noPagination?: string,
    @Res({ passthrough: true }) res?: Response,
  ) {
    /* Superadmin can see all gyms, others only see their own gym */
    const gymId = req.user.role === 'superadmin' ? undefined : req.user.gymId ?? undefined;

    const result = await this.gymService.findAll({
      page: page ? parseInt(page) : undefined,
      limit: limit ? parseInt(limit) : undefined,
      search,
      status,
      includeInactive: includeInactive === 'true',
      noPagination: noPagination === 'true',
      gymId,
    });

    if (res && result.pagination) {
      setPaginationHeaders(res, result.pagination);
    }

    return result.data;
  }

  // ---- Onboarding Tour (must be before :id routes) ----

  @Get('onboarding-tour/status')
  @ApiOperation({ summary: 'Get onboarding tour status for current gym' })
  async getOnboardingTourStatus(@Request() req: AuthenticatedRequest) {
    const gymId = req.user?.gymId;
    if (!gymId) {
      throw new BadRequestException('No gym associated with this user');
    }
    return this.gymService.getOnboardingTourStatus(gymId);
  }

  @Patch('onboarding-tour/complete')
  @ApiOperation({ summary: 'Mark onboarding tour as completed' })
  async completeOnboardingTour(@Request() req: AuthenticatedRequest) {
    const gymId = req.user?.gymId;
    if (!gymId) {
      throw new BadRequestException('No gym associated with this user');
    }
    return this.gymService.completeOnboardingTour(gymId);
  }

  @Patch('onboarding-tour/skip')
  @ApiOperation({ summary: 'Mark onboarding tour as skipped' })
  async skipOnboardingTour(@Request() req: AuthenticatedRequest) {
    const gymId = req.user?.gymId;
    if (!gymId) {
      throw new BadRequestException('No gym associated with this user');
    }
    return this.gymService.skipOnboardingTour(gymId);
  }

  @Get(':id')
  @Roles('superadmin', 'admin', 'trainer', 'manager')
  @ApiOperation({ summary: 'Get gym by ID' })
  findOne(@Param('id', ParseIntPipe) id: number, @Request() req: AuthenticatedRequest) {
    return this.gymService.findOne(id, req.user);
  }

  @Post()
  @ApiOperation({ summary: 'Create a new gym' })
  async create(@Body() dto: CreateGymDto) {
    return this.gymService.create(dto);
  }

  @Patch(':id')
  @Roles('superadmin', 'admin')
  @ApiOperation({ summary: 'Update a gym' })
  async update(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateGymDto,
    @Request() req: AuthenticatedRequest,
  ) {
    const result = await this.gymService.update(id, dto, req.user);
    this.notificationsGateway.emitGymChanged(id, { action: 'updated' });
    return result;
  }

  /* Must stay above the ':id' routes — otherwise 'me' is parsed as an id. */
  @Delete('me/force')
  @Roles('admin')
  @ApiOperation({
    summary:
      'Permanently delete your own gym, all its data and your account (admin only). Irreversible.',
  })
  async forceRemoveOwn(@Request() req: AuthenticatedRequest) {
    const gymId = req.user.gymId;
    const result = await this.gymService.forceRemoveOwn(req.user);
    if (gymId) {
      this.notificationsGateway.emitGymChanged(gymId, { action: 'deleted' });
    }
    return result;
  }

  @Delete(':id/force')
  @Roles('superadmin')
  @ApiOperation({ summary: 'Force delete a gym and ALL associated data (superadmin only)' })
  async forceRemove(@Param('id', ParseIntPipe) id: number) {
    const result = await this.gymService.forceRemove(id);
    this.notificationsGateway.emitGymChanged(id, { action: 'deleted' });
    return result;
  }

  @Post('bulk-force-delete')
  @Roles('superadmin')
  @ApiOperation({ summary: 'Force delete multiple gyms and ALL associated data (superadmin only, max 50 per call)' })
  async bulkForceRemove(@Body() dto: BulkForceDeleteGymDto) {
    const result = await this.gymService.forceRemoveBulk(dto.ids);
    for (const r of result.results) {
      if (r.status === 'success') {
        this.notificationsGateway.emitGymChanged(r.id, { action: 'deleted' });
      }
    }
    return result;
  }

  @Delete(':id')
  @Roles('superadmin', 'admin')
  @ApiOperation({ summary: 'Delete a gym' })
  async remove(@Param('id', ParseIntPipe) id: number, @Request() req: AuthenticatedRequest) {
    const result = await this.gymService.remove(id, req.user);
    this.notificationsGateway.emitGymChanged(id, { action: 'deleted' });
    return result;
  }

  @Post(':id/toggle-status')
  @Roles('superadmin', 'admin')
  @ApiOperation({ summary: 'Toggle gym active status' })
  async toggleStatus(@Param('id', ParseIntPipe) id: number, @Request() req: AuthenticatedRequest) {
    const result = await this.gymService.toggleStatus(id, req.user);
    this.notificationsGateway.emitGymChanged(id, { action: 'status_changed' });
    return result;
  }

}
