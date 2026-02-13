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
import { GuestVisitsService } from './guest-visits.service';
import { CreateGuestVisitDto, UpdateGuestVisitDto, GuestVisitFiltersDto } from './dto/guest-visit.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { GymId } from '../common/decorators/gym-id.decorator';
import { OptionalBranchId } from '../common/decorators/branch-id.decorator';
import { UserId } from '../common/decorators/user-id.decorator';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';

@ApiTags('guest-visits')
@Controller('guest-visits')
@UseGuards(JwtAuthGuard, RolesGuard)
@ApiBearerAuth()
export class GuestVisitsController {
  constructor(private readonly guestVisitsService: GuestVisitsService) {}

  @Get('stats')
  @Roles('admin', 'branch_admin', 'manager')
  @ApiOperation({ summary: 'Get guest visit stats' })
  async getStats(
    @GymId() gymId: number,
    @OptionalBranchId() branchId: number | null,
  ) {
    return this.guestVisitsService.getStats(gymId, branchId);
  }

  @Get()
  @Roles('admin', 'branch_admin', 'manager')
  @ApiOperation({ summary: 'List guest visits with filters' })
  async findAll(
    @GymId() gymId: number,
    @OptionalBranchId() branchId: number | null,
    @Query() filters: GuestVisitFiltersDto,
  ) {
    return this.guestVisitsService.findAll(gymId, branchId, filters);
  }

  @Get(':id')
  @Roles('admin', 'branch_admin', 'manager')
  @ApiOperation({ summary: 'Get a guest visit by ID' })
  async findOne(
    @Param('id', ParseIntPipe) id: number,
    @GymId() gymId: number,
    @OptionalBranchId() branchId: number | null,
  ) {
    return this.guestVisitsService.findOne(id, gymId, branchId);
  }

  @Post()
  @Roles('admin', 'branch_admin', 'manager')
  @ApiOperation({ summary: 'Record a guest visit' })
  async create(
    @Body() dto: CreateGuestVisitDto,
    @GymId() gymId: number,
    @OptionalBranchId() branchId: number | null,
    @UserId() userId: number,
  ) {
    return this.guestVisitsService.create(gymId, branchId, dto, userId);
  }

  @Patch(':id')
  @Roles('admin', 'branch_admin', 'manager')
  @ApiOperation({ summary: 'Update a guest visit' })
  async update(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateGuestVisitDto,
    @GymId() gymId: number,
    @OptionalBranchId() branchId: number | null,
  ) {
    return this.guestVisitsService.update(id, gymId, branchId, dto);
  }

  @Patch(':id/convert')
  @Roles('admin', 'branch_admin', 'manager')
  @ApiOperation({ summary: 'Mark guest as converted to member' })
  async markConverted(
    @Param('id', ParseIntPipe) id: number,
    @GymId() gymId: number,
    @OptionalBranchId() branchId: number | null,
  ) {
    return this.guestVisitsService.markConverted(id, gymId, branchId);
  }

  @Delete(':id')
  @Roles('admin', 'branch_admin', 'manager')
  @ApiOperation({ summary: 'Delete a guest visit' })
  async remove(
    @Param('id', ParseIntPipe) id: number,
    @GymId() gymId: number,
    @OptionalBranchId() branchId: number | null,
  ) {
    return this.guestVisitsService.remove(id, gymId, branchId);
  }
}
