import {
  IsString,
  IsNotEmpty,
  MaxLength,
  IsNumber,
  IsEnum,
  Min,
  Max,
} from 'class-validator';

export enum PunishmentCategory {
  GOAL = 'goal',
  HABIT = 'habit',
  TASK = 'task',
}

export class CreatePunishmentRuleDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  title: string;

  @IsString()
  @MaxLength(500)
  description: string;

  @IsEnum(PunishmentCategory)
  category: PunishmentCategory;

  @IsString()
  @IsNotEmpty()
  linkedItemId: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  linkedItemName: string;

  @IsNumber()
  @Min(0)
  @Max(100)
  triggerStreak: number;
}
