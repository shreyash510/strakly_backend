import {
  IsString,
  IsNotEmpty,
  IsEmail,
  IsOptional,
  IsEnum,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';

export enum GoogleAuthIntent {
  LOGIN = 'login',
  SIGNUP = 'signup',
}

/**
 * DTO for Google OAuth callback
 */
export class GoogleCallbackDto {
  @IsString()
  @IsNotEmpty()
  code: string;

  @IsEnum(GoogleAuthIntent)
  intent: GoogleAuthIntent;
}

/**
 * Google user data returned after OAuth verification
 */
export class GoogleUserDto {
  @IsString()
  @IsNotEmpty()
  googleId: string;

  @IsString()
  @IsNotEmpty()
  name: string;

  @IsEmail()
  email: string;

  @IsString()
  @IsOptional()
  picture?: string;
}

/**
 * DTO for Gym data during Google registration
 */
class GoogleGymDto {
  @IsString()
  @IsNotEmpty()
  name: string;

  @IsString()
  @IsOptional()
  phone?: string;

  @IsEmail()
  @IsOptional()
  email?: string;

  @IsString()
  @IsOptional()
  address?: string;

  @IsString()
  @IsOptional()
  city?: string;

  @IsString()
  @IsOptional()
  state?: string;

  @IsString()
  @IsOptional()
  zipCode?: string;

  @IsString()
  @IsOptional()
  country?: string;
}

/**
 * DTO for registering Google user with gym
 */
export class GoogleRegisterWithGymDto {
  @ValidateNested()
  @Type(() => GoogleUserDto)
  user: GoogleUserDto;

  @ValidateNested()
  @Type(() => GoogleGymDto)
  gym: GoogleGymDto;
}

/**
 * Response for Google OAuth callback when signup requires gym setup
 */
export interface GoogleSignupPendingResponse {
  requiresGymSetup: true;
  googleUser: {
    googleId: string;
    name: string;
    email: string;
    picture?: string;
  };
}
