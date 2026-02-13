import {
  IsString,
  IsEmail,
  IsOptional,
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsArray,
  IsIn,
  ValidateNested,
  ArrayMinSize,
  ArrayMaxSize,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { ALL_ROLES, USER_STATUSES_ARRAY, GENDERS } from '../../common/constants';
import type { UserRole, UserStatus, Gender } from '../../common/constants';

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

  @ApiPropertyOptional({ description: 'User role', enum: ALL_ROLES })
  @IsOptional()
  @IsEnum(ALL_ROLES)
  role?: UserRole;

  @ApiPropertyOptional({ description: 'User status', enum: USER_STATUSES_ARRAY })
  @IsOptional()
  @IsEnum(USER_STATUSES_ARRAY)
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

  @ApiPropertyOptional({
    description: 'Branch IDs (for branch_admin with multiple branches)',
  })
  @IsOptional()
  @IsArray()
  @IsInt({ each: true })
  branchIds?: number[];

  @ApiPropertyOptional({ description: 'Date of joining' })
  @IsOptional()
  @IsString()
  joinDate?: string;

  @ApiPropertyOptional({ description: 'Referred by (user ID)' })
  @IsOptional()
  @IsInt()
  referredBy?: number;

  @ApiPropertyOptional({ description: 'Personal referral code' })
  @IsOptional()
  @IsString()
  referralCode?: string;

  @ApiPropertyOptional({ description: 'Lead source (walk_in, social_media, website, referral, ad, google, instagram)' })
  @IsOptional()
  @IsString()
  leadSource?: string;

  @ApiPropertyOptional({ description: 'Occupation' })
  @IsOptional()
  @IsString()
  occupation?: string;

  @ApiPropertyOptional({ description: 'Blood group (A+, A-, B+, B-, AB+, AB-, O+, O-)' })
  @IsOptional()
  @IsString()
  bloodGroup?: string;

  @ApiPropertyOptional({ description: 'Medical conditions, allergies, injuries' })
  @IsOptional()
  @IsString()
  medicalConditions?: string;

  @ApiPropertyOptional({ description: 'Fitness goal (weight_loss, muscle_gain, general_fitness, sports, rehab, flexibility)' })
  @IsOptional()
  @IsString()
  fitnessGoal?: string;

  @ApiPropertyOptional({ description: 'Preferred workout time (morning, afternoon, evening)' })
  @IsOptional()
  @IsString()
  preferredTimeSlot?: string;

  @ApiPropertyOptional({ description: 'Nationality' })
  @IsOptional()
  @IsString()
  nationality?: string;

  @ApiPropertyOptional({ description: 'ID proof type (aadhaar, pan, passport, driving_license)' })
  @IsOptional()
  @IsString()
  idType?: string;

  @ApiPropertyOptional({ description: 'ID proof number' })
  @IsOptional()
  @IsString()
  idNumber?: string;
}

// DTO for creating staff (admin, manager, trainer, branch_admin) - stored in public.users or tenant.users
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

  @ApiProperty({
    description: 'Staff role',
    enum: ['admin', 'manager', 'trainer', 'branch_admin'],
  })
  @IsEnum(['admin', 'manager', 'trainer', 'branch_admin'])
  @IsNotEmpty()
  role: 'admin' | 'manager' | 'trainer' | 'branch_admin';

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

  @ApiPropertyOptional({ description: 'Staff status', enum: USER_STATUSES_ARRAY })
  @IsOptional()
  @IsEnum(USER_STATUSES_ARRAY)
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

  @ApiPropertyOptional({
    description: 'Branch IDs (for branch_admin with multiple branches)',
  })
  @IsOptional()
  @IsArray()
  @IsInt({ each: true })
  branchIds?: number[];
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

  @ApiPropertyOptional({ description: 'Client status', enum: USER_STATUSES_ARRAY })
  @IsOptional()
  @IsEnum(USER_STATUSES_ARRAY)
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

  @ApiPropertyOptional({ description: 'Referred by (user ID)' })
  @IsOptional()
  @IsInt()
  referredBy?: number;

  @ApiPropertyOptional({ description: 'Personal referral code' })
  @IsOptional()
  @IsString()
  referralCode?: string;

  @ApiPropertyOptional({ description: 'Lead source' })
  @IsOptional()
  @IsString()
  leadSource?: string;

  @ApiPropertyOptional({ description: 'Occupation' })
  @IsOptional()
  @IsString()
  occupation?: string;

  @ApiPropertyOptional({ description: 'Blood group' })
  @IsOptional()
  @IsString()
  bloodGroup?: string;

  @ApiPropertyOptional({ description: 'Medical conditions' })
  @IsOptional()
  @IsString()
  medicalConditions?: string;

  @ApiPropertyOptional({ description: 'Fitness goal' })
  @IsOptional()
  @IsString()
  fitnessGoal?: string;

  @ApiPropertyOptional({ description: 'Preferred workout time' })
  @IsOptional()
  @IsString()
  preferredTimeSlot?: string;

  @ApiPropertyOptional({ description: 'Nationality' })
  @IsOptional()
  @IsString()
  nationality?: string;

  @ApiPropertyOptional({ description: 'ID proof type' })
  @IsOptional()
  @IsString()
  idType?: string;

  @ApiPropertyOptional({ description: 'ID proof number' })
  @IsOptional()
  @IsString()
  idNumber?: string;

  @ApiPropertyOptional({ description: 'Branch ID' })
  @IsOptional()
  @IsInt()
  branchId?: number;

  @ApiPropertyOptional({ description: 'Date of joining' })
  @IsOptional()
  @IsString()
  joinDate?: string;
}

export class UpdateUserDto {
  @ApiPropertyOptional({ description: 'User name' })
  @IsOptional()
  @IsString()
  name?: string;

  @ApiPropertyOptional({ description: 'User email' })
  @IsOptional()
  @IsEmail()
  email?: string;

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

  @ApiPropertyOptional({ description: 'User role', enum: ALL_ROLES })
  @IsOptional()
  @IsEnum(ALL_ROLES)
  role?: UserRole;

  @ApiPropertyOptional({ description: 'User status', enum: USER_STATUSES_ARRAY })
  @IsOptional()
  @IsEnum(USER_STATUSES_ARRAY)
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

  @ApiPropertyOptional({ description: 'Branch IDs (for users with multiple branches)' })
  @IsOptional()
  @IsArray()
  @IsInt({ each: true })
  branchIds?: number[];

  @ApiPropertyOptional({ description: 'Date of joining' })
  @IsOptional()
  @IsString()
  joinDate?: string;

  @ApiPropertyOptional({ description: 'Referred by (user ID)' })
  @IsOptional()
  @IsInt()
  referredBy?: number;

  @ApiPropertyOptional({ description: 'Personal referral code' })
  @IsOptional()
  @IsString()
  referralCode?: string;

  @ApiPropertyOptional({ description: 'Lead source' })
  @IsOptional()
  @IsString()
  leadSource?: string;

  @ApiPropertyOptional({ description: 'Occupation' })
  @IsOptional()
  @IsString()
  occupation?: string;

  @ApiPropertyOptional({ description: 'Blood group' })
  @IsOptional()
  @IsString()
  bloodGroup?: string;

  @ApiPropertyOptional({ description: 'Medical conditions' })
  @IsOptional()
  @IsString()
  medicalConditions?: string;

  @ApiPropertyOptional({ description: 'Fitness goal' })
  @IsOptional()
  @IsString()
  fitnessGoal?: string;

  @ApiPropertyOptional({ description: 'Preferred workout time' })
  @IsOptional()
  @IsString()
  preferredTimeSlot?: string;

  @ApiPropertyOptional({ description: 'Nationality' })
  @IsOptional()
  @IsString()
  nationality?: string;

  @ApiPropertyOptional({ description: 'ID proof type' })
  @IsOptional()
  @IsString()
  idType?: string;

  @ApiPropertyOptional({ description: 'ID proof number' })
  @IsOptional()
  @IsString()
  idNumber?: string;

  @ApiPropertyOptional({ description: 'Emergency contact name' })
  @IsOptional()
  @IsString()
  emergencyContactName?: string;

  @ApiPropertyOptional({ description: 'Emergency contact phone' })
  @IsOptional()
  @IsString()
  emergencyContactPhone?: string;
}

export class AdminResetPasswordDto {
  @IsString()
  newPassword: string;
}

export class ApproveRequestDto {
  @ApiPropertyOptional({
    description: 'Role to assign to the user (defaults to client)',
    enum: ['client', 'trainer', 'manager'],
  })
  @IsOptional()
  @IsString()
  @IsIn(['client', 'trainer', 'manager'])
  role?: string;

  @ApiPropertyOptional({
    description:
      'Plan ID for membership (optional - skip to approve without membership)',
  })
  @IsOptional()
  @IsInt()
  planId?: number;

  @ApiPropertyOptional({
    description: 'Start date for membership (defaults to today)',
  })
  @IsOptional()
  @IsString()
  startDate?: string;

  @ApiPropertyOptional({ description: 'Payment method' })
  @IsOptional()
  @IsString()
  paymentMethod?: string;

  @ApiPropertyOptional({ description: 'Notes' })
  @IsOptional()
  @IsString()
  notes?: string;
}

export class BulkUpdateUserDto {
  @ApiProperty({ description: 'Array of user IDs to update' })
  @IsArray()
  @IsInt({ each: true })
  @IsNotEmpty()
  userIds: number[];

  @ApiPropertyOptional({ description: 'Branch IDs to assign' })
  @IsOptional()
  @IsArray()
  @IsInt({ each: true })
  branchIds?: number[];

  @ApiPropertyOptional({ description: 'Status to set', enum: USER_STATUSES_ARRAY })
  @IsOptional()
  @IsEnum(USER_STATUSES_ARRAY)
  status?: UserStatus;
}

export class BulkDeleteUserDto {
  @ApiProperty({ description: 'Array of user IDs to delete' })
  @IsArray()
  @IsInt({ each: true })
  @IsNotEmpty()
  userIds: number[];
}

export class BulkCreateUserDto {
  @ApiProperty({
    description: 'Array of users to create (max 50)',
    type: [CreateUserDto],
  })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(50)
  @ValidateNested({ each: true })
  @Type(() => CreateUserDto)
  users: CreateUserDto[];

  @ApiPropertyOptional({ description: 'Branch ID' })
  @IsOptional()
  @IsInt()
  branchId?: number;
}
