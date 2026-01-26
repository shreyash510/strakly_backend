import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  Query,
  Request,
  UseGuards,
  ParseIntPipe,
  BadRequestException,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiQuery } from '@nestjs/swagger';
import { SaasSubscriptionsService } from './saas-subscriptions.service';
import {
  CreateSaasPlanDto,
  UpdateSaasPlanDto,
  CreateGymSubscriptionDto,
  UpdateGymSubscriptionDto,
  CancelSubscriptionDto,
} from './dto/saas-subscriptions.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';

@ApiTags('saas-subscriptions')
@Controller('saas-subscriptions')
@UseGuards(JwtAuthGuard, RolesGuard)
@ApiBearerAuth()
export class SaasSubscriptionsController {
  constructor(private readonly service: SaasSubscriptionsService) {}

  // ============================================
  // SaaS Plans Endpoints
  // ============================================

  @Get('plans')
  @Roles('superadmin')
  @ApiOperation({ summary: 'Get all SaaS plans' })
  @ApiQuery({ name: 'includeInactive', required: false, type: Boolean })
  findAllPlans(@Query('includeInactive') includeInactive?: string) {
    return this.service.findAllPlans(includeInactive === 'true');
  }

  @Get('plans/:id')
  @Roles('superadmin')
  @ApiOperation({ summary: 'Get a SaaS plan by ID' })
  findPlanById(@Param('id', ParseIntPipe) id: number) {
    return this.service.findPlanById(id);
  }

  @Post('plans')
  @Roles('superadmin')
  @ApiOperation({ summary: 'Create a new SaaS plan' })
  createPlan(@Body() dto: CreateSaasPlanDto) {
    return this.service.createPlan(dto);
  }

  @Patch('plans/:id')
  @Roles('superadmin')
  @ApiOperation({ summary: 'Update a SaaS plan' })
  updatePlan(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateSaasPlanDto,
  ) {
    return this.service.updatePlan(id, dto);
  }

  @Delete('plans/:id')
  @Roles('superadmin')
  @ApiOperation({ summary: 'Delete a SaaS plan' })
  deletePlan(@Param('id', ParseIntPipe) id: number) {
    return this.service.deletePlan(id);
  }

  // ============================================
  // Gym Subscriptions Endpoints
  // ============================================

  @Get()
  @Roles('superadmin')
  @ApiOperation({ summary: 'Get all gym subscriptions' })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  @ApiQuery({ name: 'search', required: false, type: String })
  @ApiQuery({ name: 'status', required: false, type: String })
  @ApiQuery({ name: 'planId', required: false, type: Number })
  @ApiQuery({ name: 'paymentStatus', required: false, type: String })
  findAllSubscriptions(
    @Query('page') page?: string,
    @Query('limit') limit?: string,
    @Query('search') search?: string,
    @Query('status') status?: string,
    @Query('planId') planId?: string,
    @Query('paymentStatus') paymentStatus?: string,
  ) {
    return this.service.findAllSubscriptions({
      page: page ? parseInt(page, 10) : undefined,
      limit: limit ? parseInt(limit, 10) : undefined,
      search,
      status,
      planId: planId ? parseInt(planId, 10) : undefined,
      paymentStatus,
    });
  }

  @Get('stats')
  @Roles('superadmin')
  @ApiOperation({ summary: 'Get subscription statistics' })
  getStats() {
    return this.service.getStats();
  }

  @Get('me')
  @Roles('superadmin', 'admin')
  @ApiOperation({ summary: 'Get current user gym subscription' })
  getMySubscription(@Request() req: any) {
    const gymId = req.user.gymId;
    if (!gymId) {
      throw new BadRequestException('No gym associated with this account');
    }
    return this.service.findSubscriptionByGymId(gymId);
  }

  @Get(':id')
  @Roles('superadmin')
  @ApiOperation({ summary: 'Get a gym subscription by ID' })
  findSubscriptionById(@Param('id', ParseIntPipe) id: number) {
    return this.service.findSubscriptionById(id);
  }

  @Get('gym/:gymId')
  @Roles('superadmin')
  @ApiOperation({ summary: 'Get subscription by gym ID' })
  findSubscriptionByGymId(@Param('gymId', ParseIntPipe) gymId: number) {
    return this.service.findSubscriptionByGymId(gymId);
  }

  @Post()
  @Roles('superadmin')
  @ApiOperation({ summary: 'Create a gym subscription' })
  createSubscription(@Body() dto: CreateGymSubscriptionDto) {
    return this.service.createSubscription(dto);
  }

  @Patch(':id')
  @Roles('superadmin')
  @ApiOperation({ summary: 'Update a gym subscription' })
  updateSubscription(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateGymSubscriptionDto,
  ) {
    return this.service.updateSubscription(id, dto);
  }

  @Post(':id/cancel')
  @Roles('superadmin')
  @ApiOperation({ summary: 'Cancel a gym subscription' })
  cancelSubscription(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: CancelSubscriptionDto,
  ) {
    return this.service.cancelSubscription(id, dto);
  }
}
