import { IsString, IsOptional, IsEnum, IsNumber, IsBoolean, IsArray, ValidateNested, Min } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';

export class ExerciseDto {
  @ApiProperty({ description: 'Exercise name' })
  @IsString()
  name: string;

  @ApiPropertyOptional({ description: 'Exercise description' })
  @IsOptional()
  @IsString()
  description?: string;

  @ApiPropertyOptional({ description: 'Number of sets' })
  @IsOptional()
  @IsNumber()
  @Min(0)
  sets?: number;

  @ApiPropertyOptional({ description: 'Number of reps' })
  @IsOptional()
  @IsNumber()
  @Min(0)
  reps?: number;

  @ApiPropertyOptional({ description: 'Duration in seconds' })
  @IsOptional()
  @IsNumber()
  @Min(0)
  duration?: number;

  @ApiPropertyOptional({ description: 'Rest time in seconds' })
  @IsOptional()
  @IsNumber()
  @Min(0)
  restTime?: number;

  @ApiPropertyOptional({ description: 'Video URL' })
  @IsOptional()
  @IsString()
  videoUrl?: string;

  @ApiPropertyOptional({ description: 'Image URL' })
  @IsOptional()
  @IsString()
  imageUrl?: string;
}

export class CreateProgramDto {
  @ApiProperty({ description: 'Program title' })
  @IsString()
  title: string;

  @ApiPropertyOptional({ description: 'Program description' })
  @IsOptional()
  @IsString()
  description?: string;

  @ApiProperty({ description: 'Program type', enum: ['workout', 'diet', 'exercise'] })
  @IsEnum(['workout', 'diet', 'exercise'])
  type: string;

  @ApiPropertyOptional({ description: 'Duration in days' })
  @IsOptional()
  @IsNumber()
  @Min(1)
  duration?: number;

  @ApiPropertyOptional({ description: 'Difficulty level', enum: ['beginner', 'intermediate', 'advanced'] })
  @IsOptional()
  @IsEnum(['beginner', 'intermediate', 'advanced'])
  difficulty?: string;

  @ApiPropertyOptional({ description: 'Category' })
  @IsOptional()
  @IsString()
  category?: string;

  @ApiPropertyOptional({ description: 'Gym ID' })
  @IsOptional()
  @IsString()
  gymId?: string;

  @ApiPropertyOptional({ description: 'Exercises list', type: [ExerciseDto] })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ExerciseDto)
  exercises?: ExerciseDto[];

  @ApiPropertyOptional({ description: 'Is public', default: false })
  @IsOptional()
  @IsBoolean()
  isPublic?: boolean;

  @ApiPropertyOptional({ description: 'Status', enum: ['draft', 'active', 'archived'] })
  @IsOptional()
  @IsEnum(['draft', 'active', 'archived'])
  status?: string;

  @ApiPropertyOptional({ description: 'Image URL' })
  @IsOptional()
  @IsString()
  imageUrl?: string;
}
