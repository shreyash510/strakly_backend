import { IsString, IsOptional, IsEnum, IsNumber, IsBoolean, IsDateString, Min } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateSubscriptionDto {
  @ApiProperty({ description: 'User ID' })
  @IsString()
  userId: string;

  @ApiPropertyOptional({ description: 'Gym ID' })
  @IsOptional()
  @IsString()
  gymId?: string;

  @ApiPropertyOptional({ description: 'Subscription plan', enum: ['free', 'basic', 'premium', 'enterprise'] })
  @IsOptional()
  @IsEnum(['free', 'basic', 'premium', 'enterprise'])
  plan?: string;

  @ApiPropertyOptional({ description: 'Status', enum: ['active', 'inactive', 'cancelled', 'expired', 'pending'] })
  @IsOptional()
  @IsEnum(['active', 'inactive', 'cancelled', 'expired', 'pending'])
  status?: string;

  @ApiPropertyOptional({ description: 'Billing cycle', enum: ['monthly', 'quarterly', 'yearly'] })
  @IsOptional()
  @IsEnum(['monthly', 'quarterly', 'yearly'])
  billingCycle?: string;

  @ApiProperty({ description: 'Start date (ISO format)' })
  @IsDateString()
  startDate: string;

  @ApiPropertyOptional({ description: 'End date (ISO format)' })
  @IsOptional()
  @IsDateString()
  endDate?: string;

  @ApiPropertyOptional({ description: 'Amount' })
  @IsOptional()
  @IsNumber()
  @Min(0)
  amount?: number;

  @ApiPropertyOptional({ description: 'Currency' })
  @IsOptional()
  @IsString()
  currency?: string;

  @ApiPropertyOptional({ description: 'Payment method' })
  @IsOptional()
  @IsString()
  paymentMethod?: string;

  @ApiPropertyOptional({ description: 'Auto-renew', default: false })
  @IsOptional()
  @IsBoolean()
  autoRenew?: boolean;
}

export class UpdateSubscriptionDto {
  @ApiPropertyOptional({ description: 'Subscription plan', enum: ['free', 'basic', 'premium', 'enterprise'] })
  @IsOptional()
  @IsEnum(['free', 'basic', 'premium', 'enterprise'])
  plan?: string;

  @ApiPropertyOptional({ description: 'Status', enum: ['active', 'inactive', 'cancelled', 'expired', 'pending'] })
  @IsOptional()
  @IsEnum(['active', 'inactive', 'cancelled', 'expired', 'pending'])
  status?: string;

  @ApiPropertyOptional({ description: 'Billing cycle', enum: ['monthly', 'quarterly', 'yearly'] })
  @IsOptional()
  @IsEnum(['monthly', 'quarterly', 'yearly'])
  billingCycle?: string;

  @ApiPropertyOptional({ description: 'End date (ISO format)' })
  @IsOptional()
  @IsDateString()
  endDate?: string;

  @ApiPropertyOptional({ description: 'Auto-renew' })
  @IsOptional()
  @IsBoolean()
  autoRenew?: boolean;
}
