import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsString, IsOptional } from 'class-validator';

export class UpdatePaymentConfigDto {
  @ApiPropertyOptional({ example: 'HDFC Bank' })
  @IsString()
  @IsOptional()
  payment_bank_name?: string;

  @ApiPropertyOptional({ example: 'Strakly Technologies Pvt Ltd' })
  @IsString()
  @IsOptional()
  payment_bank_account_name?: string;

  @ApiPropertyOptional({ example: '50200012345678' })
  @IsString()
  @IsOptional()
  payment_bank_account_number?: string;

  @ApiPropertyOptional({ example: 'HDFC0001234' })
  @IsString()
  @IsOptional()
  payment_bank_ifsc?: string;

  @ApiPropertyOptional({ example: 'strakly@upi' })
  @IsString()
  @IsOptional()
  payment_upi_id?: string;

  @ApiPropertyOptional({ example: 'payments@strakly.com' })
  @IsString()
  @IsOptional()
  payment_paypal_email?: string;

  @ApiPropertyOptional({ example: 'payments@strakly.com' })
  @IsString()
  @IsOptional()
  payment_wise_email?: string;

  @ApiPropertyOptional({
    example: 'After making the payment, enter the transaction reference below for faster verification.',
  })
  @IsString()
  @IsOptional()
  payment_instructions?: string;
}
