import { IsString, IsNotEmpty, IsEmail, MinLength, IsOptional, IsNumber } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

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

  @ApiPropertyOptional({ description: 'Phone number' })
  @IsString()
  @IsOptional()
  phone?: string;

  @ApiProperty({ description: 'Gym ID to register for' })
  @IsNumber()
  @IsNotEmpty()
  gymId: number;
}
