import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
  Headers,
  UnauthorizedException,
} from '@nestjs/common';
import { RewardsService } from './rewards.service';
import { CreateRewardDto } from './dto/create-reward.dto';
import { UpdateRewardDto } from './dto/update-reward.dto';

@Controller('rewards')
export class RewardsController {
  constructor(private readonly rewardsService: RewardsService) {}

  private getUserId(authHeader: string): string {
    if (!authHeader) {
      throw new UnauthorizedException('User ID header is required');
    }
    return authHeader;
  }

  @Get()
  findAll(@Headers('x-user-id') userId: string) {
    return this.rewardsService.findAll(this.getUserId(userId));
  }

  @Get(':id')
  findOne(@Headers('x-user-id') userId: string, @Param('id') id: string) {
    return this.rewardsService.findOne(this.getUserId(userId), id);
  }

  @Post()
  create(
    @Headers('x-user-id') userId: string,
    @Body() createRewardDto: CreateRewardDto,
  ) {
    return this.rewardsService.create(this.getUserId(userId), createRewardDto);
  }

  @Patch(':id')
  update(
    @Headers('x-user-id') userId: string,
    @Param('id') id: string,
    @Body() updateRewardDto: UpdateRewardDto,
  ) {
    return this.rewardsService.update(
      this.getUserId(userId),
      id,
      updateRewardDto,
    );
  }

  @Patch(':id/complete')
  markCompleted(
    @Headers('x-user-id') userId: string,
    @Param('id') id: string,
  ) {
    return this.rewardsService.markCompleted(this.getUserId(userId), id);
  }

  @Patch(':id/fail')
  markFailed(@Headers('x-user-id') userId: string, @Param('id') id: string) {
    return this.rewardsService.markFailed(this.getUserId(userId), id);
  }

  @Patch(':id/claim')
  claimReward(@Headers('x-user-id') userId: string, @Param('id') id: string) {
    return this.rewardsService.claimReward(this.getUserId(userId), id);
  }

  @Delete(':id')
  remove(@Headers('x-user-id') userId: string, @Param('id') id: string) {
    return this.rewardsService.remove(this.getUserId(userId), id);
  }
}
