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
import {
  ApiTags,
  ApiOperation,
  ApiBearerAuth,
  ApiQuery,
} from '@nestjs/swagger';
import { SaasSubscriptionsService } from './saas-subscriptions.service';
import {
  CreateSaasPlanDto,
  UpdateSaasPlanDto,
  CreateGymSubscriptionDto,
  UpdateGymSubscriptionDto,
  CancelSubscriptionDto,
  CreatePaymentHistoryDto,
  UpdatePaymentHistoryDto,
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
  @ApiOperation({ summary: 'Get all SaaS plans (superadmin)' })
  @ApiQuery({ name: 'includeInactive', required: false, type: Boolean })
  findAllPlans(@Query('includeInactive') includeInactive?: string) {
    return this.service.findAllPlans(includeInactive === 'true');
  }

  @Get('plans/active')
  @Roles('superadmin', 'admin', 'branch_admin', 'manager')
  @ApiOperation({ summary: 'Get active SaaS plans (for viewing/renewal)' })
  findActivePlans() {
    return this.service.findAllPlans(false);
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
  @Roles('superadmin', 'admin', 'branch_admin', 'manager', 'trainer')
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

  // ============================================
  // Payment History Endpoints
  // ============================================

  @Get('me/payment-history')
  @Roles('superadmin', 'admin')
  @ApiOperation({ summary: 'Get payment history for current gym' })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  @ApiQuery({ name: 'status', required: false, type: String })
  @ApiQuery({ name: 'startDate', required: false, type: String })
  @ApiQuery({ name: 'endDate', required: false, type: String })
  getMyPaymentHistory(
    @Request() req: any,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
    @Query('status') status?: string,
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
  ) {
    const gymId = req.user.gymId;
    if (!gymId) {
      throw new BadRequestException('No gym associated with this account');
    }
    return this.service.getPaymentHistoryByGymId(gymId, {
      page: page ? parseInt(page, 10) : undefined,
      limit: limit ? parseInt(limit, 10) : undefined,
      status,
      startDate,
      endDate,
    });
  }

  @Get('payments')
  @Roles('superadmin')
  @ApiOperation({ summary: 'Get all payment history (superadmin)' })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  @ApiQuery({ name: 'gymId', required: false, type: Number })
  @ApiQuery({ name: 'subscriptionId', required: false, type: Number })
  @ApiQuery({ name: 'status', required: false, type: String })
  @ApiQuery({ name: 'gateway', required: false, type: String })
  @ApiQuery({ name: 'startDate', required: false, type: String })
  @ApiQuery({ name: 'endDate', required: false, type: String })
  getAllPaymentHistory(
    @Query('page') page?: string,
    @Query('limit') limit?: string,
    @Query('gymId') gymId?: string,
    @Query('subscriptionId') subscriptionId?: string,
    @Query('status') status?: string,
    @Query('gateway') gateway?: string,
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
  ) {
    return this.service.getPaymentHistory({
      page: page ? parseInt(page, 10) : undefined,
      limit: limit ? parseInt(limit, 10) : undefined,
      gymId: gymId ? parseInt(gymId, 10) : undefined,
      subscriptionId: subscriptionId ? parseInt(subscriptionId, 10) : undefined,
      status,
      gateway,
      startDate,
      endDate,
    });
  }

  @Get('payments/stats')
  @Roles('superadmin')
  @ApiOperation({ summary: 'Get payment statistics' })
  @ApiQuery({ name: 'gymId', required: false, type: Number })
  getPaymentStats(@Query('gymId') gymId?: string) {
    return this.service.getPaymentStats(gymId ? parseInt(gymId, 10) : undefined);
  }

  @Get('payments/:id')
  @Roles('superadmin', 'admin')
  @ApiOperation({ summary: 'Get payment by ID' })
  getPaymentById(@Param('id', ParseIntPipe) id: number) {
    return this.service.getPaymentById(id);
  }

  @Get(':id/payment-history')
  @Roles('superadmin')
  @ApiOperation({ summary: 'Get payment history for a subscription' })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  @ApiQuery({ name: 'status', required: false, type: String })
  getSubscriptionPaymentHistory(
    @Param('id', ParseIntPipe) id: number,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
    @Query('status') status?: string,
  ) {
    return this.service.getPaymentHistoryBySubscriptionId(id, {
      page: page ? parseInt(page, 10) : undefined,
      limit: limit ? parseInt(limit, 10) : undefined,
      status,
    });
  }

  @Post(':id/payments')
  @Roles('superadmin')
  @ApiOperation({ summary: 'Record a payment for a subscription' })
  createPayment(
    @Param('id', ParseIntPipe) subscriptionId: number,
    @Body() dto: CreatePaymentHistoryDto,
  ) {
    return this.service.createPaymentHistory({
      ...dto,
      subscriptionId,
    });
  }

  @Patch('payments/:id')
  @Roles('superadmin')
  @ApiOperation({ summary: 'Update a payment record' })
  updatePayment(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdatePaymentHistoryDto,
  ) {
    return this.service.updatePaymentHistory(id, dto);
  }
}
