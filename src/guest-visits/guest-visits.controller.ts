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
  Req,
} from '@nestjs/common';
import { GuestVisitsService } from './guest-visits.service';
import { CreateGuestVisitDto, UpdateGuestVisitDto, GuestVisitFiltersDto } from './dto/guest-visit.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { RequireBranchGuard } from '../auth/guards/require-branch.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { GymId } from '../common/decorators/gym-id.decorator';
import { UserId } from '../common/decorators/user-id.decorator';
import type { AuthenticatedRequest } from '../common/types';
import { resolveEffectiveBranchId } from '../common';
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
  @Roles('admin', 'manager', 'cashier')
  @ApiOperation({ summary: 'Get guest visit stats' })
  async getStats(
    @Req() req: AuthenticatedRequest,
    @GymId() gymId: number,
    @Query('branchId') branchId?: string,
  ) {
    return this.guestVisitsService.getStats(gymId, resolveEffectiveBranchId(req.user, branchId) ?? undefined);
  }

  @Get()
  @Roles('admin', 'manager', 'cashier')
  @ApiOperation({ summary: 'List guest visits with filters' })
  async findAll(
    @GymId() gymId: number,
    @Query() filters: GuestVisitFiltersDto,
  ) {
    return this.guestVisitsService.findAll(gymId, filters);
  }

  @Get(':id')
  @Roles('admin', 'manager', 'cashier')
  @ApiOperation({ summary: 'Get a guest visit by ID' })
  async findOne(
    @Req() req: AuthenticatedRequest,
    @Param('id', ParseIntPipe) id: number,
    @GymId() gymId: number,
  ) {
    return this.guestVisitsService.findOne(id, gymId, resolveEffectiveBranchId(req.user, undefined));
  }

  @Post()
  @UseGuards(RequireBranchGuard, ManagerPermissionsGuard)
  @Roles('admin', 'manager', 'cashier')
  @ManagerPermission('guestVisits', 'create')
  @ApiOperation({ summary: 'Record a guest visit' })
  async create(
    @Body() dto: CreateGuestVisitDto,
    @GymId() gymId: number,
    @UserId() userId: number,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.guestVisitsService.create(gymId, dto, userId, resolveEffectiveBranchId(req.user, undefined));
  }

  @Patch(':id')
  @UseGuards(RequireBranchGuard, ManagerPermissionsGuard)
  @Roles('admin', 'manager', 'cashier')
  @ManagerPermission('guestVisits', 'update')
  @ApiOperation({ summary: 'Update a guest visit' })
  async update(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateGuestVisitDto,
    @GymId() gymId: number,
  ) {
    return this.guestVisitsService.update(id, gymId, dto);
  }

  @Patch(':id/convert')
  @UseGuards(RequireBranchGuard, ManagerPermissionsGuard)
  @Roles('admin', 'manager', 'cashier')
  @ManagerPermission('guestVisits', 'update')
  @ApiOperation({ summary: 'Mark guest as converted to client' })
  async markConverted(
    @Param('id', ParseIntPipe) id: number,
    @GymId() gymId: number,
  ) {
    return this.guestVisitsService.markConverted(id, gymId);
  }

  @Delete(':id')
  @UseGuards(RequireBranchGuard, ManagerPermissionsGuard)
  @Roles('admin', 'manager', 'cashier')
  @ManagerPermission('guestVisits', 'delete')
  @ApiOperation({ summary: 'Delete a guest visit' })
  async remove(
    @Param('id', ParseIntPipe) id: number,
    @GymId() gymId: number,
  ) {
    return this.guestVisitsService.remove(id, gymId);
  }
}
