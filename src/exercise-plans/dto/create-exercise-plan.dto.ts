import { IsString, IsOptional, IsArray, IsMongoId, ValidateNested, IsNumber } from 'class-validator';
import { Type } from 'class-transformer';

class ExerciseDto {
  @IsString()
  name: string;

  @IsNumber()
  @IsOptional()
  sets?: number;

  @IsNumber()
  @IsOptional()
  reps?: number;

  @IsNumber()
  @IsOptional()
  duration?: number;

  @IsNumber()
  @IsOptional()
  restTime?: number;
}

export class CreateExercisePlanDto {
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
  @Type(() => ExerciseDto)
  @IsOptional()
  exercises?: ExerciseDto[];

  @IsOptional()
  startDate?: Date;

  @IsOptional()
  endDate?: Date;
}
