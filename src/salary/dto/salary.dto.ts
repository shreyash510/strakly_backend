import { IsNumber, IsOptional, IsString, IsEnum, Min, Max } from 'class-validator';

export const PAYMENT_STATUSES = ['pending', 'paid'] as const;
export const PAYMENT_METHODS = ['cash', 'bank_transfer', 'upi'] as const;

export type PaymentStatus = (typeof PAYMENT_STATUSES)[number];
export type PaymentMethod = (typeof PAYMENT_METHODS)[number];

export class CreateSalaryDto {
  @IsNumber()
  staffId: number;

  @IsNumber()
  @Min(1)
  @Max(12)
  month: number;

  @IsNumber()
  @Min(2000)
  year: number;

  @IsNumber()
  @Min(0)
  baseSalary: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  bonus?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  deductions?: number;

  @IsOptional()
  @IsString()
  notes?: string;
}

export class UpdateSalaryDto {
  @IsOptional()
  @IsNumber()
  @Min(0)
  baseSalary?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  bonus?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  deductions?: number;

  @IsOptional()
  @IsString()
  notes?: string;
}

export class PaySalaryDto {
  @IsEnum(PAYMENT_METHODS)
  paymentMethod: PaymentMethod;

  @IsOptional()
  @IsString()
  paymentRef?: string;

  @IsOptional()
  @IsString()
  notes?: string;
}

export class SalaryFilterDto {
  @IsOptional()
  @IsNumber()
  staffId?: number;

  @IsOptional()
  @IsNumber()
  @Min(1)
  @Max(12)
  month?: number;

  @IsOptional()
  @IsNumber()
  year?: number;

  @IsOptional()
  @IsEnum(PAYMENT_STATUSES)
  paymentStatus?: PaymentStatus;
}
