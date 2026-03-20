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
import { ManagerPermissionsGuard } from '../auth/guards/manager-permissions.guard';
import { ManagerPermission } from '../auth/decorators/manager-permission.decorator';

@ApiTags('guest-visits')
@Controller('guest-visits')
@UseGuards(JwtAuthGuard, RolesGuard)
@ApiBearerAuth()
export class GuestVisitsController {
  constructor(private readonly guestVisitsService: GuestVisitsService) {}

  @Get('stats')
  @Roles('admin', 'manager')
  @ApiOperation({ summary: 'Get guest visit stats' })
  async getStats(
    @GymId() gymId: number,
    @OptionalBranchId() branchId: number | null,
  ) {
    return this.guestVisitsService.getStats(gymId, branchId);
  }

  @Get()
  @Roles('admin', 'manager')
  @ApiOperation({ summary: 'List guest visits with filters' })
  async findAll(
    @GymId() gymId: number,
    @OptionalBranchId() branchId: number | null,
    @Query() filters: GuestVisitFiltersDto,
  ) {
    return this.guestVisitsService.findAll(gymId, branchId, filters);
  }

  @Get(':id')
  @Roles('admin', 'manager')
  @ApiOperation({ summary: 'Get a guest visit by ID' })
  async findOne(
    @Param('id', ParseIntPipe) id: number,
    @GymId() gymId: number,
    @OptionalBranchId() branchId: number | null,
  ) {
    return this.guestVisitsService.findOne(id, gymId, branchId);
  }

  @Post()
  @UseGuards(ManagerPermissionsGuard)
  @Roles('admin', 'manager')
  @ManagerPermission('guestVisits', 'create')
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
  @UseGuards(ManagerPermissionsGuard)
  @Roles('admin', 'manager')
  @ManagerPermission('guestVisits', 'update')
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
  @UseGuards(ManagerPermissionsGuard)
  @Roles('admin', 'manager')
  @ManagerPermission('guestVisits', 'update')
  @ApiOperation({ summary: 'Mark guest as converted to client' })
  async markConverted(
    @Param('id', ParseIntPipe) id: number,
    @GymId() gymId: number,
    @OptionalBranchId() branchId: number | null,
  ) {
    return this.guestVisitsService.markConverted(id, gymId, branchId);
  }

  @Delete(':id')
  @UseGuards(ManagerPermissionsGuard)
  @Roles('admin', 'manager')
  @ManagerPermission('guestVisits', 'delete')
  @ApiOperation({ summary: 'Delete a guest visit' })
  async remove(
    @Param('id', ParseIntPipe) id: number,
    @GymId() gymId: number,
    @OptionalBranchId() branchId: number | null,
  ) {
    return this.guestVisitsService.remove(id, gymId, branchId);
  }
}
