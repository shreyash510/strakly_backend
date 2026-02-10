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
  ParseIntPipe,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiBearerAuth,
  ApiQuery,
} from '@nestjs/swagger';
import { PlansService } from './plans.service';
import { CreatePlanDto, UpdatePlanDto } from './dto/plan.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import type { AuthenticatedRequest } from '../common/types';

@ApiTags('plans')
@Controller('plans')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class PlansController {
  constructor(private readonly plansService: PlansService) {}

  private resolveBranchId(req: AuthenticatedRequest, queryBranchId?: string): number | null {
    // If user has a specific branch assigned, they can only see their branch
    if (req.user.branchId !== null && req.user.branchId !== undefined) {
      return req.user.branchId;
    }
    // User is admin with access to all branches - use query param if provided
    if (queryBranchId && queryBranchId !== 'all' && queryBranchId !== '') {
      return parseInt(queryBranchId);
    }
    return null; // all branches
  }

  @Get()
  @ApiOperation({ summary: 'Get all active plans' })
  @ApiQuery({ name: 'includeInactive', required: false, type: Boolean })
  @ApiQuery({
    name: 'branchId',
    required: false,
    type: Number,
    description: 'Branch ID for filtering (admin only)',
  })
  findAll(
    @Request() req: AuthenticatedRequest,
    @Query('includeInactive') includeInactive?: string,
    @Query('branchId') queryBranchId?: string,
  ) {
    const branchId = this.resolveBranchId(req, queryBranchId);
    return this.plansService.findAll(
      req.user.gymId!,
      branchId,
      includeInactive === 'true',
    );
  }

  @Get('featured')
  @ApiOperation({ summary: 'Get featured plans' })
  @ApiQuery({
    name: 'branchId',
    required: false,
    type: Number,
    description: 'Branch ID for filtering (admin only)',
  })
  findFeatured(@Request() req: AuthenticatedRequest, @Query('branchId') queryBranchId?: string) {
    const branchId = this.resolveBranchId(req, queryBranchId);
    return this.plansService.findFeatured(req.user.gymId!, branchId);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get plan by ID' })
  @ApiQuery({
    name: 'branchId',
    required: false,
    type: Number,
    description: 'Branch ID for filtering (admin only)',
  })
  findOne(
    @Request() req: AuthenticatedRequest,
    @Param('id', ParseIntPipe) id: number,
    @Query('branchId') queryBranchId?: string,
  ) {
    const branchId = this.resolveBranchId(req, queryBranchId);
    return this.plansService.findOne(id, req.user.gymId!, branchId);
  }

  @Get('code/:code')
  @ApiOperation({ summary: 'Get plan by code' })
  @ApiQuery({
    name: 'branchId',
    required: false,
    type: Number,
    description: 'Branch ID for filtering (admin only)',
  })
  findByCode(
    @Request() req: AuthenticatedRequest,
    @Param('code') code: string,
    @Query('branchId') queryBranchId?: string,
  ) {
    const branchId = this.resolveBranchId(req, queryBranchId);
    return this.plansService.findByCode(code, req.user.gymId!, branchId);
  }

  @Get(':id/price')
  @ApiOperation({ summary: 'Calculate price with optional offer code' })
  @ApiQuery({ name: 'offerCode', required: false })
  @ApiQuery({
    name: 'branchId',
    required: false,
    type: Number,
    description: 'Branch ID for filtering (admin only)',
  })
  calculatePrice(
    @Request() req: AuthenticatedRequest,
    @Param('id', ParseIntPipe) id: number,
    @Query('offerCode') offerCode?: string,
    @Query('branchId') queryBranchId?: string,
  ) {
    const branchId = this.resolveBranchId(req, queryBranchId);
    return this.plansService.calculatePriceWithOffer(
      id,
      req.user.gymId!,
      branchId,
      offerCode,
    );
  }

  @Post()
  @UseGuards(RolesGuard)
  @Roles('superadmin', 'admin', 'branch_admin')
  @ApiOperation({ summary: 'Create a new plan' })
  @ApiQuery({
    name: 'branchId',
    required: false,
    type: Number,
    description: 'Branch ID for the plan (admin only)',
  })
  create(
    @Request() req: AuthenticatedRequest,
    @Body() dto: CreatePlanDto,
    @Query('branchId') queryBranchId?: string,
  ) {
    const branchId = this.resolveBranchId(req, queryBranchId);
    return this.plansService.create(dto, req.user.gymId!, branchId);
  }

  @Patch(':id')
  @UseGuards(RolesGuard)
  @Roles('superadmin', 'admin', 'branch_admin')
  @ApiOperation({ summary: 'Update a plan' })
  update(
    @Request() req: AuthenticatedRequest,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdatePlanDto,
  ) {
    return this.plansService.update(id, req.user.gymId!, dto);
  }

  @Delete(':id')
  @UseGuards(RolesGuard)
  @Roles('superadmin', 'admin', 'branch_admin')
  @ApiOperation({ summary: 'Delete a plan (soft delete)' })
  delete(@Request() req: AuthenticatedRequest, @Param('id', ParseIntPipe) id: number) {
    return this.plansService.delete(id, req.user.gymId!);
  }
}
