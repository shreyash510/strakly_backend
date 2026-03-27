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
import { Roles } from '../auth/decorators/roles.decorator';
import { GymId } from '../common/decorators/gym-id.decorator';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { ManagerPermissionsGuard } from '../auth/guards/manager-permissions.guard';
import { ManagerPermission } from '../auth/decorators/manager-permission.decorator';

@ApiTags('referrals')
@Controller('referrals')
@UseGuards(JwtAuthGuard, RolesGuard)
@ApiBearerAuth()
export class ReferralsController {
  constructor(private readonly referralsService: ReferralsService) {}

  @Get()
  @Roles('admin', 'manager')
  @ApiOperation({ summary: 'List all referrals' })
  async findAll(
    @GymId() gymId: number,
    @Query() filters: ReferralFiltersDto,
  ) {
    return this.referralsService.findAll(gymId, filters);
  }

  @Get('stats')
  @Roles('admin', 'manager')
  @ApiOperation({ summary: 'Get referral statistics' })
  async getStats(
    @GymId() gymId: number,
  ) {
    return this.referralsService.getStats(gymId);
  }

  @Get('user/:userId')
  @Roles('admin', 'manager', 'trainer')
  @ApiOperation({ summary: 'Get referrals for a specific user' })
  async findByUser(
    @Param('userId', ParseIntPipe) userId: number,
    @GymId() gymId: number,
  ) {
    return this.referralsService.findByUser(userId, gymId);
  }

  @Post()
  @Roles('admin', 'manager')
  @UseGuards(ManagerPermissionsGuard)
  @ManagerPermission('referrals', 'create')
  @ApiOperation({ summary: 'Create a referral' })
  async create(
    @Body() dto: CreateReferralDto,
    @GymId() gymId: number,
  ) {
    return this.referralsService.create(gymId, dto);
  }

  @Patch(':id')
  @Roles('admin', 'manager')
  @UseGuards(ManagerPermissionsGuard)
  @ManagerPermission('referrals', 'update')
  @ApiOperation({ summary: 'Update a referral' })
  async update(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateReferralDto,
    @GymId() gymId: number,
  ) {
    return this.referralsService.update(id, gymId, dto);
  }

  @Patch(':id/reward')
  @Roles('admin')
  @ApiOperation({ summary: 'Mark a referral as rewarded' })
  async markRewarded(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: RewardReferralDto,
    @GymId() gymId: number,
  ) {
    return this.referralsService.markRewarded(id, gymId, dto.rewardType, dto.rewardAmount);
  }
}
