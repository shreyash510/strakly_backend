import { IsString, IsOptional, IsEnum, IsDateString } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateReportDto {
  @ApiProperty({ description: 'Report title' })
  @IsString()
  title: string;

  @ApiPropertyOptional({ description: 'Report description' })
  @IsOptional()
  @IsString()
  description?: string;

  @ApiProperty({ description: 'Report type', enum: ['revenue', 'membership', 'attendance', 'trainer_performance', 'equipment', 'custom'] })
  @IsEnum(['revenue', 'membership', 'attendance', 'trainer_performance', 'equipment', 'custom'])
  type: string;

  @ApiPropertyOptional({ description: 'Status', enum: ['draft', 'generated', 'published', 'archived'] })
  @IsOptional()
  @IsEnum(['draft', 'generated', 'published', 'archived'])
  status?: string;

  @ApiProperty({ description: 'Period', enum: ['daily', 'weekly', 'monthly', 'quarterly', 'yearly', 'custom'] })
  @IsEnum(['daily', 'weekly', 'monthly', 'quarterly', 'yearly', 'custom'])
  period: string;

  @ApiProperty({ description: 'Start date (ISO format)' })
  @IsDateString()
  startDate: string;

  @ApiProperty({ description: 'End date (ISO format)' })
  @IsDateString()
  endDate: string;

  @ApiPropertyOptional({ description: 'Gym ID' })
  @IsOptional()
  @IsString()
  gymId?: string;
}

export class UpdateReportDto {
  @ApiPropertyOptional({ description: 'Report title' })
  @IsOptional()
  @IsString()
  title?: string;

  @ApiPropertyOptional({ description: 'Report description' })
  @IsOptional()
  @IsString()
  description?: string;

  @ApiPropertyOptional({ description: 'Status', enum: ['draft', 'generated', 'published', 'archived'] })
  @IsOptional()
  @IsEnum(['draft', 'generated', 'published', 'archived'])
  status?: string;
}
