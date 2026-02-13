import { IsString, IsOptional, IsNumber, IsEnum, IsDateString } from 'class-validator';
import { Type } from 'class-transformer';

export enum PhotoCategory {
  FRONT = 'front',
  SIDE = 'side',
  BACK = 'back',
  OTHER = 'other',
}

export enum PhotoVisibility {
  ALL = 'all',
  TRAINER_ONLY = 'trainer_only',
  SELF_ONLY = 'self_only',
}

export class CreateProgressPhotoDto {
  @IsNumber() @Type(() => Number) userId: number;
  @IsOptional() @IsEnum(PhotoCategory) category?: PhotoCategory;
  @IsOptional() @IsDateString() takenAt?: string;
  @IsOptional() @IsString() notes?: string;
  @IsOptional() @IsNumber() @Type(() => Number) bodyMetricsId?: number;
  @IsOptional() @IsEnum(PhotoVisibility) visibility?: PhotoVisibility;
}

export class UpdateProgressPhotoDto {
  @IsOptional() @IsEnum(PhotoCategory) category?: PhotoCategory;
  @IsOptional() @IsDateString() takenAt?: string;
  @IsOptional() @IsString() notes?: string;
  @IsOptional() @IsEnum(PhotoVisibility) visibility?: PhotoVisibility;
}

export class PhotoFiltersDto {
  @IsOptional() @IsEnum(PhotoCategory) category?: PhotoCategory;
  @IsOptional() @IsNumber() @Type(() => Number) page?: number;
  @IsOptional() @IsNumber() @Type(() => Number) limit?: number;
}
