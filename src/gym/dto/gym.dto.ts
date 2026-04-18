import {
  IsString,
  IsOptional,
  IsBoolean,
  IsInt,
  IsArray,
  IsEmail,
  IsNotEmpty,
  ValidateNested,
  ValidateIf,
  MinLength,
  IsHexColor,
  IsIn,
} from 'class-validator';
import {
  ApiProperty,
  ApiPropertyOptional,
  PartialType,
  OmitType,
} from '@nestjs/swagger';
import { Type } from 'class-transformer';

export class ReceiptSettingsDto {
  @ApiPropertyOptional() @IsOptional() @IsBoolean() showLogo?: boolean;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() showAddress?: boolean;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() showPhone?: boolean;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() showEmail?: boolean;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() showPaymentMethod?: boolean;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() showReceiptNumber?: boolean;
  @ApiPropertyOptional() @IsOptional() @IsString() headerText?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() footerText?: string;
  @ApiPropertyOptional() @IsOptional() @IsHexColor() accentColor?: string;
  @ApiPropertyOptional({
    enum: ['Arial, sans-serif', 'Georgia, serif', 'Courier New, monospace', 'Trebuchet MS, sans-serif'],
  })
  @IsOptional()
  @IsIn(['Arial, sans-serif', 'Georgia, serif', 'Courier New, monospace', 'Trebuchet MS, sans-serif'])
  fontFamily?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() receiptPrefix?: string;
}

// Admin user details for creating a new gym
export class CreateAdminUserDto {
  @ApiProperty({ description: 'Admin user name' })
  @IsString()
  @IsNotEmpty()
  name: string;

  @ApiProperty({ description: 'Admin user email' })
  @IsEmail()
  @IsNotEmpty()
  email: string;

  @ApiProperty({ description: 'Admin user password' })
  @IsString()
  @MinLength(6)
  @IsNotEmpty()
  password: string;

  @ApiPropertyOptional({ description: 'Admin user phone' })
  @IsOptional()
  @IsString()
  phone?: string;
}

export class CreateGymDto {
  @ApiProperty({ description: 'Admin user details', type: CreateAdminUserDto })
  @ValidateNested()
  @Type(() => CreateAdminUserDto)
  admin: CreateAdminUserDto;

  @ApiProperty({ description: 'Gym name' })
  @IsString()
  @IsNotEmpty()
  name: string;

  @ApiPropertyOptional({ description: 'Gym description' })
  @IsOptional()
  @IsString()
  description?: string;

  @ApiPropertyOptional({ description: 'Gym logo URL' })
  @IsOptional()
  @IsString()
  logo?: string;

  @ApiPropertyOptional({ description: 'Contact phone number' })
  @IsOptional()
  @IsString()
  phone?: string;

  @ApiPropertyOptional({ description: 'Contact email' })
  @IsOptional()
  @IsEmail({}, { message: 'Please enter a valid email address' })
  @ValidateIf((o) => o.email !== '' && o.email !== null)
  email?: string;

  @ApiPropertyOptional({ description: 'Website URL' })
  @IsOptional()
  @IsString()
  website?: string;

  @ApiPropertyOptional({ description: 'Street address' })
  @IsOptional()
  @IsString()
  address?: string;

  @ApiPropertyOptional({ description: 'City' })
  @IsOptional()
  @IsString()
  city?: string;

  @ApiPropertyOptional({ description: 'State' })
  @IsOptional()
  @IsString()
  state?: string;

  @ApiPropertyOptional({ description: 'ZIP/Postal code' })
  @IsOptional()
  @IsString()
  zipCode?: string;

  @ApiPropertyOptional({ description: 'Country', default: 'India' })
  @IsOptional()
  @IsString()
  country?: string;

  @ApiPropertyOptional({ description: 'Currency code', default: 'USD' })
  @IsOptional()
  @IsString()
  currency?: string;

  @ApiPropertyOptional({
    description: 'Opening time (HH:MM format)',
    example: '06:00',
  })
  @IsOptional()
  @IsString()
  openingTime?: string;

  @ApiPropertyOptional({
    description: 'Closing time (HH:MM format)',
    example: '22:00',
  })
  @IsOptional()
  @IsString()
  closingTime?: string;

  @ApiPropertyOptional({ description: 'Maximum capacity' })
  @IsOptional()
  @IsInt()
  capacity?: number;

  @ApiPropertyOptional({ description: 'List of amenities', type: [String] })
  @IsOptional()
  @IsArray()
  amenities?: string[];

  @ApiPropertyOptional({ description: 'Is gym active', default: true })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

// UpdateGymDto excludes admin (can't change admin on update)
export class UpdateGymDto extends PartialType(
  OmitType(CreateGymDto, ['admin'] as const),
) {
  @ApiPropertyOptional({ description: 'Receipt customization settings', type: ReceiptSettingsDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => ReceiptSettingsDto)
  receiptSettings?: ReceiptSettingsDto;
}
