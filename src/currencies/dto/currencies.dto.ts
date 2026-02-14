import {
  IsNotEmpty,
  IsOptional,
  IsString,
  IsNumber,
  IsBoolean,
  MaxLength,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

// ─── Currency DTOs ───

export class CreateCurrencyDto {
  @ApiProperty({ description: 'ISO 4217 currency code', maxLength: 3 })
  @IsString()
  @IsNotEmpty()
  @MaxLength(3)
  code: string;

  @ApiProperty({ description: 'Currency name' })
  @IsString()
  @IsNotEmpty()
  name: string;

  @ApiProperty({ description: 'Currency symbol (e.g. $, EUR, etc.)' })
  @IsString()
  @IsNotEmpty()
  symbol: string;

  @ApiPropertyOptional({ description: 'Number of decimal places', default: 2 })
  @IsOptional()
  @IsNumber()
  @Type(() => Number)
  decimalPlaces?: number;
}

export class UpdateCurrencyDto {
  @ApiPropertyOptional({ description: 'Whether the currency is active' })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

// ─── Exchange Rate DTOs ───

export class CreateExchangeRateDto {
  @ApiProperty({ description: 'Source currency code' })
  @IsString()
  @IsNotEmpty()
  fromCurrency: string;

  @ApiProperty({ description: 'Target currency code' })
  @IsString()
  @IsNotEmpty()
  toCurrency: string;

  @ApiProperty({ description: 'Exchange rate value' })
  @IsNumber()
  @Type(() => Number)
  rate: number;

  @ApiPropertyOptional({ description: 'Rate source (e.g. manual, API provider)' })
  @IsOptional()
  @IsString()
  source?: string;

  @ApiPropertyOptional({ description: 'Effective date (ISO string)' })
  @IsOptional()
  @IsString()
  effectiveDate?: string;
}

// ─── Convert DTO ───

export class ConvertDto {
  @ApiProperty({ description: 'Source currency code' })
  @IsString()
  @IsNotEmpty()
  from: string;

  @ApiProperty({ description: 'Target currency code' })
  @IsString()
  @IsNotEmpty()
  to: string;

  @ApiProperty({ description: 'Amount to convert' })
  @IsNumber()
  @Type(() => Number)
  amount: number;
}
