import {
  IsNotEmpty,
  IsOptional,
  IsString,
  IsNumber,
  IsBoolean,
  IsArray,
  IsDateString,
  IsEnum,
} from 'class-validator';

export enum AnnouncementType {
  GENERAL = 'general',
  IMPORTANT = 'important',
  MAINTENANCE = 'maintenance',
  PROMOTION = 'promotion',
  EVENT = 'event',
  HOLIDAY = 'holiday',
}

export enum AnnouncementPriority {
  LOW = 'low',
  NORMAL = 'normal',
  HIGH = 'high',
  URGENT = 'urgent',
}

export enum TargetAudience {
  ALL = 'all',
  CLIENTS = 'clients',
  STAFF = 'staff',
  TRAINERS = 'trainers',
  MANAGERS = 'managers',
  SPECIFIC = 'specific',
}

export class CreateAnnouncementDto {
  @IsOptional()
  @IsNumber()
  branchId?: number;

  @IsNotEmpty()
  @IsString()
  title: string;

  @IsNotEmpty()
  @IsString()
  content: string;

  @IsOptional()
  @IsEnum(AnnouncementType)
  type?: AnnouncementType;

  @IsOptional()
  @IsEnum(AnnouncementPriority)
  priority?: AnnouncementPriority;

  @IsOptional()
  @IsEnum(TargetAudience)
  targetAudience?: TargetAudience;

  @IsOptional()
  @IsArray()
  @IsNumber({}, { each: true })
  targetUserIds?: number[];

  @IsOptional()
  @IsDateString()
  startDate?: string;

  @IsOptional()
  @IsDateString()
  endDate?: string;

  @IsOptional()
  @IsBoolean()
  isPinned?: boolean;

  @IsOptional()
  @IsBoolean()
  displayOnDashboard?: boolean;

  @IsOptional()
  @IsBoolean()
  displayOnMobile?: boolean;

  @IsOptional()
  attachments?: Array<{ name: string; url: string; type: string }>;
}

export class UpdateAnnouncementDto {
  @IsOptional()
  @IsString()
  title?: string;

  @IsOptional()
  @IsString()
  content?: string;

  @IsOptional()
  @IsEnum(AnnouncementType)
  type?: AnnouncementType;

  @IsOptional()
  @IsEnum(AnnouncementPriority)
  priority?: AnnouncementPriority;

  @IsOptional()
  @IsEnum(TargetAudience)
  targetAudience?: TargetAudience;

  @IsOptional()
  @IsArray()
  @IsNumber({}, { each: true })
  targetUserIds?: number[];

  @IsOptional()
  @IsDateString()
  startDate?: string;

  @IsOptional()
  @IsDateString()
  endDate?: string;

  @IsOptional()
  @IsBoolean()
  isPinned?: boolean;

  @IsOptional()
  @IsBoolean()
  displayOnDashboard?: boolean;

  @IsOptional()
  @IsBoolean()
  displayOnMobile?: boolean;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @IsOptional()
  attachments?: Array<{ name: string; url: string; type: string }>;
}

export class AnnouncementFiltersDto {
  @IsOptional()
  @IsEnum(AnnouncementType)
  type?: AnnouncementType;

  @IsOptional()
  @IsEnum(AnnouncementPriority)
  priority?: AnnouncementPriority;

  @IsOptional()
  @IsBoolean()
  isPinned?: boolean;

  @IsOptional()
  @IsBoolean()
  activeOnly?: boolean;

  @IsOptional()
  @IsNumber()
  page?: number;

  @IsOptional()
  @IsNumber()
  limit?: number;
}
