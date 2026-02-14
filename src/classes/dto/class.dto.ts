import {
  IsString,
  IsOptional,
  IsNumber,
  IsEnum,
  IsNotEmpty,
  IsBoolean,
  IsDateString,
  Min,
  Max,
} from 'class-validator';
import { Type } from 'class-transformer';

export enum ClassCategory {
  YOGA = 'yoga',
  SPIN = 'spin',
  HIIT = 'hiit',
  CROSSFIT = 'crossfit',
  STRENGTH = 'strength',
  PILATES = 'pilates',
  ZUMBA = 'zumba',
  BOXING = 'boxing',
  CARDIO = 'cardio',
  STRETCHING = 'stretching',
  FUNCTIONAL = 'functional',
  OTHER = 'other',
}

export enum SessionStatus {
  SCHEDULED = 'scheduled',
  CANCELLED = 'cancelled',
  COMPLETED = 'completed',
}

export enum BookingStatus {
  BOOKED = 'booked',
  WAITLISTED = 'waitlisted',
  ATTENDED = 'attended',
  NO_SHOW = 'no_show',
  CANCELLED = 'cancelled',
}

// ─── Class Types ───

export class CreateClassTypeDto {
  @IsString()
  @IsNotEmpty()
  name: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsEnum(ClassCategory)
  category?: ClassCategory;

  @IsOptional()
  @IsNumber()
  @Type(() => Number)
  @Min(15)
  defaultDuration?: number;

  @IsOptional()
  @IsNumber()
  @Type(() => Number)
  @Min(1)
  defaultCapacity?: number;

  @IsOptional()
  @IsString()
  color?: string;

  @IsOptional()
  @IsString()
  icon?: string;
}

export class UpdateClassTypeDto {
  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsEnum(ClassCategory)
  category?: ClassCategory;

  @IsOptional()
  @IsNumber()
  @Type(() => Number)
  defaultDuration?: number;

  @IsOptional()
  @IsNumber()
  @Type(() => Number)
  defaultCapacity?: number;

  @IsOptional()
  @IsString()
  color?: string;

  @IsOptional()
  @IsString()
  icon?: string;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

// ─── Class Schedules ───

export class CreateClassScheduleDto {
  @IsNumber()
  @Type(() => Number)
  classTypeId: number;

  @IsOptional()
  @IsNumber()
  @Type(() => Number)
  instructorId?: number;

  @IsOptional()
  @IsString()
  room?: string;

  @IsNumber()
  @Type(() => Number)
  @Min(0)
  @Max(6)
  dayOfWeek: number;

  @IsString()
  @IsNotEmpty()
  startTime: string;

  @IsString()
  @IsNotEmpty()
  endTime: string;

  @IsOptional()
  @IsNumber()
  @Type(() => Number)
  @Min(1)
  capacity?: number;

  @IsOptional()
  @IsBoolean()
  isRecurring?: boolean;

  @IsOptional()
  @IsDateString()
  startDate?: string;

  @IsOptional()
  @IsDateString()
  endDate?: string;
}

export class UpdateClassScheduleDto {
  @IsOptional()
  @IsNumber()
  @Type(() => Number)
  instructorId?: number;

  @IsOptional()
  @IsString()
  room?: string;

  @IsOptional()
  @IsNumber()
  @Type(() => Number)
  @Min(0)
  @Max(6)
  dayOfWeek?: number;

  @IsOptional()
  @IsString()
  startTime?: string;

  @IsOptional()
  @IsString()
  endTime?: string;

  @IsOptional()
  @IsNumber()
  @Type(() => Number)
  capacity?: number;

  @IsOptional()
  @IsBoolean()
  isRecurring?: boolean;

  @IsOptional()
  @IsDateString()
  startDate?: string;

  @IsOptional()
  @IsDateString()
  endDate?: string;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

// ─── Sessions ───

export class GenerateSessionsDto {
  @IsDateString()
  fromDate: string;

  @IsDateString()
  toDate: string;

  @IsOptional()
  @IsNumber()
  @Type(() => Number)
  scheduleId?: number;
}

export class UpdateSessionDto {
  @IsOptional()
  @IsEnum(SessionStatus)
  status?: SessionStatus;

  @IsOptional()
  @IsNumber()
  @Type(() => Number)
  instructorId?: number;

  @IsOptional()
  @IsString()
  notes?: string;

  @IsOptional()
  @IsString()
  cancelledReason?: string;
}

// ─── Bookings ───

export class UpdateBookingStatusDto {
  @IsEnum(BookingStatus)
  @IsNotEmpty()
  status: BookingStatus;

  @IsOptional()
  @IsString()
  cancelReason?: string;
}

// ─── Filters ───

export class ClassFiltersDto {
  @IsOptional()
  @IsString()
  category?: string;

  @IsOptional()
  @IsString()
  search?: string;

  @IsOptional()
  @IsNumber()
  @Type(() => Number)
  @Min(1)
  page?: number;

  @IsOptional()
  @IsNumber()
  @Type(() => Number)
  @Min(1)
  limit?: number;
}

export class SessionFiltersDto {
  @IsOptional()
  @IsDateString()
  fromDate?: string;

  @IsOptional()
  @IsDateString()
  toDate?: string;

  @IsOptional()
  @IsNumber()
  @Type(() => Number)
  classTypeId?: number;

  @IsOptional()
  @IsNumber()
  @Type(() => Number)
  instructorId?: number;

  @IsOptional()
  @IsEnum(SessionStatus)
  status?: SessionStatus;

  @IsOptional()
  @IsNumber()
  @Type(() => Number)
  @Min(1)
  page?: number;

  @IsOptional()
  @IsNumber()
  @Type(() => Number)
  @Min(1)
  limit?: number;
}
