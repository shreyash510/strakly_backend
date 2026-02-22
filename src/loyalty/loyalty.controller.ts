import {
  Controller,
  Get,
  Post,
  Put,
  Patch,
  Delete,
  Body,
  Param,
  Query,
  UseGuards,
  ParseIntPipe,
} from '@nestjs/common';
import { LoyaltyService } from './loyalty.service';
import {
  UpdateLoyaltyConfigDto,
  CreateLoyaltyTierDto,
  UpdateLoyaltyTierDto,
  AdjustPointsDto,
  CreateRewardDto,
  UpdateRewardDto,
  LoyaltyFiltersDto,
} from './dto/loyalty.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { PlanFeaturesGuard } from '../auth/guards/plan-features.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { PlanFeatures } from '../auth/decorators/plan-features.decorator';
import { GymId } from '../common/decorators/gym-id.decorator';
import { OptionalBranchId } from '../common/decorators/branch-id.decorator';
import { UserId } from '../common/decorators/user-id.decorator';
import { PLAN_FEATURES } from '../common/constants/features';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';

@ApiTags('loyalty')
@Controller('loyalty')
@UseGuards(JwtAuthGuard, RolesGuard, PlanFeaturesGuard)
@PlanFeatures(PLAN_FEATURES.LOYALTY_PROGRAM)
@ApiBearerAuth()
export class LoyaltyController {
  constructor(private readonly loyaltyService: LoyaltyService) {}

  // ─── Config ───

  @Get('config')
  @Roles('admin', 'branch_admin')
  @ApiOperation({ summary: 'Get loyalty configuration' })
  async getConfig(
    @GymId() gymId: number,
    @OptionalBranchId() branchId: number | null,
  ) {
    return this.loyaltyService.getConfig(gymId, branchId);
  }

  @Put('config')
  @Roles('admin')
  @ApiOperation({ summary: 'Update loyalty configuration' })
  async updateConfig(
    @GymId() gymId: number,
    @OptionalBranchId() branchId: number | null,
    @Body() dto: UpdateLoyaltyConfigDto,
  ) {
    return this.loyaltyService.updateConfig(gymId, branchId, dto);
  }

  // ─── Tiers ───

  @Get('tiers')
  @Roles('admin', 'branch_admin', 'manager', 'trainer', 'client')
  @ApiOperation({ summary: 'Get all loyalty tiers' })
  async getTiers(
    @GymId() gymId: number,
    @OptionalBranchId() branchId: number | null,
  ) {
    return this.loyaltyService.getTiers(gymId, branchId);
  }

  @Post('tiers')
  @Roles('admin')
  @ApiOperation({ summary: 'Create a loyalty tier' })
  async createTier(
    @GymId() gymId: number,
    @OptionalBranchId() branchId: number | null,
    @Body() dto: CreateLoyaltyTierDto,
  ) {
    return this.loyaltyService.createTier(gymId, branchId, dto);
  }

  @Patch('tiers/:id')
  @Roles('admin')
  @ApiOperation({ summary: 'Update a loyalty tier' })
  async updateTier(
    @Param('id', ParseIntPipe) id: number,
    @GymId() gymId: number,
    @Body() dto: UpdateLoyaltyTierDto,
  ) {
    return this.loyaltyService.updateTier(gymId, id, dto);
  }

  @Delete('tiers/:id')
  @Roles('admin')
  @ApiOperation({ summary: 'Delete a loyalty tier' })
  async deleteTier(
    @Param('id', ParseIntPipe) id: number,
    @GymId() gymId: number,
  ) {
    return this.loyaltyService.deleteTier(gymId, id);
  }

  // ─── Points ───

  @Get('points/me')
  @Roles('client', 'trainer')
  @ApiOperation({ summary: 'Get my loyalty points' })
  async getMyPoints(
    @UserId() userId: number,
    @GymId() gymId: number,
  ) {
    return this.loyaltyService.getMyPoints(userId, gymId);
  }

  @Get('points/user/:userId')
  @Roles('admin', 'branch_admin', 'manager')
  @ApiOperation({ summary: 'Get loyalty points for a specific user' })
  async getUserPoints(
    @Param('userId', ParseIntPipe) userId: number,
    @GymId() gymId: number,
  ) {
    return this.loyaltyService.getUserPoints(userId, gymId);
  }

  @Get('points/leaderboard')
  @Roles('admin', 'branch_admin', 'manager', 'trainer', 'client')
  @ApiOperation({ summary: 'Get loyalty points leaderboard' })
  async getLeaderboard(
    @GymId() gymId: number,
    @OptionalBranchId() branchId: number | null,
    @Query('limit') limit?: string,
  ) {
    const parsedLimit = limit ? parseInt(limit, 10) : 20;
    return this.loyaltyService.getLeaderboard(gymId, branchId, parsedLimit);
  }

  @Post('points/adjust')
  @Roles('admin', 'branch_admin')
  @ApiOperation({ summary: 'Manually adjust points for a user' })
  async adjustPoints(
    @GymId() gymId: number,
    @UserId() adminUserId: number,
    @Body() dto: AdjustPointsDto,
  ) {
    return this.loyaltyService.adjustPoints(gymId, dto, adminUserId);
  }

  // ─── Transactions ───

  @Get('transactions/me')
  @Roles('client', 'trainer')
  @ApiOperation({ summary: 'Get my loyalty transactions' })
  async getMyTransactions(
    @UserId() userId: number,
    @GymId() gymId: number,
    @Query() filters: LoyaltyFiltersDto,
  ) {
    return this.loyaltyService.getMyTransactions(userId, gymId, filters);
  }

  @Get('transactions/user/:userId')
  @Roles('admin', 'branch_admin', 'manager')
  @ApiOperation({ summary: 'Get loyalty transactions for a specific user' })
  async getUserTransactions(
    @Param('userId', ParseIntPipe) userId: number,
    @GymId() gymId: number,
    @Query() filters: LoyaltyFiltersDto,
  ) {
    return this.loyaltyService.getUserTransactions(userId, gymId, filters);
  }

  // ─── Rewards ───

  @Get('rewards')
  @Roles('admin', 'branch_admin', 'manager', 'trainer', 'client')
  @ApiOperation({ summary: 'Get all available rewards' })
  async getRewards(
    @GymId() gymId: number,
    @OptionalBranchId() branchId: number | null,
  ) {
    return this.loyaltyService.getRewards(gymId, branchId);
  }

  @Post('rewards')
  @Roles('admin', 'branch_admin')
  @ApiOperation({ summary: 'Create a reward' })
  async createReward(
    @GymId() gymId: number,
    @OptionalBranchId() branchId: number | null,
    @Body() dto: CreateRewardDto,
  ) {
    return this.loyaltyService.createReward(gymId, branchId, dto);
  }

  @Patch('rewards/:id')
  @Roles('admin', 'branch_admin')
  @ApiOperation({ summary: 'Update a reward' })
  async updateReward(
    @Param('id', ParseIntPipe) id: number,
    @GymId() gymId: number,
    @Body() dto: UpdateRewardDto,
  ) {
    return this.loyaltyService.updateReward(gymId, id, dto);
  }

  @Delete('rewards/:id')
  @Roles('admin', 'branch_admin')
  @ApiOperation({ summary: 'Soft-delete a reward' })
  async deleteReward(
    @Param('id', ParseIntPipe) id: number,
    @GymId() gymId: number,
  ) {
    return this.loyaltyService.softDeleteReward(gymId, id);
  }

  @Post('rewards/:id/redeem')
  @Roles('client', 'trainer')
  @ApiOperation({ summary: 'Redeem a reward using loyalty points' })
  async redeemReward(
    @Param('id', ParseIntPipe) id: number,
    @UserId() userId: number,
    @GymId() gymId: number,
  ) {
    return this.loyaltyService.redeemReward(id, userId, gymId);
  }

  // ─── Dashboard ───

  @Get('dashboard')
  @Roles('admin', 'branch_admin')
  @ApiOperation({ summary: 'Get loyalty program dashboard analytics' })
  async getDashboard(
    @GymId() gymId: number,
    @OptionalBranchId() branchId: number | null,
  ) {
    return this.loyaltyService.getDashboard(gymId, branchId);
  }
}
