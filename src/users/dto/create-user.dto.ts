import { IsString, IsEmail, IsOptional, IsEnum } from 'class-validator';

export type UserRole = 'superadmin' | 'admin' | 'trainer' | 'user';
export type UserStatus = 'active' | 'inactive' | 'suspended';
export type Gender = 'male' | 'female' | 'other';

export class CreateUserDto {
  @IsString()
  name: string;

  @IsEmail()
  email: string;

  @IsOptional()
  @IsString()
  password?: string;

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
  @IsEnum(['superadmin', 'admin', 'trainer', 'user'])
  role?: UserRole;

  @IsOptional()
  @IsEnum(['active', 'inactive', 'suspended'])
  status?: UserStatus;

  @IsOptional()
  @IsString()
  dateOfBirth?: string;

  @IsOptional()
  @IsEnum(['male', 'female', 'other'])
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
  @IsString()
  gymId?: string;

  @IsOptional()
  @IsString()
  trainerId?: string;
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
  @IsEnum(['superadmin', 'admin', 'trainer', 'user'])
  role?: UserRole;

  @IsOptional()
  @IsEnum(['active', 'inactive', 'suspended'])
  status?: UserStatus;

  @IsOptional()
  @IsString()
  dateOfBirth?: string;

  @IsOptional()
  @IsEnum(['male', 'female', 'other'])
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
  @IsString()
  gymId?: string;

  @IsOptional()
  @IsString()
  trainerId?: string;
}
