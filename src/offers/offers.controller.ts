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
import { OffersService } from './offers.service';
import { CreateOfferDto, UpdateOfferDto } from './dto/offer.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import type { AuthenticatedRequest } from '../common/types';

@ApiTags('offers')
@Controller('offers')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class OffersController {
  constructor(private readonly offersService: OffersService) {}

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
  @ApiOperation({ summary: 'Get all offers' })
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
    return this.offersService.findAll(
      req.user.gymId!,
      branchId,
      includeInactive === 'true',
    );
  }

  @Get('active')
  @ApiOperation({ summary: 'Get currently active offers' })
  @ApiQuery({
    name: 'branchId',
    required: false,
    type: Number,
    description: 'Branch ID for filtering (admin only)',
  })
  findActive(@Request() req: AuthenticatedRequest, @Query('branchId') queryBranchId?: string) {
    const branchId = this.resolveBranchId(req, queryBranchId);
    return this.offersService.findActive(req.user.gymId!, branchId);
  }

  @Get('validate/:code')
  @ApiOperation({ summary: 'Validate an offer code' })
  @ApiQuery({
    name: 'branchId',
    required: false,
    type: Number,
    description: 'Branch ID for filtering (admin only)',
  })
  validateCode(
    @Request() req: AuthenticatedRequest,
    @Param('code') code: string,
    @Query('branchId') queryBranchId?: string,
  ) {
    const branchId = this.resolveBranchId(req, queryBranchId);
    return this.offersService.validateOfferCode(code, req.user.gymId!, branchId);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get offer by ID' })
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
    return this.offersService.findOne(id, req.user.gymId!, branchId);
  }

  @Get('code/:code')
  @ApiOperation({ summary: 'Get offer by code' })
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
    return this.offersService.findByCode(code, req.user.gymId!, branchId);
  }

  @Post()
  @UseGuards(RolesGuard)
  @Roles('superadmin', 'admin', 'branch_admin')
  @ApiOperation({ summary: 'Create a new offer' })
  @ApiQuery({
    name: 'branchId',
    required: false,
    type: Number,
    description: 'Branch ID for the offer (admin only)',
  })
  create(
    @Request() req: AuthenticatedRequest,
    @Body() dto: CreateOfferDto,
    @Query('branchId') queryBranchId?: string,
  ) {
    const branchId = this.resolveBranchId(req, queryBranchId);
    return this.offersService.create(dto, req.user.gymId!, branchId);
  }

  @Patch(':id')
  @UseGuards(RolesGuard)
  @Roles('superadmin', 'admin', 'branch_admin')
  @ApiOperation({ summary: 'Update an offer' })
  update(
    @Request() req: AuthenticatedRequest,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateOfferDto,
  ) {
    return this.offersService.update(id, req.user.gymId!, dto);
  }

  @Delete(':id')
  @UseGuards(RolesGuard)
  @Roles('superadmin', 'admin', 'branch_admin')
  @ApiOperation({ summary: 'Delete an offer (soft delete)' })
  delete(@Request() req: AuthenticatedRequest, @Param('id', ParseIntPipe) id: number) {
    return this.offersService.delete(id, req.user.gymId!);
  }
}
