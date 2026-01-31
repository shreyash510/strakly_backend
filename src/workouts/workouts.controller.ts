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
  Request,
  BadRequestException,
  ParseIntPipe,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiBearerAuth,
  ApiQuery,
} from '@nestjs/swagger';
import { WorkoutsService } from './workouts.service';
import {
  CreateWorkoutPlanDto,
  UpdateWorkoutPlanDto,
  AssignWorkoutDto,
  UpdateWorkoutAssignmentDto,
} from './dto/workout.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';

@ApiTags('workouts')
@Controller('workouts')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class WorkoutsController {
  constructor(private readonly workoutsService: WorkoutsService) {}

  /**
   * Resolve branchId from request: null = all branches, number = specific branch
   */
  private resolveBranchId(req: any, queryBranchId?: string): number | null {
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
  @ApiOperation({ summary: 'Get all workout plans' })
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
    name: 'difficulty',
    required: false,
    description: 'Filter by difficulty',
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
    @Request() req: any,
    @Query('status') status?: string,
    @Query('type') type?: string,
    @Query('category') category?: string,
    @Query('difficulty') difficulty?: string,
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
        : req.user.gymId;

    if (!gymId) {
      throw new BadRequestException('gymId is required');
    }

    const branchId = this.resolveBranchId(req, queryBranchId);

    return this.workoutsService.findAll(gymId, {
      status,
      type,
      category,
      difficulty,
      search,
      page: page ? parseInt(page) : undefined,
      limit: limit ? parseInt(limit) : undefined,
      branchId,
    });
  }

  @Get(':id')
  @UseGuards(RolesGuard)
  @Roles('superadmin', 'admin', 'branch_admin', 'manager', 'trainer')
  @ApiOperation({ summary: 'Get a workout plan by ID' })
  @ApiQuery({ name: 'gymId', required: false, type: Number })
  findOne(
    @Request() req: any,
    @Param('id', ParseIntPipe) id: number,
    @Query('gymId') queryGymId?: string,
  ) {
    const gymId =
      req.user.role === 'superadmin'
        ? queryGymId
          ? parseInt(queryGymId)
          : null
        : req.user.gymId;

    if (!gymId) {
      throw new BadRequestException('gymId is required');
    }

    return this.workoutsService.findOne(id, gymId);
  }

  @Post()
  @UseGuards(RolesGuard)
  @Roles('admin', 'manager', 'trainer')
  @ApiOperation({ summary: 'Create a new workout plan' })
  create(@Request() req: any, @Body() dto: CreateWorkoutPlanDto) {
    const branchId = req.user.branchId ?? null;
    return this.workoutsService.create(
      dto,
      req.user.gymId,
      req.user.userId,
      branchId,
    );
  }

  @Patch(':id')
  @UseGuards(RolesGuard)
  @Roles('admin', 'manager', 'trainer')
  @ApiOperation({ summary: 'Update a workout plan' })
  update(
    @Request() req: any,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateWorkoutPlanDto,
  ) {
    return this.workoutsService.update(id, dto, req.user.gymId);
  }

  @Delete(':id')
  @UseGuards(RolesGuard)
  @Roles('admin', 'manager')
  @ApiOperation({ summary: 'Delete a workout plan' })
  delete(@Request() req: any, @Param('id', ParseIntPipe) id: number) {
    return this.workoutsService.delete(id, req.user.gymId);
  }

  // ============ ASSIGNMENT ENDPOINTS ============

  @Post('assign')
  @UseGuards(RolesGuard)
  @Roles('admin', 'manager', 'trainer')
  @ApiOperation({ summary: 'Assign a workout plan to a user' })
  assignWorkout(@Request() req: any, @Body() dto: AssignWorkoutDto) {
    const branchId = req.user.branchId ?? null;
    return this.workoutsService.assignWorkout(
      dto,
      req.user.gymId,
      req.user.userId,
      branchId,
    );
  }

  @Get(':id/assignments')
  @UseGuards(RolesGuard)
  @Roles('superadmin', 'admin', 'branch_admin', 'manager', 'trainer')
  @ApiOperation({ summary: 'Get all users assigned to a workout plan' })
  @ApiQuery({ name: 'gymId', required: false, type: Number })
  getWorkoutAssignments(
    @Request() req: any,
    @Param('id', ParseIntPipe) id: number,
    @Query('gymId') queryGymId?: string,
  ) {
    const gymId =
      req.user.role === 'superadmin'
        ? queryGymId
          ? parseInt(queryGymId)
          : null
        : req.user.gymId;

    if (!gymId) {
      throw new BadRequestException('gymId is required');
    }

    return this.workoutsService.getWorkoutAssignments(id, gymId);
  }

  @Get('user/:userId/assignments')
  @UseGuards(RolesGuard)
  @Roles('superadmin', 'admin', 'branch_admin', 'manager', 'trainer')
  @ApiOperation({ summary: 'Get all workouts assigned to a user' })
  @ApiQuery({ name: 'gymId', required: false, type: Number })
  getUserWorkoutAssignments(
    @Request() req: any,
    @Param('userId', ParseIntPipe) userId: number,
    @Query('gymId') queryGymId?: string,
  ) {
    const gymId =
      req.user.role === 'superadmin'
        ? queryGymId
          ? parseInt(queryGymId)
          : null
        : req.user.gymId;

    if (!gymId) {
      throw new BadRequestException('gymId is required');
    }

    return this.workoutsService.getUserWorkoutAssignments(userId, gymId);
  }

  @Patch('assignments/:id')
  @UseGuards(RolesGuard)
  @Roles('admin', 'manager', 'trainer')
  @ApiOperation({ summary: 'Update a workout assignment' })
  updateAssignment(
    @Request() req: any,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateWorkoutAssignmentDto,
  ) {
    return this.workoutsService.updateAssignment(id, dto, req.user.gymId);
  }

  @Delete('assignments/:id')
  @UseGuards(RolesGuard)
  @Roles('admin', 'manager', 'trainer')
  @ApiOperation({ summary: 'Unassign (cancel) a workout assignment' })
  unassignWorkout(@Request() req: any, @Param('id', ParseIntPipe) id: number) {
    return this.workoutsService.unassignWorkout(id, req.user.gymId);
  }
}
