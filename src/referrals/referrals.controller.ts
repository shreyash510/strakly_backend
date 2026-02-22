import {
  Controller,
  Get,
  Post,
  Patch,
  Body,
  Param,
  Query,
  UseGuards,
  ParseIntPipe,
} from '@nestjs/common';
import { ReferralsService } from './referrals.service';
import {
  CreateReferralDto,
  UpdateReferralDto,
  RewardReferralDto,
  ReferralFiltersDto,
} from './dto/referral.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { PlanFeaturesGuard } from '../auth/guards/plan-features.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { PlanFeatures } from '../auth/decorators/plan-features.decorator';
import { PLAN_FEATURES } from '../common/constants/features';
import { GymId } from '../common/decorators/gym-id.decorator';
import { OptionalBranchId } from '../common/decorators/branch-id.decorator';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';

@ApiTags('referrals')
@Controller('referrals')
@UseGuards(JwtAuthGuard, RolesGuard, PlanFeaturesGuard)
@PlanFeatures(PLAN_FEATURES.REFERRAL_TRACKING)
@ApiBearerAuth()
export class ReferralsController {
  constructor(private readonly referralsService: ReferralsService) {}

  @Get()
  @Roles('admin', 'branch_admin', 'manager')
  @ApiOperation({ summary: 'List all referrals' })
  async findAll(
    @GymId() gymId: number,
    @OptionalBranchId() branchId: number | null,
    @Query() filters: ReferralFiltersDto,
  ) {
    return this.referralsService.findAll(gymId, branchId, filters);
  }

  @Get('stats')
  @Roles('admin', 'branch_admin', 'manager')
  @ApiOperation({ summary: 'Get referral statistics' })
  async getStats(
    @GymId() gymId: number,
    @OptionalBranchId() branchId: number | null,
  ) {
    return this.referralsService.getStats(gymId, branchId);
  }

  @Get('user/:userId')
  @Roles('admin', 'branch_admin', 'manager', 'trainer')
  @ApiOperation({ summary: 'Get referrals for a specific user' })
  async findByUser(
    @Param('userId', ParseIntPipe) userId: number,
    @GymId() gymId: number,
  ) {
    return this.referralsService.findByUser(userId, gymId);
  }

  @Get(':id')
  @Roles('admin', 'branch_admin', 'manager')
  @ApiOperation({ summary: 'Get a referral by ID' })
  async findOne(
    @Param('id', ParseIntPipe) id: number,
    @GymId() gymId: number,
  ) {
    return this.referralsService.findOne(id, gymId);
  }

  @Post()
  @Roles('admin', 'branch_admin', 'manager')
  @ApiOperation({ summary: 'Create a referral' })
  async create(
    @Body() dto: CreateReferralDto,
    @GymId() gymId: number,
    @OptionalBranchId() branchId: number | null,
  ) {
    return this.referralsService.create(gymId, branchId, dto);
  }

  @Patch(':id')
  @Roles('admin', 'branch_admin', 'manager')
  @ApiOperation({ summary: 'Update a referral' })
  async update(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateReferralDto,
    @GymId() gymId: number,
  ) {
    return this.referralsService.update(id, gymId, dto);
  }

  @Patch(':id/reward')
  @Roles('admin', 'branch_admin')
  @ApiOperation({ summary: 'Mark a referral as rewarded' })
  async markRewarded(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: RewardReferralDto,
    @GymId() gymId: number,
  ) {
    return this.referralsService.markRewarded(id, gymId, dto.rewardType, dto.rewardAmount);
  }
}
