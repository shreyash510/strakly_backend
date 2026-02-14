import {
  IsString,
  IsOptional,
  IsNumber,
  IsBoolean,
  IsNotEmpty,
} from 'class-validator';
import { Type } from 'class-transformer';

// ─── Config ───

export class UpdateLoyaltyConfigDto {
  @IsOptional()
  @IsBoolean()
  isEnabled?: boolean;

  @IsOptional()
  @IsNumber()
  @Type(() => Number)
  pointsPerVisit?: number;

  @IsOptional()
  @IsNumber()
  @Type(() => Number)
  pointsPerAttendance?: number;

  @IsOptional()
  @IsNumber()
  @Type(() => Number)
  pointsPerReferral?: number;

  @IsOptional()
  @IsNumber()
  @Type(() => Number)
  pointsPerPurchaseUnit?: number;

  @IsOptional()
  @IsNumber()
  @Type(() => Number)
  pointsPerPurchase?: number;

  @IsOptional()
  @IsNumber()
  @Type(() => Number)
  pointsPerClassBooking?: number;

  @IsOptional()
  @IsNumber()
  @Type(() => Number)
  pointExpiryDays?: number;

  @IsOptional()
  @IsNumber()
  @Type(() => Number)
  pointsExpiry?: number;
}

// ─── Tiers ───

export class CreateLoyaltyTierDto {
  @IsString()
  @IsNotEmpty()
  name: string;

  @IsNumber()
  @Type(() => Number)
  minPoints: number;

  @IsOptional()
  @IsNumber()
  @Type(() => Number)
  multiplier?: number;

  @IsOptional()
  benefits?: any;

  @IsOptional()
  @IsString()
  icon?: string;

  @IsOptional()
  @IsString()
  color?: string;

  @IsOptional()
  @IsNumber()
  @Type(() => Number)
  displayOrder?: number;

  @IsOptional()
  @IsNumber()
  @Type(() => Number)
  sortOrder?: number;
}

export class UpdateLoyaltyTierDto {
  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsNumber()
  @Type(() => Number)
  minPoints?: number;

  @IsOptional()
  @IsNumber()
  @Type(() => Number)
  multiplier?: number;

  @IsOptional()
  benefits?: any;

  @IsOptional()
  @IsString()
  icon?: string;

  @IsOptional()
  @IsString()
  color?: string;

  @IsOptional()
  @IsNumber()
  @Type(() => Number)
  displayOrder?: number;

  @IsOptional()
  @IsNumber()
  @Type(() => Number)
  sortOrder?: number;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

// ─── Points ───

export class AdjustPointsDto {
  @IsNumber()
  @Type(() => Number)
  userId: number;

  @IsNumber()
  @Type(() => Number)
  points: number;

  @IsString()
  @IsNotEmpty()
  description: string;
}

// ─── Rewards ───

export class CreateRewardDto {
  @IsString()
  @IsNotEmpty()
  name: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsNumber()
  @Type(() => Number)
  pointsCost: number;

  @IsOptional()
  @IsString()
  rewardType?: string;

  @IsOptional()
  @IsString()
  category?: string;

  @IsOptional()
  rewardValue?: any;

  @IsOptional()
  @IsNumber()
  @Type(() => Number)
  stock?: number;

  @IsOptional()
  @IsNumber()
  @Type(() => Number)
  maxPerUser?: number;
}

export class UpdateRewardDto {
  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsNumber()
  @Type(() => Number)
  pointsCost?: number;

  @IsOptional()
  @IsString()
  rewardType?: string;

  @IsOptional()
  @IsString()
  category?: string;

  @IsOptional()
  rewardValue?: any;

  @IsOptional()
  @IsNumber()
  @Type(() => Number)
  stock?: number;

  @IsOptional()
  @IsNumber()
  @Type(() => Number)
  maxPerUser?: number;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

// ─── Filters ───

export class LoyaltyFiltersDto {
  @IsOptional()
  @IsNumber()
  @Type(() => Number)
  page?: number;

  @IsOptional()
  @IsNumber()
  @Type(() => Number)
  limit?: number;
}
