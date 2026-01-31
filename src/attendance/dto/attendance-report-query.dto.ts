import { IsString, IsOptional, IsNumber } from 'class-validator';
import { Type, Transform } from 'class-transformer';
import { ApiPropertyOptional } from '@nestjs/swagger';

export class AttendanceReportQueryDto {
  @ApiPropertyOptional({
    description: 'Start date for report (YYYY-MM-DD)',
    example: '2025-01-01',
  })
  @IsOptional()
  @IsString()
  startDate?: string;

  @ApiPropertyOptional({
    description: 'End date for report (YYYY-MM-DD)',
    example: '2025-01-31',
  })
  @IsOptional()
  @IsString()
  endDate?: string;

  @ApiPropertyOptional({ description: 'Filter by branch ID' })
  @IsOptional()
  @IsNumber()
  @Type(() => Number)
  @Transform(({ value }) => (value ? Number(value) : undefined))
  branchId?: number;

  @ApiPropertyOptional({ description: 'Gym ID (required for superadmin)' })
  @IsOptional()
  @IsNumber()
  @Type(() => Number)
  @Transform(({ value }) => (value ? Number(value) : undefined))
  gymId?: number;
}
