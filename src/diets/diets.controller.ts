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
import { ApiTags, ApiOperation, ApiBearerAuth, ApiQuery, ApiHeader } from '@nestjs/swagger';
import { DietsService } from './diets.service';
import { CreateDietDto, UpdateDietDto, AssignDietDto, UpdateDietAssignmentDto } from './dto/diet.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';

@ApiTags('diets')
@Controller('diets')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class DietsController {
  constructor(private readonly dietsService: DietsService) {}

  /**
   * Resolve branchId from request: null = all branches, number = specific branch
   */
  private resolveBranchId(req: any, queryBranchId?: string): number | null {
    if (req.user.role === 'superadmin') {
      return queryBranchId ? parseInt(queryBranchId) : null;
    }
    return queryBranchId ? parseInt(queryBranchId) : (req.user.branchId ?? null);
  }

  @Get()
  @UseGuards(RolesGuard)
  @Roles('superadmin', 'admin', 'manager', 'trainer')
  @ApiOperation({ summary: 'Get all diet plans' })
  @ApiQuery({ name: 'status', required: false, description: 'Filter by status' })
  @ApiQuery({ name: 'type', required: false, description: 'Filter by type' })
  @ApiQuery({ name: 'category', required: false, description: 'Filter by category' })
  @ApiQuery({ name: 'search', required: false, description: 'Search by title or description' })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  @ApiQuery({ name: 'gymId', required: false, type: Number, description: 'Gym ID (required for superadmin)' })
  @ApiQuery({ name: 'branchId', required: false, type: Number, description: 'Branch ID for filtering' })
  findAll(
    @Request() req: any,
    @Query('status') status?: string,
    @Query('type') type?: string,
    @Query('category') category?: string,
    @Query('search') search?: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
    @Query('gymId') queryGymId?: string,
    @Query('branchId') queryBranchId?: string,
  ) {
    const gymId = req.user.role === 'superadmin'
      ? (queryGymId ? parseInt(queryGymId) : null)
      : req.user.gymId;

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
  @Roles('superadmin', 'admin', 'manager', 'trainer')
  @ApiOperation({ summary: 'Get a diet plan by ID' })
  @ApiQuery({ name: 'gymId', required: false, type: Number })
  findOne(
    @Request() req: any,
    @Param('id', ParseIntPipe) id: number,
    @Query('gymId') queryGymId?: string,
  ) {
    const gymId = req.user.role === 'superadmin'
      ? (queryGymId ? parseInt(queryGymId) : null)
      : req.user.gymId;

    if (!gymId) {
      throw new BadRequestException('gymId is required');
    }

    return this.dietsService.findOne(id, gymId);
  }

  @Post()
  @UseGuards(RolesGuard)
  @Roles('admin', 'manager', 'trainer')
  @ApiOperation({ summary: 'Create a new diet plan' })
  create(@Request() req: any, @Body() dto: CreateDietDto) {
    const branchId = req.user.branchId ?? null;
    return this.dietsService.create(dto, req.user.gymId, req.user.userId, branchId);
  }

  @Patch(':id')
  @UseGuards(RolesGuard)
  @Roles('admin', 'manager', 'trainer')
  @ApiOperation({ summary: 'Update a diet plan' })
  update(
    @Request() req: any,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateDietDto,
  ) {
    return this.dietsService.update(id, dto, req.user.gymId);
  }

  @Delete(':id')
  @UseGuards(RolesGuard)
  @Roles('admin', 'manager')
  @ApiOperation({ summary: 'Delete a diet plan' })
  delete(@Request() req: any, @Param('id', ParseIntPipe) id: number) {
    return this.dietsService.delete(id, req.user.gymId);
  }

  // ============ ASSIGNMENT ENDPOINTS ============

  @Post('assign')
  @UseGuards(RolesGuard)
  @Roles('admin', 'manager', 'trainer')
  @ApiOperation({ summary: 'Assign a diet plan to a user' })
  assignDiet(@Request() req: any, @Body() dto: AssignDietDto) {
    const branchId = req.user.branchId ?? null;
    return this.dietsService.assignDiet(dto, req.user.gymId, req.user.userId, branchId);
  }

  @Get(':id/assignments')
  @UseGuards(RolesGuard)
  @Roles('superadmin', 'admin', 'manager', 'trainer')
  @ApiOperation({ summary: 'Get all users assigned to a diet' })
  @ApiQuery({ name: 'gymId', required: false, type: Number })
  getDietAssignments(
    @Request() req: any,
    @Param('id', ParseIntPipe) id: number,
    @Query('gymId') queryGymId?: string,
  ) {
    const gymId = req.user.role === 'superadmin'
      ? (queryGymId ? parseInt(queryGymId) : null)
      : req.user.gymId;

    if (!gymId) {
      throw new BadRequestException('gymId is required');
    }

    return this.dietsService.getDietAssignments(id, gymId);
  }

  @Get('user/:userId/assignments')
  @UseGuards(RolesGuard)
  @Roles('superadmin', 'admin', 'manager', 'trainer')
  @ApiOperation({ summary: 'Get all diets assigned to a user' })
  @ApiQuery({ name: 'gymId', required: false, type: Number })
  getUserDietAssignments(
    @Request() req: any,
    @Param('userId', ParseIntPipe) userId: number,
    @Query('gymId') queryGymId?: string,
  ) {
    const gymId = req.user.role === 'superadmin'
      ? (queryGymId ? parseInt(queryGymId) : null)
      : req.user.gymId;

    if (!gymId) {
      throw new BadRequestException('gymId is required');
    }

    return this.dietsService.getUserDietAssignments(userId, gymId);
  }

  @Patch('assignments/:id')
  @UseGuards(RolesGuard)
  @Roles('admin', 'manager', 'trainer')
  @ApiOperation({ summary: 'Update a diet assignment' })
  updateAssignment(
    @Request() req: any,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateDietAssignmentDto,
  ) {
    return this.dietsService.updateAssignment(id, dto, req.user.gymId);
  }

  @Delete('assignments/:id')
  @UseGuards(RolesGuard)
  @Roles('admin', 'manager', 'trainer')
  @ApiOperation({ summary: 'Unassign (cancel) a diet assignment' })
  unassignDiet(@Request() req: any, @Param('id', ParseIntPipe) id: number) {
    return this.dietsService.unassignDiet(id, req.user.gymId);
  }
}
