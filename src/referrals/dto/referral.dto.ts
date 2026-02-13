import {
  IsString,
  IsOptional,
  IsNumber,
  IsEnum,
  IsNotEmpty,
} from 'class-validator';
import { Type } from 'class-transformer';

export enum ReferralStatus {
  PENDING = 'pending',
  CONVERTED = 'converted',
  REWARDED = 'rewarded',
  EXPIRED = 'expired',
}

export enum RewardType {
  DISCOUNT = 'discount',
  FREE_DAYS = 'free_days',
  CASH = 'cash',
  CREDIT = 'credit',
}

export class CreateReferralDto {
  @IsNumber()
  @Type(() => Number)
  referrerId: number;

  @IsOptional()
  @IsNumber()
  @Type(() => Number)
  referredId?: number;

  @IsOptional()
  @IsString()
  referralCode?: string;

  @IsOptional()
  @IsString()
  notes?: string;
}

export class UpdateReferralDto {
  @IsOptional()
  @IsEnum(ReferralStatus)
  status?: ReferralStatus;

  @IsOptional()
  @IsNumber()
  @Type(() => Number)
  referredId?: number;

  @IsOptional()
  @IsEnum(RewardType)
  rewardType?: RewardType;

  @IsOptional()
  @IsNumber()
  @Type(() => Number)
  rewardAmount?: number;

  @IsOptional()
  @IsString()
  notes?: string;
}

export class RewardReferralDto {
  @IsEnum(RewardType)
  rewardType: RewardType;

  @IsNumber()
  @Type(() => Number)
  rewardAmount: number;
}

export class ReferralFiltersDto {
  @IsOptional()
  @IsString()
  status?: string;

  @IsOptional()
  @IsNumber()
  @Type(() => Number)
  referrerId?: number;

  @IsOptional()
  @IsNumber()
  @Type(() => Number)
  page?: number;

  @IsOptional()
  @IsNumber()
  @Type(() => Number)
  limit?: number;
}
