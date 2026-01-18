import {
  IsString,
  IsNotEmpty,
  IsOptional,
  IsNumber,
  IsArray,
  IsEnum,
  MaxLength,
  ValidateNested,
  IsObject,
} from 'class-validator';
import { Type } from 'class-transformer';

export enum DifficultyLevel {
  BEGINNER = 'beginner',
  INTERMEDIATE = 'intermediate',
  ADVANCED = 'advanced',
}

export enum DietStatus {
  DRAFT = 'draft',
  ACTIVE = 'active',
  ARCHIVED = 'archived',
}

export class MacrosDto {
  @IsNumber()
  protein: number;

  @IsNumber()
  carbs: number;

  @IsNumber()
  fats: number;
}

export class DietMealDto {
  @IsString()
  @IsNotEmpty()
  name: string;

  @IsString()
  @IsOptional()
  time?: string;

  @IsArray()
  @IsString({ each: true })
  @IsOptional()
  foods?: string[];

  @IsNumber()
  @IsOptional()
  calories?: number;
}

export class CreateDietDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  title: string;

  @IsString()
  @IsOptional()
  @MaxLength(2000)
  description?: string;

  @IsString()
  @IsNotEmpty()
  category: string;

  @IsEnum(DifficultyLevel)
  @IsOptional()
  difficulty?: DifficultyLevel;

  @IsNumber()
  duration: number;

  @IsEnum(DietStatus)
  @IsOptional()
  status?: DietStatus;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => DietMealDto)
  @IsOptional()
  meals?: DietMealDto[];

  @IsNumber()
  @IsOptional()
  dailyCalories?: number;

  @IsObject()
  @ValidateNested()
  @Type(() => MacrosDto)
  @IsOptional()
  macros?: MacrosDto;

  @IsString()
  @IsOptional()
  gymId?: string;
}
