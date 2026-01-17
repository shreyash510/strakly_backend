import { IsString, IsEmail, IsOptional, IsBoolean, IsNumber, IsArray, Min } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateGymDto {
  @ApiProperty({ description: 'Gym name' })
  @IsString()
  name: string;

  @ApiProperty({ description: 'Gym address' })
  @IsString()
  address: string;

  @ApiProperty({ description: 'City' })
  @IsString()
  city: string;

  @ApiProperty({ description: 'State' })
  @IsString()
  state: string;

  @ApiProperty({ description: 'Zip code' })
  @IsString()
  zipCode: string;

  @ApiPropertyOptional({ description: 'Country' })
  @IsOptional()
  @IsString()
  country?: string;

  @ApiPropertyOptional({ description: 'Phone number' })
  @IsOptional()
  @IsString()
  phone?: string;

  @ApiProperty({ description: 'Email' })
  @IsEmail()
  email: string;

  @ApiPropertyOptional({ description: 'Website URL' })
  @IsOptional()
  @IsString()
  website?: string;

  @ApiPropertyOptional({ description: 'Description' })
  @IsOptional()
  @IsString()
  description?: string;

  @ApiPropertyOptional({ description: 'Opening time (HH:MM format)' })
  @IsOptional()
  @IsString()
  openingTime?: string;

  @ApiPropertyOptional({ description: 'Closing time (HH:MM format)' })
  @IsOptional()
  @IsString()
  closingTime?: string;

  @ApiPropertyOptional({ description: 'Maximum capacity' })
  @IsOptional()
  @IsNumber()
  @Min(1)
  capacity?: number;

  @ApiPropertyOptional({ description: 'Monthly fee' })
  @IsOptional()
  @IsNumber()
  @Min(0)
  monthlyFee?: number;

  @ApiPropertyOptional({ description: 'Is active', default: true })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @ApiPropertyOptional({ description: 'Amenities list', type: [String] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  amenities?: string[];
}
