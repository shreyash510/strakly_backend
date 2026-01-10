import {
  IsString,
  IsNotEmpty,
  MaxLength,
  IsEnum,
  IsOptional,
} from 'class-validator';

export enum MistakeCategory {
  COMMUNICATION = 'communication',
  TIME_MANAGEMENT = 'time_management',
  DECISION_MAKING = 'decision_making',
  HABITS = 'habits',
  RELATIONSHIPS = 'relationships',
  WORK = 'work',
  HEALTH = 'health',
  FINANCIAL = 'financial',
  OTHER = 'other',
}

export enum MistakeStatus {
  PENDING = 'pending',
  RESOLVED = 'resolved',
  FAILED = 'failed',
}

export class CreateMistakeDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  title: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(1000)
  description: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(500)
  lesson: string;

  @IsString()
  @IsNotEmpty()
  startDate: string;

  @IsString()
  @IsOptional()
  endDate?: string;

  @IsEnum(MistakeCategory)
  category: MistakeCategory;

  @IsEnum(MistakeStatus)
  status: MistakeStatus;
}
