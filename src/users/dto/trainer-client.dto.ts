import {
  IsInt,
  IsOptional,
  IsString,
  IsBoolean,
  IsEnum,
} from 'class-validator';
import { Type } from 'class-transformer';

export class AssignClientDto {
  @IsInt()
  @Type(() => Number)
  clientId: number;

  @IsOptional()
  @IsString()
  notes?: string;
}

export class TrainerClientQueryDto {
  @IsOptional()
  @IsInt()
  @Type(() => Number)
  trainerId?: number;

  @IsOptional()
  @IsBoolean()
  @Type(() => Boolean)
  isActive?: boolean;
}

export class TrainerClientResponseDto {
  id: number;
  trainerId: number;
  trainerName: string;
  trainerEmail: string;
  trainerPhone?: string;
  trainerAvatar?: string;
  trainerBio?: string;
  clientId: number;
  clientName: string;
  clientEmail: string;
  isActive: boolean;
  assignedAt: string;
  notes?: string;
}
