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
import { LeadsService } from './leads.service';
import {
  CreateLeadDto,
  UpdateLeadDto,
  UpdateStageDto,
  CreateLeadActivityDto,
  LeadFiltersDto,
  LeadStatsFiltersDto,
} from './dto/lead.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { GymId } from '../common/decorators/gym-id.decorator';
import { UserId } from '../common/decorators/user-id.decorator';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { ManagerPermissionsGuard } from '../auth/guards/manager-permissions.guard';
import { ManagerPermission } from '../auth/decorators/manager-permission.decorator';

@ApiTags('leads')
@Controller('leads')
@UseGuards(JwtAuthGuard, RolesGuard)
@ApiBearerAuth()
export class LeadsController {
  constructor(private readonly leadsService: LeadsService) {}

  @Get()
  @Roles('admin', 'manager')
  @ApiOperation({ summary: 'List leads with filters' })
  async findAll(
    @GymId() gymId: number,
    @Query() filters: LeadFiltersDto,
  ) {
    return this.leadsService.findAll(gymId, filters);
  }

  @Get('sources')
  @Roles('admin', 'manager')
  @ApiOperation({ summary: 'Get lead sources lookup' })
  async getSources(@GymId() gymId: number) {
    return this.leadsService.getSources(gymId);
  }

  @Get('stats')
  @Roles('admin', 'manager')
  @ApiOperation({ summary: 'Get lead pipeline stats' })
  async getStats(
    @GymId() gymId: number,
    @Query() filters: LeadStatsFiltersDto,
  ) {
    return this.leadsService.getStats(gymId, filters);
  }

  @Get(':id/stage-history')
  @Roles('admin', 'manager')
  @ApiOperation({ summary: 'Get stage change history for a lead' })
  async getStageHistory(
    @Param('id', ParseIntPipe) id: number,
    @GymId() gymId: number,
  ) {
    return this.leadsService.getStageHistory(id, gymId);
  }

  @Get(':id')
  @Roles('admin', 'manager')
  @ApiOperation({ summary: 'Get a lead by ID' })
  async findOne(
    @Param('id', ParseIntPipe) id: number,
    @GymId() gymId: number,
  ) {
    return this.leadsService.findOne(id, gymId);
  }

  @Post()
  @Roles('admin', 'manager')
  @UseGuards(ManagerPermissionsGuard)
  @ManagerPermission('leads', 'create')
  @ApiOperation({ summary: 'Create a new lead' })
  async create(
    @Body() dto: CreateLeadDto,
    @GymId() gymId: number,
    @UserId() userId: number,
  ) {
    return this.leadsService.create(gymId, dto, userId);
  }

  @Patch(':id')
  @Roles('admin', 'manager')
  @UseGuards(ManagerPermissionsGuard)
  @ManagerPermission('leads', 'update')
  @ApiOperation({ summary: 'Update a lead' })
  async update(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateLeadDto,
    @GymId() gymId: number,
    @UserId() userId: number,
  ) {
    return this.leadsService.update(id, gymId, dto, userId);
  }

  @Patch(':id/stage')
  @Roles('admin', 'manager')
  @UseGuards(ManagerPermissionsGuard)
  @ManagerPermission('leads', 'update')
  @ApiOperation({ summary: 'Update lead pipeline stage' })
  async updateStage(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateStageDto,
    @GymId() gymId: number,
    @UserId() userId: number,
  ) {
    return this.leadsService.updateStage(id, gymId, dto, userId);
  }

  @Patch(':id/convert')
  @Roles('admin', 'manager')
  @UseGuards(ManagerPermissionsGuard)
  @ManagerPermission('leads', 'update')
  @ApiOperation({ summary: 'Convert lead to user' })
  async convertToUser(
    @Param('id', ParseIntPipe) id: number,
    @GymId() gymId: number,
    @UserId() userId: number,
  ) {
    return this.leadsService.convertToUser(id, gymId, userId);
  }

  @Delete(':id')
  @Roles('admin', 'manager')
  @UseGuards(ManagerPermissionsGuard)
  @ManagerPermission('leads', 'delete')
  @ApiOperation({ summary: 'Soft delete a lead' })
  async remove(
    @Param('id', ParseIntPipe) id: number,
    @GymId() gymId: number,
  ) {
    return this.leadsService.softDelete(id, gymId);
  }

  @Post(':id/activities')
  @Roles('admin', 'manager')
  @UseGuards(ManagerPermissionsGuard)
  @ManagerPermission('leads', 'create')
  @ApiOperation({ summary: 'Add an activity to a lead' })
  async createActivity(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: CreateLeadActivityDto,
    @GymId() gymId: number,
    @UserId() userId: number,
  ) {
    return this.leadsService.createActivity(id, gymId, dto, userId);
  }

  @Get(':id/activities')
  @Roles('admin', 'manager')
  @ApiOperation({ summary: 'Get activities for a lead' })
  async getActivities(
    @Param('id', ParseIntPipe) id: number,
    @GymId() gymId: number,
  ) {
    return this.leadsService.getActivities(id, gymId);
  }
}
