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

export enum AppointmentStatus {
  BOOKED = 'booked',
  CONFIRMED = 'confirmed',
  COMPLETED = 'completed',
  CANCELLED = 'cancelled',
  NO_SHOW = 'no_show',
}

export enum PackageStatus {
  ACTIVE = 'active',
  EXPIRED = 'expired',
  EXHAUSTED = 'exhausted',
}

// ─── Services ───

export class CreateServiceDto {
  @IsString()
  @IsNotEmpty()
  name: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsNumber()
  @Type(() => Number)
  @Min(15)
  durationMinutes: number;

  @IsNumber()
  @Type(() => Number)
  @Min(0)
  price: number;

  @IsOptional()
  @IsString()
  currency?: string;

  @IsOptional()
  @IsNumber()
  @Type(() => Number)
  @Min(1)
  maxParticipants?: number;

  @IsOptional()
  @IsString()
  category?: string;

  @IsOptional()
  @IsNumber()
  @Type(() => Number)
  @Min(0)
  bufferMinutes?: number;
}

export class UpdateServiceDto {
  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsNumber()
  @Type(() => Number)
  durationMinutes?: number;

  @IsOptional()
  @IsNumber()
  @Type(() => Number)
  price?: number;

  @IsOptional()
  @IsString()
  currency?: string;

  @IsOptional()
  @IsNumber()
  @Type(() => Number)
  maxParticipants?: number;

  @IsOptional()
  @IsString()
  category?: string;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @IsOptional()
  @IsNumber()
  @Type(() => Number)
  @Min(0)
  bufferMinutes?: number;
}

// ─── Trainer Availability ───

export class SetAvailabilityDto {
  @IsNumber()
  @Type(() => Number)
  trainerId: number;

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
  @IsBoolean()
  isAvailable?: boolean;
}

// ─── Appointments ───

export class CreateAppointmentDto {
  @IsOptional()
  @IsNumber()
  @Type(() => Number)
  serviceId?: number;

  @IsNumber()
  @Type(() => Number)
  trainerId: number;

  @IsNumber()
  @Type(() => Number)
  userId: number;

  @IsDateString()
  startTime: string;

  @IsDateString()
  endTime: string;

  @IsOptional()
  @IsString()
  notes?: string;
}

export class UpdateAppointmentDto {
  @IsOptional()
  @IsDateString()
  startTime?: string;

  @IsOptional()
  @IsDateString()
  endTime?: string;

  @IsOptional()
  @IsString()
  notes?: string;
}

export class UpdateAppointmentStatusDto {
  @IsEnum(AppointmentStatus)
  @IsNotEmpty()
  status: AppointmentStatus;

  @IsOptional()
  @IsString()
  cancelledReason?: string;
}

// ─── Session Packages ───

export class CreateSessionPackageDto {
  @IsNumber()
  @Type(() => Number)
  userId: number;

  @IsOptional()
  @IsNumber()
  @Type(() => Number)
  serviceId?: number;

  @IsNumber()
  @Type(() => Number)
  @Min(1)
  totalSessions: number;

  @IsOptional()
  @IsDateString()
  expiresAt?: string;

  @IsOptional()
  @IsNumber()
  @Type(() => Number)
  paymentId?: number;
}

// ─── Available Slots ───

export class AvailableSlotsDto {
  @IsNumber()
  @Type(() => Number)
  trainerId: number;

  @IsDateString()
  date: string;

  @IsOptional()
  @IsNumber()
  @Type(() => Number)
  serviceId?: number;

  @IsOptional()
  @IsNumber()
  @Type(() => Number)
  @Min(15)
  durationMinutes?: number;
}

// ─── Filters ───

export class AppointmentFiltersDto {
  @IsOptional()
  @IsNumber()
  @Type(() => Number)
  trainerId?: number;

  @IsOptional()
  @IsNumber()
  @Type(() => Number)
  userId?: number;

  @IsOptional()
  @IsDateString()
  fromDate?: string;

  @IsOptional()
  @IsDateString()
  toDate?: string;

  @IsOptional()
  @IsEnum(AppointmentStatus)
  status?: AppointmentStatus;

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
