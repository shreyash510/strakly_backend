import {
  IsString,
  IsNotEmpty,
  MaxLength,
  IsNumber,
  IsEnum,
  IsOptional,
  Min,
  Max,
} from 'class-validator';

export enum RewardStatus {
  IN_PROGRESS = 'in_progress',
  COMPLETED = 'completed',
  FAILED = 'failed',
  CLAIMED = 'claimed',
}

export enum RewardCategory {
  HABIT = 'habit',
  TASK = 'task',
  GOAL = 'goal',
}

export class CreateRewardDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  challenge: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  reward: string;

  @IsNumber()
  @Min(1)
  @Max(365)
  targetStreak: number;

  @IsEnum(RewardCategory)
  @IsOptional()
  category?: RewardCategory;

  @IsString()
  @IsOptional()
  linkedItemId?: string;

  @IsString()
  @MaxLength(200)
  @IsOptional()
  linkedItemName?: string;
}
