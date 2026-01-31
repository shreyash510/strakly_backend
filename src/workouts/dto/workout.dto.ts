import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsString,
  IsEnum,
  IsOptional,
  IsNotEmpty,
  IsInt,
  IsArray,
  Min,
  Max,
} from 'class-validator';
import { Type } from 'class-transformer';

export class WorkoutExerciseDto {
  @ApiProperty({ description: 'Exercise name' })
  @IsString()
  @IsNotEmpty()
  name: string;

  @ApiPropertyOptional({ description: 'Number of sets' })
  @IsInt()
  @IsOptional()
  sets?: number;

  @ApiPropertyOptional({
    description: 'Number of reps or rep range (e.g., "10-12")',
  })
  @IsString()
  @IsOptional()
  reps?: string;

  @ApiPropertyOptional({
    description: 'Duration in seconds for timed exercises',
  })
  @IsInt()
  @IsOptional()
  duration?: number;

  @ApiPropertyOptional({ description: 'Rest time in seconds' })
  @IsInt()
  @IsOptional()
  restTime?: number;

  @ApiPropertyOptional({ description: 'Additional notes' })
  @IsString()
  @IsOptional()
  notes?: string;
}

export class CreateWorkoutPlanDto {
  @ApiProperty({ description: 'Workout plan title' })
  @IsString()
  @IsNotEmpty()
  title: string;

  @ApiProperty({
    enum: ['strength', 'cardio', 'flexibility', 'hiit', 'mixed'],
    description: 'Workout type',
  })
  @IsEnum(['strength', 'cardio', 'flexibility', 'hiit', 'mixed'])
  type: 'strength' | 'cardio' | 'flexibility' | 'hiit' | 'mixed';

  @ApiPropertyOptional({ description: 'Workout plan description' })
  @IsString()
  @IsOptional()
  description?: string;

  @ApiProperty({
    description: 'Workout category (e.g., weight_loss, muscle_gain)',
  })
  @IsString()
  @IsNotEmpty()
  category: string;

  @ApiPropertyOptional({
    enum: ['beginner', 'intermediate', 'advanced'],
    default: 'beginner',
  })
  @IsEnum(['beginner', 'intermediate', 'advanced'])
  @IsOptional()
  difficulty?: 'beginner' | 'intermediate' | 'advanced';

  @ApiPropertyOptional({ description: 'Duration in days', default: 7 })
  @IsInt()
  @Min(1)
  @IsOptional()
  duration?: number;

  @ApiPropertyOptional({ description: 'Sessions per week', default: 3 })
  @IsInt()
  @Min(1)
  @Max(7)
  @IsOptional()
  sessionsPerWeek?: number;

  @ApiPropertyOptional({
    description: 'Estimated session duration in minutes',
    default: 45,
  })
  @IsInt()
  @Min(10)
  @IsOptional()
  estimatedSessionDuration?: number;

  @ApiPropertyOptional({
    description: 'List of exercises',
    type: [WorkoutExerciseDto],
  })
  @IsArray()
  @IsOptional()
  @Type(() => WorkoutExerciseDto)
  exercises?: WorkoutExerciseDto[];

  @ApiPropertyOptional({
    enum: ['draft', 'active', 'archived'],
    default: 'draft',
  })
  @IsEnum(['draft', 'active', 'archived'])
  @IsOptional()
  status?: 'draft' | 'active' | 'archived';
}

export class UpdateWorkoutPlanDto {
  @ApiPropertyOptional({ description: 'Workout plan title' })
  @IsString()
  @IsOptional()
  title?: string;

  @ApiPropertyOptional({
    enum: ['strength', 'cardio', 'flexibility', 'hiit', 'mixed'],
  })
  @IsEnum(['strength', 'cardio', 'flexibility', 'hiit', 'mixed'])
  @IsOptional()
  type?: 'strength' | 'cardio' | 'flexibility' | 'hiit' | 'mixed';

  @ApiPropertyOptional({ description: 'Workout plan description' })
  @IsString()
  @IsOptional()
  description?: string;

  @ApiPropertyOptional({ description: 'Workout category' })
  @IsString()
  @IsOptional()
  category?: string;

  @ApiPropertyOptional({ enum: ['beginner', 'intermediate', 'advanced'] })
  @IsEnum(['beginner', 'intermediate', 'advanced'])
  @IsOptional()
  difficulty?: 'beginner' | 'intermediate' | 'advanced';

  @ApiPropertyOptional({ description: 'Duration in days' })
  @IsInt()
  @Min(1)
  @IsOptional()
  duration?: number;

  @ApiPropertyOptional({ description: 'Sessions per week' })
  @IsInt()
  @Min(1)
  @Max(7)
  @IsOptional()
  sessionsPerWeek?: number;

  @ApiPropertyOptional({ description: 'Estimated session duration in minutes' })
  @IsInt()
  @Min(10)
  @IsOptional()
  estimatedSessionDuration?: number;

  @ApiPropertyOptional({
    description: 'List of exercises',
    type: [WorkoutExerciseDto],
  })
  @IsArray()
  @IsOptional()
  @Type(() => WorkoutExerciseDto)
  exercises?: WorkoutExerciseDto[];

  @ApiPropertyOptional({ enum: ['draft', 'active', 'archived'] })
  @IsEnum(['draft', 'active', 'archived'])
  @IsOptional()
  status?: 'draft' | 'active' | 'archived';
}

export class AssignWorkoutDto {
  @ApiProperty({ description: 'Workout plan ID to assign' })
  @IsInt()
  workoutPlanId: number;

  @ApiProperty({ description: 'Client user ID to assign the workout to' })
  @IsInt()
  userId: number;

  @ApiPropertyOptional({ description: 'Notes for the assignment' })
  @IsString()
  @IsOptional()
  notes?: string;
}

export class UpdateWorkoutAssignmentDto {
  @ApiPropertyOptional({ enum: ['active', 'completed', 'cancelled'] })
  @IsEnum(['active', 'completed', 'cancelled'])
  @IsOptional()
  status?: 'active' | 'completed' | 'cancelled';

  @ApiPropertyOptional({ description: 'Progress percentage (0-100)' })
  @IsInt()
  @Min(0)
  @Max(100)
  @IsOptional()
  progressPercentage?: number;

  @ApiPropertyOptional({ description: 'Notes for the assignment' })
  @IsString()
  @IsOptional()
  notes?: string;
}
