import {
  IsString,
  IsNotEmpty,
  MaxLength,
  IsEnum,
  IsNumber,
  Min,
  Max,
} from 'class-validator';

export enum GoalStatus {
  NOT_STARTED = 'not_started',
  IN_PROGRESS = 'in_progress',
  COMPLETED = 'completed',
  ABANDONED = 'abandoned',
}

export enum GoalCategory {
  HEALTH = 'health',
  CAREER = 'career',
  FINANCE = 'finance',
  EDUCATION = 'education',
  RELATIONSHIPS = 'relationships',
  PERSONAL = 'personal',
  OTHER = 'other',
}

export class CreateGoalDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  title: string;

  @IsString()
  @MaxLength(500)
  description: string;

  @IsEnum(GoalCategory)
  category: GoalCategory;

  @IsString()
  @IsNotEmpty()
  targetDate: string;

  @IsNumber()
  @Min(0)
  @Max(100)
  progress: number;

  @IsEnum(GoalStatus)
  status: GoalStatus;
}
