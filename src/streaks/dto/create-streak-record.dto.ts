import {
  IsString,
  IsNumber,
  IsEnum,
  IsBoolean,
  Min,
  IsOptional,
} from 'class-validator';

export enum StreakItemType {
  HABIT = 'habit',
  GOAL = 'goal',
  TASK = 'task',
}

export class CreateStreakRecordDto {
  @IsString()
  itemId: string;

  @IsEnum(StreakItemType)
  itemType: StreakItemType;

  @IsString()
  itemName: string;

  @IsNumber()
  @Min(0)
  streak: number;

  @IsNumber()
  @Min(0)
  longestStreak: number;

  @IsString()
  date: string; // YYYY-MM-DD

  @IsBoolean()
  completed: boolean;

  @IsBoolean()
  @IsOptional()
  isGoodHabit?: boolean; // For habits - good vs bad habit
}
