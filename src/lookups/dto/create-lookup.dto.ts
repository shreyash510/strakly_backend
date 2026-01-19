import { IsString, IsNotEmpty, IsOptional, IsBoolean, IsInt, IsObject } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateLookupDto {
  @ApiProperty({ example: 'active' })
  @IsString()
  @IsNotEmpty()
  code: string;

  @ApiProperty({ example: 'Active' })
  @IsString()
  @IsNotEmpty()
  name: string;

  @ApiPropertyOptional({ example: 'active' })
  @IsString()
  @IsOptional()
  value?: string;

  @ApiPropertyOptional({ example: 1 })
  @IsInt()
  @IsOptional()
  displayOrder?: number;

  @ApiPropertyOptional({ default: true })
  @IsBoolean()
  @IsOptional()
  isActive?: boolean;

  @ApiPropertyOptional({ example: { color: '#00ff00' } })
  @IsObject()
  @IsOptional()
  metadata?: Record<string, any>;
}

export class UpdateLookupDto {
  @ApiPropertyOptional({ example: 'Active' })
  @IsString()
  @IsOptional()
  name?: string;

  @ApiPropertyOptional({ example: 'active' })
  @IsString()
  @IsOptional()
  value?: string;

  @ApiPropertyOptional({ example: 1 })
  @IsInt()
  @IsOptional()
  displayOrder?: number;

  @ApiPropertyOptional()
  @IsBoolean()
  @IsOptional()
  isActive?: boolean;

  @ApiPropertyOptional({ example: { color: '#00ff00' } })
  @IsObject()
  @IsOptional()
  metadata?: Record<string, any>;
}
