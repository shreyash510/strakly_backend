import {
  IsString,
  IsOptional,
  IsNumber,
  IsBoolean,
  IsEnum,
  IsNotEmpty,
} from 'class-validator';
import { Type } from 'class-transformer';

export enum NoteType {
  GENERAL = 'general',
  MEDICAL = 'medical',
  INTERACTION = 'interaction',
  FOLLOW_UP = 'follow_up',
}

export enum NoteVisibility {
  ALL = 'all',
  TRAINER_ONLY = 'trainer_only',
  ADMIN_ONLY = 'admin_only',
}

export class CreateMemberNoteDto {
  @IsNumber()
  @Type(() => Number)
  userId: number;

  @IsString()
  @IsNotEmpty()
  content: string;

  @IsOptional()
  @IsEnum(NoteType)
  noteType?: NoteType;

  @IsOptional()
  @IsEnum(NoteVisibility)
  visibility?: NoteVisibility;
}

export class UpdateMemberNoteDto {
  @IsOptional()
  @IsString()
  content?: string;

  @IsOptional()
  @IsEnum(NoteType)
  noteType?: NoteType;

  @IsOptional()
  @IsEnum(NoteVisibility)
  visibility?: NoteVisibility;
}

export class MemberNoteFiltersDto {
  @IsOptional()
  @IsNumber()
  @Type(() => Number)
  userId?: number;

  @IsOptional()
  @IsEnum(NoteType)
  noteType?: NoteType;

  @IsOptional()
  @IsNumber()
  @Type(() => Number)
  page?: number;

  @IsOptional()
  @IsNumber()
  @Type(() => Number)
  limit?: number;
}
