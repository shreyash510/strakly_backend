import {
  IsString,
  IsNotEmpty,
  Length,
  IsNumber,
  IsOptional,
  IsIn,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class MarkAttendanceDto {
  @ApiProperty({ description: '4-digit attendance code', example: '1234' })
  @IsString()
  @IsNotEmpty()
  @Length(4, 4)
  code: string;

  @ApiProperty({ description: 'Staff ID who is marking attendance' })
  @IsNumber()
  @IsNotEmpty()
  @Type(() => Number)
  staffId: number;

  @ApiPropertyOptional({
    description: 'Gym ID where attendance is being marked (resolved from user context if not provided)',
  })
  @IsOptional()
  @IsNumber()
  @Type(() => Number)
  gymId?: number;

  @ApiPropertyOptional({
    description: 'Branch ID where attendance is being marked',
  })
  @IsOptional()
  @IsNumber()
  @Type(() => Number)
  branchId?: number;

  @ApiPropertyOptional({
    description: 'Check-in method',
    enum: ['code', 'qr', 'manual', 'self'],
    default: 'code',
  })
  @IsOptional()
  @IsString()
  @IsIn(['code', 'qr', 'manual', 'self'])
  checkInMethod?: string;
}
