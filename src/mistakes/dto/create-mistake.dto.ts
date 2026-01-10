import {
  IsString,
  IsNotEmpty,
  MaxLength,
  IsEnum,
  IsBoolean,
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
  date: string;

  @IsEnum(MistakeCategory)
  category: MistakeCategory;

  @IsBoolean()
  isResolved: boolean;
}
