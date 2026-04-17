import {
  IsString,
  IsNumber,
  IsOptional,
  IsBoolean,
  IsDateString,
  IsNotEmpty,
  MinLength,
  Min,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateExpenseDto {
  @ApiPropertyOptional({ description: 'Staff member this expense is for (optional — omit for gym-level expenses like rent, utilities)' })
  @IsOptional()
  @IsNumber()
  staffId?: number;

  @ApiProperty({ description: 'Reason for the expense (min 5 chars)' })
  @IsString()
  @MinLength(5)
  reason: string;

  @ApiProperty()
  @IsNumber()
  @Min(0.01)
  amount: number;

  @ApiProperty()
  @IsNumber()
  categoryId: number;

  @ApiProperty({ description: 'Date the expense was incurred (YYYY-MM-DD)' })
  @IsDateString()
  expenseDate: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  title?: string;

  @ApiPropertyOptional({ description: 'Free-form description (optional; reason is the required field)' })
  @IsOptional()
  @IsString()
  description?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  currency?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  receiptUrl?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  isRecurring?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  recurringDay?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  recurringFrequency?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  notes?: string;
}

export class UpdateExpenseDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  staffId?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  categoryId?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  title?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  @Min(0.01)
  amount?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MinLength(5)
  reason?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  description?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  expenseDate?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  receiptUrl?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  isRecurring?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  recurringDay?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  recurringFrequency?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  notes?: string;
}

export class ApproveExpenseDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  notes?: string;
}

export class RejectExpenseDto {
  @ApiProperty({ description: 'Reason for rejection (min 5 chars)' })
  @IsString()
  @MinLength(5)
  rejectionReason: string;
}

export class MarkExpensePaidDto {
  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  paymentMethod: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  paymentRef?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  notes?: string;
}

export class CreateExpenseCategoryDto {
  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  name: string;

  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  code: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  icon?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  color?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  sortOrder?: number;
}
