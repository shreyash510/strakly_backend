import {
  IsString,
  IsOptional,
  IsNumber,
  IsNotEmpty,
} from 'class-validator';
import { Type } from 'class-transformer';

// ─── Challenge DTOs ───

export class CreateChallengeDto {
  @IsString()
  @IsNotEmpty()
  title: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsString()
  @IsNotEmpty()
  type: string;

  @IsOptional()
  @IsString()
  metric?: string;

  @IsOptional()
  @IsNumber()
  @Type(() => Number)
  goalValue?: number;

  @IsOptional()
  @IsString()
  goalDirection?: string;

  @IsString()
  @IsNotEmpty()
  startDate: string;

  @IsString()
  @IsNotEmpty()
  endDate: string;

  @IsOptional()
  @IsNumber()
  @Type(() => Number)
  maxParticipants?: number;

  @IsOptional()
  @IsNumber()
  @Type(() => Number)
  pointsReward?: number;

  @IsOptional()
  @IsString()
  badgeName?: string;

  @IsOptional()
  @IsString()
  badgeIcon?: string;

  @IsOptional()
  @IsString()
  rules?: string;
}

export class UpdateChallengeDto {
  @IsOptional()
  @IsString()
  title?: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsString()
  type?: string;

  @IsOptional()
  @IsString()
  metric?: string;

  @IsOptional()
  @IsNumber()
  @Type(() => Number)
  goalValue?: number;

  @IsOptional()
  @IsString()
  goalDirection?: string;

  @IsOptional()
  @IsString()
  startDate?: string;

  @IsOptional()
  @IsString()
  endDate?: string;

  @IsOptional()
  @IsNumber()
  @Type(() => Number)
  maxParticipants?: number;

  @IsOptional()
  @IsNumber()
  @Type(() => Number)
  pointsReward?: number;

  @IsOptional()
  @IsString()
  badgeName?: string;

  @IsOptional()
  @IsString()
  badgeIcon?: string;

  @IsOptional()
  @IsString()
  rules?: string;
}

export class ChallengeFiltersDto {
  @IsOptional()
  @IsString()
  status?: string;

  @IsOptional()
  @IsString()
  type?: string;

  @IsOptional()
  @IsNumber()
  @Type(() => Number)
  page?: number;

  @IsOptional()
  @IsNumber()
  @Type(() => Number)
  limit?: number;
}

// ─── Achievement DTOs ───

export class CreateAchievementDto {
  @IsString()
  @IsNotEmpty()
  name: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsString()
  icon?: string;

  @IsString()
  @IsNotEmpty()
  category: string;

  @IsString()
  @IsNotEmpty()
  criteria: string;

  @IsOptional()
  @IsNumber()
  @Type(() => Number)
  pointsValue?: number;
}

export class UpdateAchievementDto {
  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsString()
  icon?: string;

  @IsOptional()
  @IsString()
  category?: string;

  @IsOptional()
  @IsString()
  criteria?: string;

  @IsOptional()
  @IsNumber()
  @Type(() => Number)
  pointsValue?: number;
}
