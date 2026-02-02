import { z } from 'zod';
import { createZodDto } from 'nestjs-zod';

// ============================================
// BASE FIELD SCHEMAS
// ============================================

const emailField = z.string().email('Invalid email address');
const passwordField = z.string().min(6, 'Password must be at least 6 characters');
const nameField = z.string().min(1, 'Name is required').max(255);

// ============================================
// LOGIN SCHEMA
// ============================================

export const loginSchema = z.object({
  email: emailField,
  password: z.string().min(1, 'Password is required'),
});

// ============================================
// REGISTER SCHEMAS
// ============================================

export const registerAdminSchema = z.object({
  name: nameField,
  email: emailField,
  password: passwordField,
});

/**
 * User data for registration with gym
 */
export const registerUserDataSchema = z.object({
  name: nameField,
  email: emailField,
  password: passwordField,
  phone: z.string().optional(),
});

/**
 * Gym data for registration with gym
 */
export const registerGymDataSchema = z.object({
  name: z.string().min(1, 'Gym name is required').max(255),
  phone: z.string().optional(),
  email: z.string().email().optional(),
  address: z.string().optional(),
  city: z.string().optional(),
  state: z.string().optional(),
  zipCode: z.string().optional(),
  country: z.string().optional(),
});

/**
 * Combined registration with gym
 */
export const registerAdminWithGymSchema = z.object({
  user: registerUserDataSchema,
  gym: registerGymDataSchema,
});

// ============================================
// OTP SCHEMAS
// ============================================

export const sendOtpSchema = z.object({
  email: emailField,
  name: z.string().optional(),
});

export const verifyOtpSchema = z.object({
  email: emailField,
  otp: z.string().length(6, 'OTP must be 6 digits'),
});

// ============================================
// PASSWORD SCHEMAS
// ============================================

export const forgotPasswordSchema = z.object({
  email: emailField,
});

export const resetPasswordSchema = z.object({
  token: z.string().min(1, 'Token is required'),
  password: passwordField,
});

export const changePasswordSchema = z.object({
  currentPassword: z.string().min(1, 'Current password is required'),
  newPassword: passwordField,
});

// ============================================
// GOOGLE AUTH SCHEMAS
// ============================================

export const googleAuthSchema = z.object({
  credential: z.string().min(1, 'Google credential is required'),
});

export const googleSignupSchema = z.object({
  credential: z.string().min(1, 'Google credential is required'),
  gym: registerGymDataSchema.optional(),
});

// ============================================
// UPDATE PROFILE SCHEMA
// ============================================

export const updateProfileSchema = z.object({
  name: nameField.optional(),
  phone: z.string().optional(),
  avatar: z.string().url().or(z.string().max(500)).optional(),
  bio: z.string().max(1000).optional(),
  dateOfBirth: z.string().optional(),
  gender: z.enum(['male', 'female', 'other']).optional(),
  address: z.string().max(500).optional(),
  city: z.string().max(100).optional(),
  state: z.string().max(100).optional(),
  zipCode: z.string().max(20).optional(),
});

// ============================================
// DTO CLASSES (for NestJS controllers)
// ============================================

export class LoginDto extends createZodDto(loginSchema) {}
export class RegisterAdminDto extends createZodDto(registerAdminSchema) {}
export class RegisterAdminWithGymDto extends createZodDto(registerAdminWithGymSchema) {}
export class SendOtpDto extends createZodDto(sendOtpSchema) {}
export class VerifyOtpDto extends createZodDto(verifyOtpSchema) {}
export class ForgotPasswordDto extends createZodDto(forgotPasswordSchema) {}
export class ResetPasswordDto extends createZodDto(resetPasswordSchema) {}
export class ChangePasswordDto extends createZodDto(changePasswordSchema) {}
export class GoogleAuthDto extends createZodDto(googleAuthSchema) {}
export class GoogleSignupDto extends createZodDto(googleSignupSchema) {}
export class UpdateProfileDto extends createZodDto(updateProfileSchema) {}

// ============================================
// TYPE EXPORTS
// ============================================

export type Login = z.infer<typeof loginSchema>;
export type RegisterAdmin = z.infer<typeof registerAdminSchema>;
export type RegisterAdminWithGym = z.infer<typeof registerAdminWithGymSchema>;
export type SendOtp = z.infer<typeof sendOtpSchema>;
export type VerifyOtp = z.infer<typeof verifyOtpSchema>;
export type ForgotPassword = z.infer<typeof forgotPasswordSchema>;
export type ResetPassword = z.infer<typeof resetPasswordSchema>;
export type ChangePassword = z.infer<typeof changePasswordSchema>;
export type GoogleAuth = z.infer<typeof googleAuthSchema>;
export type GoogleSignup = z.infer<typeof googleSignupSchema>;
export type UpdateProfile = z.infer<typeof updateProfileSchema>;
