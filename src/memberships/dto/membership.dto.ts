import { IsString, IsOptional, IsDateString, IsNumber, Min } from 'class-validator';
import { Type } from 'class-transformer';

export class CreateMembershipDto {
  @IsNumber()
  @Type(() => Number)
  userId: number;

  @IsNumber()
  @Type(() => Number)
  gymId: number;

  @IsNumber()
  @Type(() => Number)
  planId: number;

  @IsOptional()
  @IsString()
  offerCode?: string;

  @IsDateString()
  startDate: string;

  @IsOptional()
  @IsString()
  paymentMethod?: string;

  @IsOptional()
  @IsString()
  notes?: string;
}

export class UpdateMembershipDto {
  @IsOptional()
  @IsString()
  status?: string;

  @IsOptional()
  @IsString()
  paymentStatus?: string;

  @IsOptional()
  @IsString()
  paymentMethod?: string;

  @IsOptional()
  @IsString()
  paymentRef?: string;

  @IsOptional()
  @IsDateString()
  paidAt?: string;

  @IsOptional()
  @IsString()
  notes?: string;
}

export class CancelMembershipDto {
  @IsString()
  reason: string;
}

export class RenewMembershipDto {
  @IsNumber()
  @Type(() => Number)
  gymId: number;

  @IsOptional()
  @IsNumber()
  @Type(() => Number)
  planId?: number;

  @IsOptional()
  @IsString()
  offerCode?: string;

  @IsOptional()
  @IsString()
  paymentMethod?: string;

  @IsOptional()
  @IsString()
  notes?: string;
}

export class RecordPaymentDto {
  @IsString()
  paymentMethod: string;

  @IsOptional()
  @IsString()
  paymentRef?: string;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Type(() => Number)
  amount?: number;
}
