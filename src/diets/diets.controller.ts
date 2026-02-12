import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  Query,
  Headers,
  UseGuards,
  Request,
  BadRequestException,
  ParseIntPipe,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiBearerAuth,
  ApiQuery,
  ApiHeader,
} from '@nestjs/swagger';
import { DietsService } from './diets.service';
import {
  CreateDietDto,
  UpdateDietDto,
  AssignDietDto,
  UpdateDietAssignmentDto,
} from './dto/diet.dto';
import type { AuthenticatedRequest } from '../common/types';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { PlanFeaturesGuard } from '../auth/guards/plan-features.guard';
import { PlanFeatures } from '../auth/decorators/plan-features.decorator';
import { PLAN_FEATURES } from '../common/constants/features';
import { NotificationsGateway } from '../notifications/notifications.gateway';

@ApiTags('diets')
@Controller('diets')
@UseGuards(JwtAuthGuard, PlanFeaturesGuard)
@PlanFeatures(PLAN_FEATURES.DIET_PLANNING)
@ApiBearerAuth()
export class DietsController {
  constructor(
    private readonly dietsService: DietsService,
    private readonly notificationsGateway: NotificationsGateway,
  ) {}

  /**
   * Resolve branchId from request: null = all branches, number = specific branch
   */
  private resolveBranchId(req: AuthenticatedRequest, queryBranchId?: string): number | null {
    if (req.user.role === 'superadmin') {
      return queryBranchId ? parseInt(queryBranchId) : null;
    }
    return queryBranchId
      ? parseInt(queryBranchId)
      : (req.user.branchId ?? null);
  }

  @Get()
  @UseGuards(RolesGuard)
  @Roles('superadmin', 'admin', 'branch_admin', 'manager', 'trainer')
  @ApiOperation({ summary: 'Get all diet plans' })
  @ApiQuery({
    name: 'status',
    required: false,
    description: 'Filter by status',
  })
  @ApiQuery({ name: 'type', required: false, description: 'Filter by type' })
  @ApiQuery({
    name: 'category',
    required: false,
    description: 'Filter by category',
  })
  @ApiQuery({
    name: 'search',
    required: false,
    description: 'Search by title or description',
  })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  @ApiQuery({
    name: 'gymId',
    required: false,
    type: Number,
    description: 'Gym ID (required for superadmin)',
  })
  @ApiQuery({
    name: 'branchId',
    required: false,
    type: Number,
    description: 'Branch ID for filtering',
  })
  findAll(
    @Request() req: AuthenticatedRequest,
    @Query('status') status?: string,
    @Query('type') type?: string,
    @Query('category') category?: string,
    @Query('search') search?: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
    @Query('gymId') queryGymId?: string,
    @Query('branchId') queryBranchId?: string,
  ) {
    const gymId =
      req.user.role === 'superadmin'
        ? queryGymId
          ? parseInt(queryGymId)
          : null
        : req.user.gymId!;

    if (!gymId) {
      throw new BadRequestException('gymId is required');
    }

    const branchId = this.resolveBranchId(req, queryBranchId);

    return this.dietsService.findAll(gymId, {
      status,
      type,
      category,
      search,
      page: page ? parseInt(page) : undefined,
      limit: limit ? parseInt(limit) : undefined,
      branchId,
    });
  }

  @Get(':id')
  @UseGuards(RolesGuard)
  @Roles('superadmin', 'admin', 'branch_admin', 'manager', 'trainer')
  @ApiOperation({ summary: 'Get a diet plan by ID' })
  @ApiQuery({ name: 'gymId', required: false, type: Number })
  findOne(
    @Request() req: AuthenticatedRequest,
    @Param('id', ParseIntPipe) id: number,
    @Query('gymId') queryGymId?: string,
  ) {
    const gymId =
      req.user.role === 'superadmin'
        ? queryGymId
          ? parseInt(queryGymId)
          : null
        : req.user.gymId!;

    if (!gymId) {
      throw new BadRequestException('gymId is required');
    }

    return this.dietsService.findOne(id, gymId);
  }

  @Post()
  @UseGuards(RolesGuard)
  @Roles('admin', 'manager', 'trainer')
  @ApiOperation({ summary: 'Create a new diet plan' })
  async create(@Request() req: AuthenticatedRequest, @Body() dto: CreateDietDto) {
    // Use branchId from request body if provided, otherwise fallback to user's branchId
    const branchId = dto.branchId ?? req.user.branchId ?? null;
    const result = await this.dietsService.create(
      dto,
      req.user.gymId!,
      req.user.userId,
      branchId,
    );
    this.notificationsGateway.emitDietChanged(req.user.gymId!, { action: 'created' });
    return result;
  }

  @Patch(':id')
  @UseGuards(RolesGuard)
  @Roles('admin', 'manager', 'trainer')
  @ApiOperation({ summary: 'Update a diet plan' })
  async update(
    @Request() req: AuthenticatedRequest,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateDietDto,
  ) {
    const result = await this.dietsService.update(id, dto, req.user.gymId!);
    this.notificationsGateway.emitDietChanged(req.user.gymId!, { action: 'updated' });
    return result;
  }

  @Delete(':id')
  @UseGuards(RolesGuard)
  @Roles('admin', 'manager')
  @ApiOperation({ summary: 'Delete a diet plan' })
  async delete(@Request() req: AuthenticatedRequest, @Param('id', ParseIntPipe) id: number) {
    const result = await this.dietsService.delete(id, req.user.gymId!);
    this.notificationsGateway.emitDietChanged(req.user.gymId!, { action: 'deleted' });
    return result;
  }

  // ============ ASSIGNMENT ENDPOINTS ============

  @Post('assign')
  @UseGuards(RolesGuard)
  @Roles('admin', 'manager', 'trainer')
  @ApiOperation({ summary: 'Assign a diet plan to a user' })
  async assignDiet(@Request() req: AuthenticatedRequest, @Body() dto: AssignDietDto) {
    const branchId = req.user.branchId ?? null;
    const result = await this.dietsService.assignDiet(
      dto,
      req.user.gymId!,
      req.user.userId,
      branchId,
    );
    this.notificationsGateway.emitDietChanged(req.user.gymId!, { action: 'assigned' });
    return result;
  }

  @Get(':id/assignments')
  @UseGuards(RolesGuard)
  @Roles('superadmin', 'admin', 'branch_admin', 'manager', 'trainer')
  @ApiOperation({ summary: 'Get all users assigned to a diet' })
  @ApiQuery({ name: 'gymId', required: false, type: Number })
  getDietAssignments(
    @Request() req: AuthenticatedRequest,
    @Param('id', ParseIntPipe) id: number,
    @Query('gymId') queryGymId?: string,
  ) {
    const gymId =
      req.user.role === 'superadmin'
        ? queryGymId
          ? parseInt(queryGymId)
          : null
        : req.user.gymId!;

    if (!gymId) {
      throw new BadRequestException('gymId is required');
    }

    return this.dietsService.getDietAssignments(id, gymId);
  }

  @Get('user/:userId/assignments')
  @UseGuards(RolesGuard)
  @Roles('superadmin', 'admin', 'branch_admin', 'manager', 'trainer')
  @ApiOperation({ summary: 'Get all diets assigned to a user' })
  @ApiQuery({ name: 'gymId', required: false, type: Number })
  getUserDietAssignments(
    @Request() req: AuthenticatedRequest,
    @Param('userId', ParseIntPipe) userId: number,
    @Query('gymId') queryGymId?: string,
  ) {
    const gymId =
      req.user.role === 'superadmin'
        ? queryGymId
          ? parseInt(queryGymId)
          : null
        : req.user.gymId!;

    if (!gymId) {
      throw new BadRequestException('gymId is required');
    }

    return this.dietsService.getUserDietAssignments(userId, gymId);
  }

  @Patch('assignments/:id')
  @UseGuards(RolesGuard)
  @Roles('admin', 'manager', 'trainer')
  @ApiOperation({ summary: 'Update a diet assignment' })
  async updateAssignment(
    @Request() req: AuthenticatedRequest,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateDietAssignmentDto,
  ) {
    const result = await this.dietsService.updateAssignment(id, dto, req.user.gymId!);
    this.notificationsGateway.emitDietChanged(req.user.gymId!, { action: 'assignment_updated' });
    return result;
  }

  @Delete('assignments/:id')
  @UseGuards(RolesGuard)
  @Roles('admin', 'manager', 'trainer')
  @ApiOperation({ summary: 'Unassign (cancel) a diet assignment' })
  async unassignDiet(@Request() req: AuthenticatedRequest, @Param('id', ParseIntPipe) id: number) {
    const result = await this.dietsService.unassignDiet(id, req.user.gymId!);
    this.notificationsGateway.emitDietChanged(req.user.gymId!, { action: 'unassigned' });
    return result;
  }
}
