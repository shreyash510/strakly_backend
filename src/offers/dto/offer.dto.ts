import { IsString, IsOptional, IsNumber, IsBoolean, IsDateString, IsArray, Min } from 'class-validator';
import { Type } from 'class-transformer';

export class CreateOfferDto {
  @IsString()
  code: string;

  @IsString()
  name: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsString()
  discountType: string;  // percentage, fixed

  @IsNumber()
  @Min(0)
  @Type(() => Number)
  discountValue: number;

  @IsDateString()
  validFrom: string;

  @IsDateString()
  validTo: string;

  @IsOptional()
  @IsNumber()
  @Min(1)
  maxUsageCount?: number;

  @IsOptional()
  @IsNumber()
  @Min(1)
  maxUsagePerUser?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Type(() => Number)
  minPurchaseAmount?: number;

  @IsOptional()
  @IsBoolean()
  applicableToAll?: boolean;

  @IsOptional()
  @IsArray()
  @IsNumber({}, { each: true })
  @Type(() => Number)
  planIds?: number[];  // Plan IDs this offer applies to (if not applicableToAll)
}

export class UpdateOfferDto {
  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsString()
  discountType?: string;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Type(() => Number)
  discountValue?: number;

  @IsOptional()
  @IsDateString()
  validFrom?: string;

  @IsOptional()
  @IsDateString()
  validTo?: string;

  @IsOptional()
  @IsNumber()
  @Min(1)
  maxUsageCount?: number;

  @IsOptional()
  @IsNumber()
  @Min(1)
  maxUsagePerUser?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Type(() => Number)
  minPurchaseAmount?: number;

  @IsOptional()
  @IsBoolean()
  applicableToAll?: boolean;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

export class AssignOfferToPlansDto {
  @IsArray()
  @IsNumber({}, { each: true })
  @Type(() => Number)
  planIds: number[];
}
