import {
  IsString,
  IsNotEmpty,
  MaxLength,
  IsEnum,
  IsBoolean,
  IsArray,
  IsNumber,
  IsOptional,
  Min,
  Max,
} from 'class-validator';

export enum HabitFrequency {
  DAILY = 'daily',
  WEEKLY = 'weekly',
  CUSTOM = 'custom',
}

export class CreateHabitDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  title: string;

  @IsString()
  @MaxLength(300)
  description: string;

  @IsEnum(HabitFrequency)
  frequency: HabitFrequency;

  @IsBoolean()
  isGoodHabit: boolean;

  @IsArray()
  @IsNumber({}, { each: true })
  @IsOptional()
  customDays?: number[];

  // For bad habits - tracking slip/clean days
  @IsNumber()
  @Min(1)
  @Max(365)
  @IsOptional()
  targetDays?: number;

  @IsString()
  @MaxLength(1000)
  @IsOptional()
  thoughts?: string;
}
