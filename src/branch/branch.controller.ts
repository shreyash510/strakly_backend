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
  ParseIntPipe,
} from '@nestjs/common';
import type { Response } from 'express';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiQuery, ApiParam } from '@nestjs/swagger';
import { BranchService } from './branch.service';
import { CreateBranchDto, UpdateBranchDto, TransferMemberDto } from './dto/branch.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { setPaginationHeaders } from '../common/pagination.util';

@ApiTags('branches')
@Controller('gyms/:gymId/branches')
@UseGuards(JwtAuthGuard, RolesGuard)
@ApiBearerAuth()
export class BranchController {
  constructor(private readonly branchService: BranchService) {}

  @Get()
  @Roles('superadmin', 'admin', 'manager', 'trainer')
  @ApiOperation({ summary: 'Get all branches for a gym' })
  @ApiParam({ name: 'gymId', description: 'Gym ID' })
  @ApiQuery({ name: 'page', required: false, type: Number, description: 'Page number (default: 1)' })
  @ApiQuery({ name: 'limit', required: false, type: Number, description: 'Items per page (default: 10, max: 100)' })
  @ApiQuery({ name: 'search', required: false, type: String, description: 'Search by name, code, or city' })
  @ApiQuery({ name: 'includeInactive', required: false, type: Boolean, description: 'Include inactive branches' })
  @ApiQuery({ name: 'noPagination', required: false, type: Boolean, description: 'Disable pagination' })
  async findAll(
    @Param('gymId', ParseIntPipe) gymId: number,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
    @Query('search') search?: string,
    @Query('includeInactive') includeInactive?: string,
    @Query('noPagination') noPagination?: string,
    @Res({ passthrough: true }) res?: Response,
  ) {
    const result = await this.branchService.findAll(gymId, {
      page: page ? parseInt(page) : undefined,
      limit: limit ? parseInt(limit) : undefined,
      search,
      includeInactive: includeInactive === 'true',
      noPagination: noPagination === 'true',
    });

    if (res && result.pagination) {
      setPaginationHeaders(res, result.pagination);
    }

    return result.data;
  }

  @Get('limit')
  @Roles('superadmin', 'admin')
  @ApiOperation({ summary: 'Check branch limit for a gym' })
  @ApiParam({ name: 'gymId', description: 'Gym ID' })
  async getBranchLimit(@Param('gymId', ParseIntPipe) gymId: number) {
    return this.branchService.validateBranchLimit(gymId);
  }

  @Get('default')
  @Roles('superadmin', 'admin', 'manager', 'trainer')
  @ApiOperation({ summary: 'Get the default branch for a gym' })
  @ApiParam({ name: 'gymId', description: 'Gym ID' })
  async getDefaultBranch(@Param('gymId', ParseIntPipe) gymId: number) {
    return this.branchService.getDefaultBranch(gymId);
  }

  @Get(':id')
  @Roles('superadmin', 'admin', 'manager', 'trainer')
  @ApiOperation({ summary: 'Get a branch by ID' })
  @ApiParam({ name: 'gymId', description: 'Gym ID' })
  @ApiParam({ name: 'id', description: 'Branch ID' })
  async findOne(
    @Param('gymId', ParseIntPipe) gymId: number,
    @Param('id', ParseIntPipe) id: number,
  ) {
    return this.branchService.findOne(gymId, id);
  }

  @Post()
  @Roles('superadmin', 'admin')
  @ApiOperation({ summary: 'Create a new branch' })
  @ApiParam({ name: 'gymId', description: 'Gym ID' })
  async create(
    @Param('gymId', ParseIntPipe) gymId: number,
    @Body() dto: CreateBranchDto,
  ) {
    return this.branchService.create(gymId, dto);
  }

  @Patch(':id')
  @Roles('superadmin', 'admin')
  @ApiOperation({ summary: 'Update a branch' })
  @ApiParam({ name: 'gymId', description: 'Gym ID' })
  @ApiParam({ name: 'id', description: 'Branch ID' })
  async update(
    @Param('gymId', ParseIntPipe) gymId: number,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateBranchDto,
  ) {
    return this.branchService.update(gymId, id, dto);
  }

  @Delete(':id')
  @Roles('superadmin', 'admin')
  @ApiOperation({ summary: 'Delete a branch' })
  @ApiParam({ name: 'gymId', description: 'Gym ID' })
  @ApiParam({ name: 'id', description: 'Branch ID' })
  async remove(
    @Param('gymId', ParseIntPipe) gymId: number,
    @Param('id', ParseIntPipe) id: number,
  ) {
    return this.branchService.remove(gymId, id);
  }

  @Post(':id/set-default')
  @Roles('superadmin', 'admin')
  @ApiOperation({ summary: 'Set a branch as the default branch' })
  @ApiParam({ name: 'gymId', description: 'Gym ID' })
  @ApiParam({ name: 'id', description: 'Branch ID' })
  async setDefaultBranch(
    @Param('gymId', ParseIntPipe) gymId: number,
    @Param('id', ParseIntPipe) id: number,
  ) {
    return this.branchService.setDefaultBranch(gymId, id);
  }

  @Post('transfer-member')
  @Roles('superadmin', 'admin', 'manager')
  @ApiOperation({ summary: 'Transfer a member from one branch to another' })
  @ApiParam({ name: 'gymId', description: 'Gym ID' })
  async transferMember(
    @Param('gymId', ParseIntPipe) gymId: number,
    @Body() dto: TransferMemberDto,
  ) {
    return this.branchService.transferMember(gymId, dto);
  }

  @Get('member/:memberId/branch')
  @Roles('superadmin', 'admin', 'manager', 'trainer')
  @ApiOperation({ summary: 'Get the current branch of a member' })
  @ApiParam({ name: 'gymId', description: 'Gym ID' })
  @ApiParam({ name: 'memberId', description: 'Member ID' })
  async getMemberBranch(
    @Param('gymId', ParseIntPipe) gymId: number,
    @Param('memberId', ParseIntPipe) memberId: number,
  ) {
    return this.branchService.getMemberBranch(gymId, memberId);
  }
}

// Separate controller for migration (superadmin only)
@ApiTags('branches-migration')
@Controller('branches')
@UseGuards(JwtAuthGuard, RolesGuard)
@ApiBearerAuth()
export class BranchMigrationController {
  constructor(private readonly branchService: BranchService) {}

  @Post('migrate-existing-gyms')
  @Roles('superadmin')
  @ApiOperation({ summary: 'Migrate existing gyms to have default branches (superadmin only)' })
  async migrateExistingGyms() {
    return this.branchService.migrateExistingGyms();
  }
}
