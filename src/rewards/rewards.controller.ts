import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
  UseGuards,
} from '@nestjs/common';
import { RewardsService } from './rewards.service';
import { CreateRewardDto } from './dto/create-reward.dto';
import { UpdateRewardDto } from './dto/update-reward.dto';
import { JwtAuthGuard } from '../auth/guards';
import { CurrentUser } from '../auth/decorators';

@Controller('rewards')
@UseGuards(JwtAuthGuard)
export class RewardsController {
  constructor(private readonly rewardsService: RewardsService) {}

  @Get()
  findAll(@CurrentUser() user: any) {
    return this.rewardsService.findAll(user.userId);
  }

  @Get(':id')
  findOne(@CurrentUser() user: any, @Param('id') id: string) {
    return this.rewardsService.findOne(user.userId, id);
  }

  @Post()
  create(@CurrentUser() user: any, @Body() createRewardDto: CreateRewardDto) {
    return this.rewardsService.create(user.userId, createRewardDto);
  }

  @Patch(':id')
  update(
    @CurrentUser() user: any,
    @Param('id') id: string,
    @Body() updateRewardDto: UpdateRewardDto,
  ) {
    return this.rewardsService.update(user.userId, id, updateRewardDto);
  }

  @Patch(':id/increment-streak')
  incrementStreak(@CurrentUser() user: any, @Param('id') id: string) {
    return this.rewardsService.incrementStreak(user.userId, id);
  }

  @Patch(':id/reset-streak')
  resetStreak(@CurrentUser() user: any, @Param('id') id: string) {
    return this.rewardsService.resetStreak(user.userId, id);
  }

  @Patch(':id/complete')
  markCompleted(@CurrentUser() user: any, @Param('id') id: string) {
    return this.rewardsService.markCompleted(user.userId, id);
  }

  @Patch(':id/fail')
  markFailed(@CurrentUser() user: any, @Param('id') id: string) {
    return this.rewardsService.markFailed(user.userId, id);
  }

  @Patch(':id/claim')
  claimReward(@CurrentUser() user: any, @Param('id') id: string) {
    return this.rewardsService.claimReward(user.userId, id);
  }

  @Delete(':id')
  remove(@CurrentUser() user: any, @Param('id') id: string) {
    return this.rewardsService.remove(user.userId, id);
  }
}
