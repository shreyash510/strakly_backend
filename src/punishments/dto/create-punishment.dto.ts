import {
  IsString,
  IsNotEmpty,
  MaxLength,
  IsNumber,
  IsEnum,
  IsOptional,
  Min,
} from 'class-validator';

export enum PunishmentStatus {
  PENDING = 'pending',
  COMPLETED = 'completed',
  SKIPPED = 'skipped',
}

export enum PunishmentCategory {
  GOAL = 'goal',
  HABIT = 'habit',
  TASK = 'task',
}

export class CreatePunishmentDto {
  @IsString()
  @IsNotEmpty()
  ruleId: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  title: string;

  @IsString()
  @MaxLength(500)
  description: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(500)
  reason: string;

  @IsString()
  @MaxLength(1000)
  @IsOptional()
  thoughts?: string;

  @IsString()
  @IsOptional()
  date?: string;

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
  @IsOptional()
  streak?: number;
}
