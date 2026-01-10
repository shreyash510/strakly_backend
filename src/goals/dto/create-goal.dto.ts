import {
  IsString,
  IsNotEmpty,
  MaxLength,
  IsEnum,
  IsNumber,
  Min,
  Max,
  IsOptional,
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

export enum GoalType {
  REGULAR = 'regular',
  SAVINGS = 'savings',
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

  @IsEnum(GoalType)
  @IsOptional()
  goalType?: GoalType = GoalType.REGULAR;

  @IsString()
  @IsNotEmpty()
  targetDate: string;

  @IsNumber()
  @Min(0)
  @Max(100)
  progress: number;

  @IsEnum(GoalStatus)
  status: GoalStatus;

  // For savings goals
  @IsNumber()
  @Min(0)
  @IsOptional()
  targetAmount?: number;

  @IsNumber()
  @Min(0)
  @IsOptional()
  currentAmount?: number;
}
