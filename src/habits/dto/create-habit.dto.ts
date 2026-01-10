import {
  IsString,
  IsNotEmpty,
  MaxLength,
  IsEnum,
  IsBoolean,
  IsArray,
  IsNumber,
  IsOptional,
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
}
