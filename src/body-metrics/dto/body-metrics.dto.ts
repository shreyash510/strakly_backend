import { IsString, IsOptional, IsNumber, IsDateString, Min, Max } from 'class-validator';
import { Type } from 'class-transformer';

export class UpdateBodyMetricsDto {
  // Basic measurements
  @IsOptional()
  @IsNumber()
  @Min(50)
  @Max(300)
  @Type(() => Number)
  height?: number;  // cm

  @IsOptional()
  @IsNumber()
  @Min(20)
  @Max(500)
  @Type(() => Number)
  weight?: number;  // kg

  // Body composition
  @IsOptional()
  @IsNumber()
  @Min(1)
  @Max(70)
  @Type(() => Number)
  bodyFat?: number;  // percentage

  @IsOptional()
  @IsNumber()
  @Min(10)
  @Max(150)
  @Type(() => Number)
  muscleMass?: number;  // kg

  @IsOptional()
  @IsNumber()
  @Min(1)
  @Max(10)
  @Type(() => Number)
  boneMass?: number;  // kg

  @IsOptional()
  @IsNumber()
  @Min(30)
  @Max(80)
  @Type(() => Number)
  waterPercentage?: number;  // percentage

  // Measurements (cm)
  @IsOptional()
  @IsNumber()
  @Min(50)
  @Max(200)
  @Type(() => Number)
  chest?: number;

  @IsOptional()
  @IsNumber()
  @Min(40)
  @Max(200)
  @Type(() => Number)
  waist?: number;

  @IsOptional()
  @IsNumber()
  @Min(50)
  @Max(200)
  @Type(() => Number)
  hips?: number;

  @IsOptional()
  @IsNumber()
  @Min(15)
  @Max(60)
  @Type(() => Number)
  biceps?: number;

  @IsOptional()
  @IsNumber()
  @Min(30)
  @Max(100)
  @Type(() => Number)
  thighs?: number;

  @IsOptional()
  @IsNumber()
  @Min(20)
  @Max(60)
  @Type(() => Number)
  calves?: number;

  @IsOptional()
  @IsNumber()
  @Min(80)
  @Max(200)
  @Type(() => Number)
  shoulders?: number;

  @IsOptional()
  @IsNumber()
  @Min(25)
  @Max(60)
  @Type(() => Number)
  neck?: number;

  // Health indicators
  @IsOptional()
  @IsNumber()
  @Min(40)
  @Max(200)
  @Type(() => Number)
  restingHeartRate?: number;  // bpm

  @IsOptional()
  @IsNumber()
  @Min(70)
  @Max(250)
  @Type(() => Number)
  bloodPressureSys?: number;

  @IsOptional()
  @IsNumber()
  @Min(40)
  @Max(150)
  @Type(() => Number)
  bloodPressureDia?: number;

  // Goals
  @IsOptional()
  @IsNumber()
  @Min(20)
  @Max(500)
  @Type(() => Number)
  targetWeight?: number;

  @IsOptional()
  @IsNumber()
  @Min(1)
  @Max(70)
  @Type(() => Number)
  targetBodyFat?: number;

  @IsOptional()
  @IsString()
  measuredBy?: string;

  @IsOptional()
  @IsString()
  notes?: string;
}

export class RecordMetricsDto extends UpdateBodyMetricsDto {
  @IsOptional()
  @IsDateString()
  measuredAt?: string;
}

export class GetMetricsHistoryDto {
  @IsOptional()
  @IsDateString()
  startDate?: string;

  @IsOptional()
  @IsDateString()
  endDate?: string;

  @IsOptional()
  @IsNumber()
  @Min(1)
  @Max(100)
  @Type(() => Number)
  limit?: number;
}
