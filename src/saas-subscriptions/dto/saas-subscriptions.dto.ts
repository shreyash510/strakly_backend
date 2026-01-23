import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsString,
  IsNumber,
  IsOptional,
  IsBoolean,
  IsArray,
  IsEnum,
  Min,
  IsDateString,
} from 'class-validator';

// ============================================
// SaaS Plan DTOs
// ============================================

export class CreateSaasPlanDto {
  @ApiProperty({ example: 'pro' })
  @IsString()
  code: string;

  @ApiProperty({ example: 'Pro Plan' })
  @IsString()
  name: string;

  @ApiPropertyOptional({ example: 'Best for growing gyms' })
  @IsString()
  @IsOptional()
  description?: string;

  @ApiProperty({ example: 499 })
  @IsNumber()
  @Min(0)
  price: number;

  @ApiPropertyOptional({ example: 'INR' })
  @IsString()
  @IsOptional()
  currency?: string;

  @ApiPropertyOptional({ example: 'monthly', enum: ['monthly', 'yearly'] })
  @IsString()
  @IsOptional()
  billingPeriod?: string;

  @ApiPropertyOptional({ example: 500, description: '-1 for unlimited' })
  @IsNumber()
  @IsOptional()
  maxMembers?: number;

  @ApiPropertyOptional({ example: 5, description: '-1 for unlimited' })
  @IsNumber()
  @IsOptional()
  maxStaff?: number;

  @ApiPropertyOptional({ example: 1 })
  @IsNumber()
  @IsOptional()
  maxBranches?: number;

  @ApiPropertyOptional({ example: ['QR check-in', 'Custom branding'] })
  @IsArray()
  @IsOptional()
  features?: string[];

  @ApiPropertyOptional({ example: 1 })
  @IsNumber()
  @IsOptional()
  displayOrder?: number;

  @ApiPropertyOptional({ example: false })
  @IsBoolean()
  @IsOptional()
  isFeatured?: boolean;

  @ApiPropertyOptional({ example: 'Most Popular' })
  @IsString()
  @IsOptional()
  badge?: string;

  @ApiPropertyOptional({ example: true })
  @IsBoolean()
  @IsOptional()
  isActive?: boolean;
}

export class UpdateSaasPlanDto {
  @ApiPropertyOptional({ example: 'Pro Plan' })
  @IsString()
  @IsOptional()
  name?: string;

  @ApiPropertyOptional({ example: 'Best for growing gyms' })
  @IsString()
  @IsOptional()
  description?: string;

  @ApiPropertyOptional({ example: 499 })
  @IsNumber()
  @Min(0)
  @IsOptional()
  price?: number;

  @ApiPropertyOptional({ example: 500 })
  @IsNumber()
  @IsOptional()
  maxMembers?: number;

  @ApiPropertyOptional({ example: 5 })
  @IsNumber()
  @IsOptional()
  maxStaff?: number;

  @ApiPropertyOptional({ example: 1 })
  @IsNumber()
  @IsOptional()
  maxBranches?: number;

  @ApiPropertyOptional({ example: ['QR check-in', 'Custom branding'] })
  @IsArray()
  @IsOptional()
  features?: string[];

  @ApiPropertyOptional({ example: 1 })
  @IsNumber()
  @IsOptional()
  displayOrder?: number;

  @ApiPropertyOptional({ example: false })
  @IsBoolean()
  @IsOptional()
  isFeatured?: boolean;

  @ApiPropertyOptional({ example: 'Most Popular' })
  @IsString()
  @IsOptional()
  badge?: string;

  @ApiPropertyOptional({ example: true })
  @IsBoolean()
  @IsOptional()
  isActive?: boolean;
}

// ============================================
// Gym Subscription DTOs
// ============================================

export enum SubscriptionStatus {
  ACTIVE = 'active',
  EXPIRED = 'expired',
  CANCELLED = 'cancelled',
  TRIAL = 'trial',
  SUSPENDED = 'suspended',
}

export enum PaymentStatus {
  PAID = 'paid',
  PENDING = 'pending',
  FAILED = 'failed',
  REFUNDED = 'refunded',
}

export class CreateGymSubscriptionDto {
  @ApiProperty({ example: 1 })
  @IsNumber()
  gymId: number;

  @ApiProperty({ example: 1 })
  @IsNumber()
  planId: number;

  @ApiPropertyOptional({ example: '2024-01-01' })
  @IsDateString()
  @IsOptional()
  startDate?: string;

  @ApiPropertyOptional({ example: '2024-12-31' })
  @IsDateString()
  @IsOptional()
  endDate?: string;

  @ApiPropertyOptional({ example: 'active', enum: SubscriptionStatus })
  @IsEnum(SubscriptionStatus)
  @IsOptional()
  status?: SubscriptionStatus;

  @ApiPropertyOptional({ example: 499 })
  @IsNumber()
  @IsOptional()
  amount?: number;

  @ApiPropertyOptional({ example: 'paid', enum: PaymentStatus })
  @IsEnum(PaymentStatus)
  @IsOptional()
  paymentStatus?: PaymentStatus;

  @ApiPropertyOptional({ example: 'card' })
  @IsString()
  @IsOptional()
  paymentMethod?: string;

  @ApiPropertyOptional({ example: 'TXN123456' })
  @IsString()
  @IsOptional()
  paymentRef?: string;

  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  notes?: string;
}

export class UpdateGymSubscriptionDto {
  @ApiPropertyOptional({ example: 1 })
  @IsNumber()
  @IsOptional()
  planId?: number;

  @ApiPropertyOptional({ example: '2024-12-31' })
  @IsDateString()
  @IsOptional()
  endDate?: string;

  @ApiPropertyOptional({ example: 'active', enum: SubscriptionStatus })
  @IsEnum(SubscriptionStatus)
  @IsOptional()
  status?: SubscriptionStatus;

  @ApiPropertyOptional({ example: 499 })
  @IsNumber()
  @IsOptional()
  amount?: number;

  @ApiPropertyOptional({ example: 'paid', enum: PaymentStatus })
  @IsEnum(PaymentStatus)
  @IsOptional()
  paymentStatus?: PaymentStatus;

  @ApiPropertyOptional({ example: 'card' })
  @IsString()
  @IsOptional()
  paymentMethod?: string;

  @ApiPropertyOptional({ example: 'TXN123456' })
  @IsString()
  @IsOptional()
  paymentRef?: string;

  @ApiPropertyOptional({ example: true })
  @IsBoolean()
  @IsOptional()
  autoRenew?: boolean;

  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  notes?: string;
}

export class CancelSubscriptionDto {
  @ApiPropertyOptional({ example: 'Customer requested cancellation' })
  @IsString()
  @IsOptional()
  cancelReason?: string;
}
