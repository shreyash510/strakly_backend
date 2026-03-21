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
import { ManagerPermissionsGuard } from '../auth/guards/manager-permissions.guard';
import { ManagerPermission } from '../auth/decorators/manager-permission.decorator';
import { NotificationsGateway } from '../notifications/notifications.gateway';
import type { AuthenticatedRequest } from '../common/types';

@ApiTags('plans')
@Controller('plans')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class PlansController {
  constructor(
    private readonly plansService: PlansService,
    private readonly notificationsGateway: NotificationsGateway,
  ) {}

  @Get()
  @ApiOperation({ summary: 'Get all active plans' })
  @ApiQuery({ name: 'includeInactive', required: false, type: Boolean })
  findAll(
    @Request() req: AuthenticatedRequest,
    @Query('includeInactive') includeInactive?: string,
  ) {
    return this.plansService.findAll(
      req.user.gymId!,
      includeInactive === 'true',
    );
  }

  @Get('featured')
  @ApiOperation({ summary: 'Get featured plans' })
  findFeatured(@Request() req: AuthenticatedRequest) {
    return this.plansService.findFeatured(req.user.gymId!);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get plan by ID' })
  findOne(
    @Request() req: AuthenticatedRequest,
    @Param('id', ParseIntPipe) id: number,
  ) {
    return this.plansService.findOne(id, req.user.gymId!);
  }

  @Get('code/:code')
  @ApiOperation({ summary: 'Get plan by code' })
  findByCode(
    @Request() req: AuthenticatedRequest,
    @Param('code') code: string,
  ) {
    return this.plansService.findByCode(code, req.user.gymId!);
  }

  @Get(':id/price')
  @ApiOperation({ summary: 'Calculate price with optional offer code' })
  @ApiQuery({ name: 'offerCode', required: false })
  calculatePrice(
    @Request() req: AuthenticatedRequest,
    @Param('id', ParseIntPipe) id: number,
    @Query('offerCode') offerCode?: string,
  ) {
    return this.plansService.calculatePriceWithOffer(
      id,
      req.user.gymId!,
      offerCode,
    );
  }

  @Post()
  @UseGuards(RolesGuard, ManagerPermissionsGuard)
  @Roles('superadmin', 'admin', 'manager')
  @ManagerPermission('plans', 'create')
  @ApiOperation({ summary: 'Create a new plan' })
  async create(
    @Request() req: AuthenticatedRequest,
    @Body() dto: CreatePlanDto,
  ) {
    const result = await this.plansService.create(dto, req.user.gymId!);
    this.notificationsGateway.emitPlanChanged(req.user.gymId!, { action: 'created' });
    return result;
  }

  @Patch(':id')
  @UseGuards(RolesGuard, ManagerPermissionsGuard)
  @Roles('superadmin', 'admin', 'manager')
  @ManagerPermission('plans', 'update')
  @ApiOperation({ summary: 'Update a plan' })
  async update(
    @Request() req: AuthenticatedRequest,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdatePlanDto,
  ) {
    const result = await this.plansService.update(id, req.user.gymId!, dto);
    this.notificationsGateway.emitPlanChanged(req.user.gymId!, { action: 'updated' });
    return result;
  }

  @Delete(':id')
  @UseGuards(RolesGuard, ManagerPermissionsGuard)
  @Roles('superadmin', 'admin', 'manager')
  @ManagerPermission('plans', 'delete')
  @ApiOperation({ summary: 'Delete a plan (soft delete)' })
  async delete(@Request() req: AuthenticatedRequest, @Param('id', ParseIntPipe) id: number) {
    const result = await this.plansService.delete(id, req.user.gymId!);
    this.notificationsGateway.emitPlanChanged(req.user.gymId!, { action: 'deleted' });
    return result;
  }
}
