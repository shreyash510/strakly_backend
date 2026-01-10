import { PartialType } from '@nestjs/mapped-types';
import { CreateRewardDto } from './create-reward.dto';
import { IsEnum, IsOptional } from 'class-validator';

export enum RewardStatus {
  IN_PROGRESS = 'in_progress',
  COMPLETED = 'completed',
  FAILED = 'failed',
  CLAIMED = 'claimed',
}

export class UpdateRewardDto extends PartialType(CreateRewardDto) {
  @IsEnum(RewardStatus)
  @IsOptional()
  status?: RewardStatus;
}
