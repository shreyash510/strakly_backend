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
import { GamificationService } from './gamification.service';
import {
  CreateChallengeDto,
  UpdateChallengeDto,
  ChallengeFiltersDto,
  CreateAchievementDto,
  UpdateAchievementDto,
} from './dto/gamification.dto';
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

@ApiTags('gamification')
@Controller('gamification')
@UseGuards(JwtAuthGuard, RolesGuard, PlanFeaturesGuard)
@PlanFeatures(PLAN_FEATURES.GAMIFICATION)
@ApiBearerAuth()
export class GamificationController {
  constructor(
    private readonly gamificationService: GamificationService,
  ) {}

  // ─── Challenges ───

  @Get('challenges')
  @Roles('admin', 'branch_admin', 'manager', 'trainer', 'client')
  @ApiOperation({ summary: 'Get all challenges' })
  async findAllChallenges(
    @GymId() gymId: number,
    @OptionalBranchId() branchId: number | null,
    @Query() filters: ChallengeFiltersDto,
  ) {
    return this.gamificationService.findAllChallenges(gymId, branchId, filters);
  }

  @Get('challenges/:id')
  @Roles('admin', 'branch_admin', 'manager', 'trainer', 'client')
  @ApiOperation({ summary: 'Get a challenge by ID' })
  async findOneChallenge(
    @Param('id', ParseIntPipe) id: number,
    @GymId() gymId: number,
  ) {
    return this.gamificationService.findOneChallenge(id, gymId);
  }

  @Post('challenges')
  @Roles('admin', 'branch_admin')
  @ApiOperation({ summary: 'Create a challenge' })
  async createChallenge(
    @Body() dto: CreateChallengeDto,
    @GymId() gymId: number,
    @OptionalBranchId() branchId: number | null,
    @UserId() userId: number,
  ) {
    return this.gamificationService.createChallenge(dto, gymId, branchId, userId);
  }

  @Patch('challenges/:id')
  @Roles('admin', 'branch_admin')
  @ApiOperation({ summary: 'Update a challenge' })
  async updateChallenge(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateChallengeDto,
    @GymId() gymId: number,
  ) {
    return this.gamificationService.updateChallenge(id, gymId, dto);
  }

  @Delete('challenges/:id')
  @Roles('admin', 'branch_admin')
  @ApiOperation({ summary: 'Soft delete a challenge' })
  async deleteChallenge(
    @Param('id', ParseIntPipe) id: number,
    @GymId() gymId: number,
  ) {
    return this.gamificationService.softDeleteChallenge(id, gymId);
  }

  @Post('challenges/:id/join')
  @Roles('client', 'trainer')
  @ApiOperation({ summary: 'Join a challenge' })
  async joinChallenge(
    @Param('id', ParseIntPipe) id: number,
    @UserId() userId: number,
    @GymId() gymId: number,
  ) {
    return this.gamificationService.joinChallenge(id, userId, gymId);
  }

  @Get('challenges/:id/leaderboard')
  @Roles('admin', 'branch_admin', 'manager', 'trainer', 'client')
  @ApiOperation({ summary: 'Get challenge leaderboard' })
  async getLeaderboard(
    @Param('id', ParseIntPipe) id: number,
    @GymId() gymId: number,
  ) {
    return this.gamificationService.getLeaderboard(id, gymId);
  }

  // ─── Achievements ───

  @Get('achievements')
  @Roles('admin', 'branch_admin', 'manager', 'trainer', 'client')
  @ApiOperation({ summary: 'Get all achievements' })
  async findAllAchievements(@GymId() gymId: number) {
    return this.gamificationService.findAllAchievements(gymId);
  }

  @Post('achievements')
  @Roles('admin', 'branch_admin')
  @ApiOperation({ summary: 'Create an achievement' })
  async createAchievement(
    @Body() dto: CreateAchievementDto,
    @GymId() gymId: number,
  ) {
    return this.gamificationService.createAchievement(dto, gymId);
  }

  @Get('achievements/me')
  @Roles('client', 'trainer')
  @ApiOperation({ summary: 'Get my achievements' })
  async getMyAchievements(
    @UserId() userId: number,
    @GymId() gymId: number,
  ) {
    return this.gamificationService.getMyAchievements(userId, gymId);
  }

  @Get('achievements/user/:userId')
  @Roles('admin', 'branch_admin', 'manager', 'trainer')
  @ApiOperation({ summary: 'Get achievements for a specific user' })
  async getUserAchievements(
    @Param('userId', ParseIntPipe) userId: number,
    @GymId() gymId: number,
  ) {
    return this.gamificationService.getUserAchievements(userId, gymId);
  }

  @Patch('achievements/:id')
  @Roles('admin', 'branch_admin')
  @ApiOperation({ summary: 'Update an achievement' })
  async updateAchievement(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateAchievementDto,
    @GymId() gymId: number,
  ) {
    return this.gamificationService.updateAchievement(id, gymId, dto);
  }

  @Delete('achievements/:id')
  @Roles('admin', 'branch_admin')
  @ApiOperation({ summary: 'Soft delete an achievement' })
  async deleteAchievement(
    @Param('id', ParseIntPipe) id: number,
    @GymId() gymId: number,
  ) {
    return this.gamificationService.softDeleteAchievement(id, gymId);
  }

  // ─── Streaks ───

  @Get('streaks/me')
  @Roles('client', 'trainer')
  @ApiOperation({ summary: 'Get my streaks' })
  async getMyStreaks(
    @UserId() userId: number,
    @GymId() gymId: number,
  ) {
    return this.gamificationService.getUserStreaks(userId, gymId);
  }

  @Get('streaks/user/:userId')
  @Roles('admin', 'branch_admin', 'manager', 'trainer')
  @ApiOperation({ summary: 'Get streaks for a specific user' })
  async getUserStreaks(
    @Param('userId', ParseIntPipe) userId: number,
    @GymId() gymId: number,
  ) {
    return this.gamificationService.getUserStreaks(userId, gymId);
  }

  // ─── Summary & Stats ───

  @Get('me/summary')
  @Roles('client', 'trainer')
  @ApiOperation({ summary: 'Get my gamification summary' })
  async getMySummary(
    @UserId() userId: number,
    @GymId() gymId: number,
  ) {
    return this.gamificationService.getMySummary(userId, gymId);
  }

  @Get('stats')
  @Roles('admin', 'branch_admin')
  @ApiOperation({ summary: 'Get gamification stats' })
  async getStats(
    @GymId() gymId: number,
    @OptionalBranchId() branchId: number | null,
  ) {
    return this.gamificationService.getStats(gymId, branchId);
  }
}
