import { PartialType } from '@nestjs/mapped-types';
import { CreateRewardDto, RewardStatus } from './create-reward.dto';
import { IsEnum, IsOptional, IsNumber, IsString, Min } from 'class-validator';

export class UpdateRewardDto extends PartialType(CreateRewardDto) {
  @IsNumber()
  @Min(0)
  @IsOptional()
  currentStreak?: number;

  @IsEnum(RewardStatus)
  @IsOptional()
  status?: RewardStatus;

  @IsString()
  @IsOptional()
  claimedAt?: string;
}
