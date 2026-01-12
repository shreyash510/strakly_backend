import { IsString, IsOptional, IsArray, IsMongoId, IsDate, ValidateNested, IsNumber } from 'class-validator';
import { Type } from 'class-transformer';

class MealDto {
  @IsString()
  name: string;

  @IsString()
  time: string;

  @IsArray()
  @IsString({ each: true })
  items: string[];

  @IsNumber()
  @IsOptional()
  calories?: number;
}

export class CreateDietPlanDto {
  @IsMongoId()
  userId: string;

  @IsMongoId()
  gymId: string;

  @IsString()
  title: string;

  @IsString()
  @IsOptional()
  description?: string;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => MealDto)
  @IsOptional()
  meals?: MealDto[];

  @IsOptional()
  startDate?: Date;

  @IsOptional()
  endDate?: Date;
}
