import {
  IsString,
  IsOptional,
  IsEmail,
  IsNotEmpty,
  IsIn,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateContactRequestDto {
  @ApiProperty({ description: 'Name of the person' })
  @IsString()
  @IsNotEmpty()
  name: string;

  @ApiProperty({ description: 'Email address' })
  @IsEmail()
  @IsNotEmpty()
  email: string;

  @ApiPropertyOptional({ description: 'Phone number' })
  @IsOptional()
  @IsString()
  phone?: string;

  @ApiPropertyOptional({ description: 'Subject of the request' })
  @IsOptional()
  @IsString()
  subject?: string;

  @ApiProperty({ description: 'Message content' })
  @IsString()
  @IsNotEmpty()
  message: string;
}

export class UpdateContactRequestDto {
  @ApiPropertyOptional({
    description: 'Status of the request',
    enum: ['new', 'read', 'replied', 'closed'],
  })
  @IsOptional()
  @IsString()
  @IsIn(['new', 'read', 'replied', 'closed'])
  status?: string;

  @ApiPropertyOptional({ description: 'Admin notes' })
  @IsOptional()
  @IsString()
  adminNotes?: string;
}