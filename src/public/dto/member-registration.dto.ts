import { IsString, IsNotEmpty, IsEmail, MinLength, IsOptional, IsNumber, IsEnum } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { GENDERS } from '../../constants';
import type { Gender } from '../../constants';

export class MemberRegistrationDto {
  @ApiProperty({ description: 'User full name' })
  @IsString()
  @IsNotEmpty()
  name: string;

  @ApiProperty({ description: 'User email address' })
  @IsEmail()
  email: string;

  @ApiProperty({ description: 'Password (minimum 6 characters)' })
  @IsString()
  @MinLength(6)
  password: string;

  @ApiProperty({ description: 'Phone number' })
  @IsString()
  @IsNotEmpty()
  phone: string;

  @ApiProperty({ description: 'Gender', enum: GENDERS })
  @IsEnum(GENDERS)
  @IsNotEmpty()
  gender: Gender;

  @ApiProperty({ description: 'Gym ID to register for' })
  @IsNumber()
  @IsNotEmpty()
  gymId: number;

  @ApiPropertyOptional({ description: 'Branch ID to register for' })
  @IsNumber()
  @IsOptional()
  branchId?: number;

  @ApiPropertyOptional({ description: 'Date of joining' })
  @IsString()
  @IsOptional()
  joinDate?: string;
}
