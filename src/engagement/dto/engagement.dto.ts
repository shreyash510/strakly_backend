import { IsOptional, IsString, IsNumber, IsBoolean } from 'class-validator';
import { Type } from 'class-transformer';
import { ApiPropertyOptional } from '@nestjs/swagger';

export class EngagementFiltersDto {
  @ApiPropertyOptional({ description: 'Filter by risk level: low, medium, high, critical' })
  @IsOptional()
  @IsString()
  riskLevel?: string;

  @ApiPropertyOptional({ description: 'Filter by branch ID' })
  @IsOptional()
  @IsNumber()
  @Type(() => Number)
  branchId?: number;

  @ApiPropertyOptional({ default: 1 })
  @IsOptional()
  @IsNumber()
  @Type(() => Number)
  page?: number;

  @ApiPropertyOptional({ default: 15 })
  @IsOptional()
  @IsNumber()
  @Type(() => Number)
  limit?: number;
}

export class AcknowledgeAlertDto {
  @ApiPropertyOptional({ description: 'Description of the action taken to address the alert' })
  @IsOptional()
  @IsString()
  actionTaken?: string;
}

export class AlertFiltersDto {
  @ApiPropertyOptional({ description: 'Filter by risk level: low, medium, high, critical' })
  @IsOptional()
  @IsString()
  riskLevel?: string;

  @ApiPropertyOptional({ description: 'Filter by acknowledgement status' })
  @IsOptional()
  @IsBoolean()
  @Type(() => Boolean)
  isAcknowledged?: boolean;

  @ApiPropertyOptional({ default: 1 })
  @IsOptional()
  @IsNumber()
  @Type(() => Number)
  page?: number;

  @ApiPropertyOptional({ default: 15 })
  @IsOptional()
  @IsNumber()
  @Type(() => Number)
  limit?: number;
}
