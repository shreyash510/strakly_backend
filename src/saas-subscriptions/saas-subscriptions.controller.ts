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
  InitiateManualPaymentDto,
} from './dto/saas-subscriptions.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { NotificationsGateway } from '../notifications/notifications.gateway';
import type { AuthenticatedRequest } from '../common/types';

@ApiTags('saas-subscriptions')
@Controller('saas-subscriptions')
@UseGuards(JwtAuthGuard, RolesGuard)
@ApiBearerAuth()
export class SaasSubscriptionsController {
  constructor(
    private readonly service: SaasSubscriptionsService,
    private readonly notificationsGateway: NotificationsGateway,
  ) {}

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
  async createPlan(@Body() dto: CreateSaasPlanDto) {
    const result = await this.service.createPlan(dto);
    this.notificationsGateway.emitSaasSubscriptionChanged({ action: 'plan_created' });
    return result;
  }

  @Patch('plans/:id')
  @Roles('superadmin')
  @ApiOperation({ summary: 'Update a SaaS plan' })
  async updatePlan(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateSaasPlanDto,
  ) {
    const result = await this.service.updatePlan(id, dto);
    this.notificationsGateway.emitSaasSubscriptionChanged({ action: 'plan_updated' });
    return result;
  }

  @Delete('plans/:id')
  @Roles('superadmin')
  @ApiOperation({ summary: 'Delete a SaaS plan' })
  async deletePlan(@Param('id', ParseIntPipe) id: number) {
    const result = await this.service.deletePlan(id);
    this.notificationsGateway.emitSaasSubscriptionChanged({ action: 'plan_deleted' });
    return result;
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
  getMySubscription(@Request() req: AuthenticatedRequest) {
    const gymId = req.user.gymId;
    if (!gymId) {
      throw new BadRequestException('No gym associated with this account');
    }
    return this.service.findSubscriptionByGymId(gymId);
  }

  @Get('me/payment-history')
  @Roles('superadmin', 'admin')
  @ApiOperation({ summary: 'Get payment history for current gym' })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  @ApiQuery({ name: 'status', required: false, type: String })
  @ApiQuery({ name: 'startDate', required: false, type: String })
  @ApiQuery({ name: 'endDate', required: false, type: String })
  getMyPaymentHistory(
    @Request() req: AuthenticatedRequest,
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

  @Post('me/initiate-payment')
  @Roles('admin')
  @ApiOperation({ summary: 'Initiate manual payment for subscription (admin)' })
  async initiatePayment(
    @Request() req: AuthenticatedRequest,
    @Body() dto: InitiateManualPaymentDto,
  ) {
    const gymId = req.user.gymId;
    if (!gymId) {
      throw new BadRequestException('No gym associated with this account');
    }
    const result = await this.service.initiateManualPayment(gymId, dto);
    this.notificationsGateway.emitSaasSubscriptionChanged({ action: 'payment_initiated' });
    return result;
  }

  // ============================================
  // Payment History Endpoints (static routes before :id)
  // ============================================

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

  @Post('payments/:id/approve')
  @Roles('superadmin')
  @ApiOperation({ summary: 'Approve a pending payment and activate subscription' })
  async approvePayment(@Param('id', ParseIntPipe) id: number) {
    const result = await this.service.approvePayment(id);
    this.notificationsGateway.emitSaasSubscriptionChanged({ action: 'payment_approved' });
    return result;
  }

  @Patch('payments/:id')
  @Roles('superadmin')
  @ApiOperation({ summary: 'Update a payment record' })
  async updatePayment(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdatePaymentHistoryDto,
  ) {
    const result = await this.service.updatePaymentHistory(id, dto);
    this.notificationsGateway.emitSaasSubscriptionChanged({ action: 'payment_updated' });
    return result;
  }

  @Get('gym/:gymId')
  @Roles('superadmin')
  @ApiOperation({ summary: 'Get subscription by gym ID' })
  findSubscriptionByGymId(@Param('gymId', ParseIntPipe) gymId: number) {
    return this.service.findSubscriptionByGymId(gymId);
  }

  // ============================================
  // Wildcard :id routes (MUST be last)
  // ============================================

  @Get(':id')
  @Roles('superadmin')
  @ApiOperation({ summary: 'Get a gym subscription by ID' })
  findSubscriptionById(@Param('id', ParseIntPipe) id: number) {
    return this.service.findSubscriptionById(id);
  }

  @Post()
  @Roles('superadmin')
  @ApiOperation({ summary: 'Create a gym subscription' })
  async createSubscription(@Body() dto: CreateGymSubscriptionDto) {
    const result = await this.service.createSubscription(dto);
    this.notificationsGateway.emitSaasSubscriptionChanged({ action: 'subscription_created' });
    return result;
  }

  @Patch(':id')
  @Roles('superadmin')
  @ApiOperation({ summary: 'Update a gym subscription' })
  async updateSubscription(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateGymSubscriptionDto,
  ) {
    const result = await this.service.updateSubscription(id, dto);
    this.notificationsGateway.emitSaasSubscriptionChanged({ action: 'subscription_updated' });
    return result;
  }

  @Post(':id/cancel')
  @Roles('superadmin')
  @ApiOperation({ summary: 'Cancel a gym subscription' })
  async cancelSubscription(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: CancelSubscriptionDto,
  ) {
    const result = await this.service.cancelSubscription(id, dto);
    this.notificationsGateway.emitSaasSubscriptionChanged({ action: 'subscription_cancelled' });
    return result;
  }

  @Post(':id/payments')
  @Roles('superadmin')
  @ApiOperation({ summary: 'Record a payment for a subscription' })
  async createPayment(
    @Param('id', ParseIntPipe) subscriptionId: number,
    @Body() dto: CreatePaymentHistoryDto,
  ) {
    const result = await this.service.createPaymentHistory({
      ...dto,
      subscriptionId,
    });
    this.notificationsGateway.emitSaasSubscriptionChanged({ action: 'payment_recorded' });
    return result;
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
}
