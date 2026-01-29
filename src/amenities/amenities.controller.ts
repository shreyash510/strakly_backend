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
import { ApiTags, ApiOperation, ApiBearerAuth, ApiQuery } from '@nestjs/swagger';
import { AmenitiesService } from './amenities.service';
import { CreateAmenityDto } from './dto/create-amenity.dto';
import { UpdateAmenityDto } from './dto/update-amenity.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';

@ApiTags('amenities')
@Controller('amenities')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class AmenitiesController {
  constructor(private readonly amenitiesService: AmenitiesService) {}

  private resolveBranchId(req: any, queryBranchId?: string): number | null {
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
  @ApiOperation({ summary: 'Get all amenities' })
  @ApiQuery({ name: 'includeInactive', required: false, type: Boolean })
  @ApiQuery({ name: 'branchId', required: false, type: Number, description: 'Branch ID for filtering (admin only)' })
  findAll(
    @Request() req: any,
    @Query('includeInactive') includeInactive?: string,
    @Query('branchId') queryBranchId?: string,
  ) {
    const branchId = this.resolveBranchId(req, queryBranchId);
    return this.amenitiesService.findAll(req.user.gymId, branchId, includeInactive === 'true');
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get amenity by ID' })
  @ApiQuery({ name: 'branchId', required: false, type: Number, description: 'Branch ID for filtering (admin only)' })
  findOne(
    @Request() req: any,
    @Param('id', ParseIntPipe) id: number,
    @Query('branchId') queryBranchId?: string,
  ) {
    const branchId = this.resolveBranchId(req, queryBranchId);
    return this.amenitiesService.findOne(id, req.user.gymId, branchId);
  }

  @Post()
  @UseGuards(RolesGuard)
  @Roles('superadmin', 'admin', 'manager')
  @ApiOperation({ summary: 'Create a new amenity' })
  @ApiQuery({ name: 'branchId', required: false, type: Number, description: 'Branch ID for the amenity (admin only)' })
  create(
    @Request() req: any,
    @Body() dto: CreateAmenityDto,
    @Query('branchId') queryBranchId?: string,
  ) {
    const branchId = this.resolveBranchId(req, queryBranchId);
    return this.amenitiesService.create(dto, req.user.gymId, branchId);
  }

  @Patch(':id')
  @UseGuards(RolesGuard)
  @Roles('superadmin', 'admin', 'manager')
  @ApiOperation({ summary: 'Update an amenity' })
  update(
    @Request() req: any,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateAmenityDto,
  ) {
    return this.amenitiesService.update(id, req.user.gymId, dto);
  }

  @Delete(':id')
  @UseGuards(RolesGuard)
  @Roles('superadmin', 'admin', 'manager')
  @ApiOperation({ summary: 'Delete an amenity (soft delete)' })
  delete(@Request() req: any, @Param('id', ParseIntPipe) id: number) {
    return this.amenitiesService.delete(id, req.user.gymId);
  }
}
