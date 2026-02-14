import {
  Controller,
  Get,
  Post,
  Delete,
  Param,
  Query,
  Request,
  Response,
  UseGuards,
  BadRequestException,
  ParseIntPipe,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiBearerAuth,
  ApiQuery,
  ApiParam,
} from '@nestjs/swagger';
import { WearablesService } from './wearables.service';
import { WearableDataFiltersDto } from './dto/wearables.dto';
import type { AuthenticatedRequest } from '../common/types';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { PlanFeaturesGuard } from '../auth/guards/plan-features.guard';
import { PlanFeatures } from '../auth/decorators/plan-features.decorator';
import { PLAN_FEATURES } from '../common/constants/features';
import type { Response as ExpressResponse } from 'express';

@ApiTags('wearables')
@Controller('wearables')
export class WearablesController {
  constructor(private readonly wearablesService: WearablesService) {}

  // ============ PROVIDER INFO ============

  @Get('providers')
  @UseGuards(JwtAuthGuard, PlanFeaturesGuard)
  @PlanFeatures(PLAN_FEATURES.WEARABLE_INTEGRATION)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get list of supported wearable providers' })
  getProviders() {
    return this.wearablesService.getProviders();
  }

  // ============ CONNECTION MANAGEMENT ============

  @Get('connections/me')
  @UseGuards(JwtAuthGuard, RolesGuard, PlanFeaturesGuard)
  @Roles('client', 'trainer')
  @PlanFeatures(PLAN_FEATURES.WEARABLE_INTEGRATION)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get my wearable connections' })
  getMyConnections(@Request() req: AuthenticatedRequest) {
    return this.wearablesService.getMyConnections(
      req.user.userId,
      req.user.gymId!,
    );
  }

  @Get('connect/:provider')
  @UseGuards(JwtAuthGuard, RolesGuard, PlanFeaturesGuard)
  @Roles('client', 'trainer')
  @PlanFeatures(PLAN_FEATURES.WEARABLE_INTEGRATION)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get OAuth authorization URL for a wearable provider' })
  @ApiParam({ name: 'provider', description: 'Provider name (e.g. fitbit, google_fit)' })
  initiateConnection(
    @Request() req: AuthenticatedRequest,
    @Param('provider') provider: string,
  ) {
    return this.wearablesService.initiateConnection(
      provider,
      req.user.gymId!,
      req.user.userId,
    );
  }

  @Get('callback/:provider')
  @ApiOperation({ summary: 'OAuth callback endpoint for wearable providers (public)' })
  @ApiParam({ name: 'provider', description: 'Provider name' })
  @ApiQuery({ name: 'code', required: true, description: 'OAuth authorization code' })
  @ApiQuery({ name: 'state', required: true, description: 'State parameter with encoded gymId and userId' })
  async handleOAuthCallback(
    @Param('provider') provider: string,
    @Query('code') code: string,
    @Query('state') state: string,
    @Response() res: ExpressResponse,
  ) {
    if (!code) {
      throw new BadRequestException('Authorization code is required');
    }
    if (!state) {
      throw new BadRequestException('State parameter is required');
    }

    let stateData: { gymId: number; userId: number };
    try {
      stateData = JSON.parse(Buffer.from(state, 'base64').toString('utf-8'));
    } catch {
      throw new BadRequestException('Invalid state parameter');
    }

    if (!stateData.gymId || !stateData.userId) {
      throw new BadRequestException(
        'Invalid state: missing gymId or userId',
      );
    }

    const baseUrl = process.env.API_BASE_URL || 'http://localhost:3000';
    const redirectUri = `${baseUrl}/wearables/callback/${provider}`;

    const result = await this.wearablesService.handleOAuthCallback(
      provider,
      code,
      stateData.gymId,
      stateData.userId,
      redirectUri,
    );

    // Redirect to the frontend success page
    const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:3001';
    return res.redirect(
      `${frontendUrl}/wearables/connected?provider=${provider}&success=true`,
    );
  }

  @Delete('disconnect/:provider')
  @UseGuards(JwtAuthGuard, RolesGuard, PlanFeaturesGuard)
  @Roles('client', 'trainer')
  @PlanFeatures(PLAN_FEATURES.WEARABLE_INTEGRATION)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Disconnect a wearable provider' })
  @ApiParam({ name: 'provider', description: 'Provider name' })
  disconnectProvider(
    @Request() req: AuthenticatedRequest,
    @Param('provider') provider: string,
  ) {
    return this.wearablesService.disconnectProvider(
      provider,
      req.user.userId,
      req.user.gymId!,
    );
  }

  // ============ DATA SYNC ============

  @Post('sync/:provider')
  @UseGuards(JwtAuthGuard, RolesGuard, PlanFeaturesGuard)
  @Roles('client', 'trainer')
  @PlanFeatures(PLAN_FEATURES.WEARABLE_INTEGRATION)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Manually sync data from a wearable provider' })
  @ApiParam({ name: 'provider', description: 'Provider name' })
  syncData(
    @Request() req: AuthenticatedRequest,
    @Param('provider') provider: string,
  ) {
    return this.wearablesService.syncData(
      provider,
      req.user.userId,
      req.user.gymId!,
    );
  }

  // ============ DATA RETRIEVAL ============

  @Get('data/me')
  @UseGuards(JwtAuthGuard, RolesGuard, PlanFeaturesGuard)
  @Roles('client', 'trainer')
  @PlanFeatures(PLAN_FEATURES.WEARABLE_INTEGRATION)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get my wearable data' })
  @ApiQuery({ name: 'dataType', required: false })
  @ApiQuery({ name: 'provider', required: false })
  @ApiQuery({ name: 'startDate', required: false })
  @ApiQuery({ name: 'endDate', required: false })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  getMyData(
    @Request() req: AuthenticatedRequest,
    @Query() filters: WearableDataFiltersDto,
  ) {
    return this.wearablesService.getMyData(
      req.user.userId,
      req.user.gymId!,
      filters,
    );
  }

  @Get('data/me/summary')
  @UseGuards(JwtAuthGuard, RolesGuard, PlanFeaturesGuard)
  @Roles('client', 'trainer')
  @PlanFeatures(PLAN_FEATURES.WEARABLE_INTEGRATION)
  @ApiBearerAuth()
  @ApiOperation({ summary: "Get today's wearable data summary" })
  getMySummary(@Request() req: AuthenticatedRequest) {
    return this.wearablesService.getMySummary(
      req.user.userId,
      req.user.gymId!,
    );
  }

  @Get('data/me/chart/:dataType')
  @UseGuards(JwtAuthGuard, RolesGuard, PlanFeaturesGuard)
  @Roles('client', 'trainer')
  @PlanFeatures(PLAN_FEATURES.WEARABLE_INTEGRATION)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get chart data for a specific data type' })
  @ApiParam({ name: 'dataType', description: 'Data type (e.g. steps, heart_rate, calories_burned)' })
  @ApiQuery({ name: 'days', required: false, type: Number, description: 'Number of days (default: 30)' })
  getMyChartData(
    @Request() req: AuthenticatedRequest,
    @Param('dataType') dataType: string,
    @Query('days') days?: string,
  ) {
    return this.wearablesService.getChartData(
      req.user.userId,
      req.user.gymId!,
      dataType,
      days ? parseInt(days, 10) : 30,
    );
  }

  // ============ ADMIN ENDPOINTS ============

  @Get('data/user/:userId')
  @UseGuards(JwtAuthGuard, RolesGuard, PlanFeaturesGuard)
  @Roles('admin', 'branch_admin', 'manager', 'trainer')
  @PlanFeatures(PLAN_FEATURES.WEARABLE_INTEGRATION)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get wearable data for a specific user (admin view)' })
  @ApiParam({ name: 'userId', type: Number })
  @ApiQuery({ name: 'dataType', required: false })
  @ApiQuery({ name: 'provider', required: false })
  @ApiQuery({ name: 'startDate', required: false })
  @ApiQuery({ name: 'endDate', required: false })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  getUserData(
    @Request() req: AuthenticatedRequest,
    @Param('userId', ParseIntPipe) userId: number,
    @Query() filters: WearableDataFiltersDto,
  ) {
    return this.wearablesService.getUserData(
      userId,
      req.user.gymId!,
      filters,
    );
  }
}
