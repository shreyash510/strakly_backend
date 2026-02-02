/**
 * Centralized Zod Schemas
 *
 * This folder contains all Zod schemas for validation and type inference.
 * Import from here instead of creating new DTOs in module folders.
 *
 * Usage:
 *   import { LoginDto, type Login } from '../schemas';
 *   // or
 *   import { loginSchema, LoginDto } from '../schemas/auth.schema';
 */

// Common schemas (pagination, IDs, etc.)
export * from './common.schema';

// Auth schemas (login, register, password, OTP)
export * from './auth.schema';

// User schemas (staff, client, CRUD)
export * from './user.schema';

// Gym schemas
export * from './gym.schema';

// Branch schemas
export * from './branch.schema';

// Membership schemas
export * from './membership.schema';

// Attendance schemas
export * from './attendance.schema';
