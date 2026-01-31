import {
  IsNotEmpty,
  IsOptional,
  IsNumber,
  IsString,
  IsDateString,
} from 'class-validator';

export class CreateActivityLogDto {
  @IsOptional()
  @IsNumber()
  branchId?: number;

  @IsNotEmpty()
  @IsNumber()
  actorId: number;

  @IsNotEmpty()
  @IsString()
  actorType: string; // 'admin', 'manager', 'trainer', 'client', 'system'

  @IsOptional()
  @IsString()
  actorName?: string;

  @IsNotEmpty()
  @IsString()
  action: string;

  @IsOptional()
  @IsString()
  actionCategory?: string;

  @IsOptional()
  @IsString()
  targetType?: string;

  @IsOptional()
  @IsNumber()
  targetId?: number;

  @IsOptional()
  @IsString()
  targetName?: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  oldValues?: Record<string, any>;

  @IsOptional()
  newValues?: Record<string, any>;

  @IsOptional()
  metadata?: Record<string, any>;

  @IsOptional()
  @IsString()
  ipAddress?: string;

  @IsOptional()
  @IsString()
  userAgent?: string;

  @IsOptional()
  @IsString()
  requestId?: string;
}

export class ActivityLogFiltersDto {
  @IsOptional()
  @IsNumber()
  actorId?: number;

  @IsOptional()
  @IsString()
  actorType?: string;

  @IsOptional()
  @IsString()
  action?: string;

  @IsOptional()
  @IsString()
  actionCategory?: string;

  @IsOptional()
  @IsString()
  targetType?: string;

  @IsOptional()
  @IsNumber()
  targetId?: number;

  @IsOptional()
  @IsDateString()
  startDate?: string;

  @IsOptional()
  @IsDateString()
  endDate?: string;

  @IsOptional()
  @IsNumber()
  page?: number;

  @IsOptional()
  @IsNumber()
  limit?: number;
}
