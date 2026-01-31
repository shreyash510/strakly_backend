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

  @ApiProperty({ description: 'Gym ID where attendance is being marked' })
  @IsNumber()
  @IsNotEmpty()
  @Type(() => Number)
  gymId: number;

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
