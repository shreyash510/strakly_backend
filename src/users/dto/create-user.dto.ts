import { IsString, IsEmail, IsOptional, IsEnum, IsInt, IsNotEmpty } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { USER_ROLES, USER_STATUSES, GENDERS } from '../../constants';
import type { UserRole, UserStatus, Gender } from '../../constants';

export type { UserRole, UserStatus, Gender };

// Base DTO with common fields
export class CreateUserDto {
  @ApiProperty({ description: 'User name' })
  @IsString()
  @IsNotEmpty()
  name: string;

  @ApiProperty({ description: 'User email' })
  @IsEmail()
  @IsNotEmpty()
  email: string;

  @ApiPropertyOptional({ description: 'User password' })
  @IsOptional()
  @IsString()
  password?: string;

  @ApiPropertyOptional({ description: 'User phone' })
  @IsOptional()
  @IsString()
  phone?: string;

  @ApiPropertyOptional({ description: 'User avatar URL' })
  @IsOptional()
  @IsString()
  avatar?: string;

  @ApiPropertyOptional({ description: 'User bio' })
  @IsOptional()
  @IsString()
  bio?: string;

  @ApiPropertyOptional({ description: 'User role', enum: USER_ROLES })
  @IsOptional()
  @IsEnum(USER_ROLES)
  role?: UserRole;

  @ApiPropertyOptional({ description: 'User status', enum: USER_STATUSES })
  @IsOptional()
  @IsEnum(USER_STATUSES)
  status?: UserStatus;

  @ApiPropertyOptional({ description: 'Date of birth' })
  @IsOptional()
  @IsString()
  dateOfBirth?: string;

  @ApiPropertyOptional({ description: 'Gender', enum: GENDERS })
  @IsOptional()
  @IsEnum(GENDERS)
  gender?: Gender;

  @ApiPropertyOptional({ description: 'Address' })
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

  @ApiPropertyOptional({ description: 'ZIP code' })
  @IsOptional()
  @IsString()
  zipCode?: string;

  @ApiPropertyOptional({ description: 'Gym ID' })
  @IsOptional()
  @IsInt()
  gymId?: number;

  @ApiPropertyOptional({ description: 'Trainer ID' })
  @IsOptional()
  @IsInt()
  trainerId?: number;

  @ApiPropertyOptional({ description: 'Branch ID' })
  @IsOptional()
  @IsInt()
  branchId?: number;
}

// DTO for creating staff (admin, manager, trainer) - stored in public.users
export class CreateStaffDto {
  @ApiProperty({ description: 'Staff name' })
  @IsString()
  @IsNotEmpty()
  name: string;

  @ApiProperty({ description: 'Staff email' })
  @IsEmail()
  @IsNotEmpty()
  email: string;

  @ApiProperty({ description: 'Staff password' })
  @IsString()
  @IsNotEmpty()
  password: string;

  @ApiProperty({ description: 'Staff role', enum: ['admin', 'manager', 'trainer'] })
  @IsEnum(['admin', 'manager', 'trainer'])
  @IsNotEmpty()
  role: 'admin' | 'manager' | 'trainer';

  @ApiPropertyOptional({ description: 'Staff phone' })
  @IsOptional()
  @IsString()
  phone?: string;

  @ApiPropertyOptional({ description: 'Staff avatar URL' })
  @IsOptional()
  @IsString()
  avatar?: string;

  @ApiPropertyOptional({ description: 'Staff bio' })
  @IsOptional()
  @IsString()
  bio?: string;

  @ApiPropertyOptional({ description: 'Staff status', enum: USER_STATUSES })
  @IsOptional()
  @IsEnum(USER_STATUSES)
  status?: UserStatus;

  @ApiPropertyOptional({ description: 'Date of birth' })
  @IsOptional()
  @IsString()
  dateOfBirth?: string;

  @ApiPropertyOptional({ description: 'Gender', enum: GENDERS })
  @IsOptional()
  @IsEnum(GENDERS)
  gender?: Gender;

  @ApiPropertyOptional({ description: 'Address' })
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

  @ApiPropertyOptional({ description: 'ZIP code' })
  @IsOptional()
  @IsString()
  zipCode?: string;

  @ApiPropertyOptional({ description: 'Branch ID' })
  @IsOptional()
  @IsInt()
  branchId?: number;
}

// DTO for creating client (member) - stored in tenant.users
export class CreateClientDto {
  @ApiProperty({ description: 'Client name' })
  @IsString()
  @IsNotEmpty()
  name: string;

  @ApiProperty({ description: 'Client email' })
  @IsEmail()
  @IsNotEmpty()
  email: string;

  @ApiProperty({ description: 'Client password' })
  @IsString()
  @IsNotEmpty()
  password: string;

  @ApiPropertyOptional({ description: 'Client phone' })
  @IsOptional()
  @IsString()
  phone?: string;

  @ApiPropertyOptional({ description: 'Client avatar URL' })
  @IsOptional()
  @IsString()
  avatar?: string;

  @ApiPropertyOptional({ description: 'Client bio' })
  @IsOptional()
  @IsString()
  bio?: string;

  @ApiPropertyOptional({ description: 'Client status', enum: USER_STATUSES })
  @IsOptional()
  @IsEnum(USER_STATUSES)
  status?: UserStatus;

  @ApiPropertyOptional({ description: 'Date of birth' })
  @IsOptional()
  @IsString()
  dateOfBirth?: string;

  @ApiPropertyOptional({ description: 'Gender', enum: GENDERS })
  @IsOptional()
  @IsEnum(GENDERS)
  gender?: Gender;

  @ApiPropertyOptional({ description: 'Address' })
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

  @ApiPropertyOptional({ description: 'ZIP code' })
  @IsOptional()
  @IsString()
  zipCode?: string;

  @ApiPropertyOptional({ description: 'Emergency contact name' })
  @IsOptional()
  @IsString()
  emergencyContactName?: string;

  @ApiPropertyOptional({ description: 'Emergency contact phone' })
  @IsOptional()
  @IsString()
  emergencyContactPhone?: string;

  @ApiPropertyOptional({ description: 'Branch ID' })
  @IsOptional()
  @IsInt()
  branchId?: number;
}

export class UpdateUserDto {
  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsEmail()
  email?: string;

  @IsOptional()
  @IsString()
  phone?: string;

  @IsOptional()
  @IsString()
  avatar?: string;

  @IsOptional()
  @IsString()
  bio?: string;

  @IsOptional()
  @IsEnum(USER_ROLES)
  role?: UserRole;

  @IsOptional()
  @IsEnum(USER_STATUSES)
  status?: UserStatus;

  @IsOptional()
  @IsString()
  dateOfBirth?: string;

  @IsOptional()
  @IsEnum(GENDERS)
  gender?: Gender;

  @IsOptional()
  @IsString()
  address?: string;

  @IsOptional()
  @IsString()
  city?: string;

  @IsOptional()
  @IsString()
  state?: string;

  @IsOptional()
  @IsString()
  zipCode?: string;

  @IsOptional()
  @IsInt()
  gymId?: number;

  @IsOptional()
  @IsInt()
  trainerId?: number;

  @IsOptional()
  @IsInt()
  branchId?: number;
}

export class ResetPasswordDto {
  @IsString()
  newPassword: string;
}
