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
} from '@nestjs/common';
import type { Response } from 'express';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiQuery } from '@nestjs/swagger';
import { GymService } from './gym.service';
import { CreateGymDto, UpdateGymDto } from './dto/gym.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { setPaginationHeaders } from '../common/pagination.util';

@ApiTags('gyms')
@Controller('gyms')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('superadmin', 'admin')
@ApiBearerAuth()
export class GymController {
  constructor(private readonly gymService: GymService) {}

  @Get('profile')
  @Roles('superadmin', 'admin', 'branch_admin', 'manager', 'trainer')
  @ApiOperation({ summary: 'Get current user gym profile with branch details' })
  @ApiQuery({ name: 'branchId', required: false, type: Number, description: 'Filter by specific branch' })
  async getProfile(
    @Request() req: any,
    @Query('branchId') branchId?: string,
  ) {
    const gymId = req.user?.gymId;
    if (!gymId) {
      throw new Error('No gym associated with this user');
    }
    const parsedBranchId = branchId ? parseInt(branchId, 10) : null;
    return this.gymService.getProfile(gymId, parsedBranchId);
  }

  @Get()
  @ApiOperation({ summary: 'Get all gyms with optional filters and pagination' })
  @ApiQuery({ name: 'page', required: false, type: Number, description: 'Page number (default: 1)' })
  @ApiQuery({ name: 'limit', required: false, type: Number, description: 'Items per page (default: 10, max: 100)' })
  @ApiQuery({ name: 'search', required: false, type: String, description: 'Search by name, email, phone, or city' })
  @ApiQuery({ name: 'status', required: false, type: String, description: 'Filter by status (active/inactive)' })
  @ApiQuery({ name: 'includeInactive', required: false, type: Boolean, description: 'Include inactive gyms' })
  @ApiQuery({ name: 'noPagination', required: false, type: Boolean, description: 'Disable pagination' })
  async findAll(
    @Request() req: any,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
    @Query('search') search?: string,
    @Query('status') status?: string,
    @Query('includeInactive') includeInactive?: string,
    @Query('noPagination') noPagination?: string,
    @Res({ passthrough: true }) res?: Response,
  ) {
    /* Superadmin can see all gyms, others only see their own gym */
    const gymId = req.user.role === 'superadmin' ? undefined : req.user.gymId;

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

  @Get(':id')
  @Roles('superadmin', 'admin', 'branch_admin', 'trainer', 'manager')
  @ApiOperation({ summary: 'Get gym by ID' })
  findOne(@Param('id', ParseIntPipe) id: number) {
    return this.gymService.findOne(id);
  }

  @Post()
  @ApiOperation({ summary: 'Create a new gym' })
  create(@Body() dto: CreateGymDto) {
    return this.gymService.create(dto);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update a gym' })
  update(@Param('id', ParseIntPipe) id: number, @Body() dto: UpdateGymDto) {
    return this.gymService.update(id, dto);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Delete a gym' })
  remove(@Param('id', ParseIntPipe) id: number) {
    return this.gymService.remove(id);
  }

  @Post(':id/toggle-status')
  @ApiOperation({ summary: 'Toggle gym active status' })
  toggleStatus(@Param('id', ParseIntPipe) id: number) {
    return this.gymService.toggleStatus(id);
  }
}
