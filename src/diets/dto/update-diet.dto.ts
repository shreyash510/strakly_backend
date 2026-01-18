import {
  IsString,
  IsOptional,
  IsNumber,
  IsArray,
  IsEnum,
  MaxLength,
  ValidateNested,
  IsObject,
} from 'class-validator';
import { Type } from 'class-transformer';
import { DifficultyLevel, DietStatus, DietMealDto, MacrosDto } from './create-diet.dto';

export class UpdateDietDto {
  @IsString()
  @IsOptional()
  @MaxLength(200)
  title?: string;

  @IsString()
  @IsOptional()
  @MaxLength(2000)
  description?: string;

  @IsString()
  @IsOptional()
  category?: string;

  @IsEnum(DifficultyLevel)
  @IsOptional()
  difficulty?: DifficultyLevel;

  @IsNumber()
  @IsOptional()
  duration?: number;

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
