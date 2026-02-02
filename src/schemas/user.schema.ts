import { z } from 'zod';
import { createZodDto } from 'nestjs-zod';

// ============================================
// CONSTANTS (matching src/constants/index.ts)
// ============================================

export const USER_ROLES = [
  'superadmin',
  'admin',
  'branch_admin',
  'manager',
  'trainer',
  'client',
] as const;

export const STAFF_ROLES = ['admin', 'manager', 'trainer', 'branch_admin'] as const;

export const USER_STATUSES = [
  'onboarding',
  'confirm',
  'active',
  'expired',
  'inactive',
  'rejected',
  'archive',
  'suspended',
] as const;

export const GENDERS = ['male', 'female', 'other'] as const;

// ============================================
// BASE FIELD SCHEMAS (reusable)
// ============================================

const nameField = z.string().min(1, 'Name is required').max(255);
const emailField = z.string().email('Invalid email address');
const passwordField = z.string().min(6, 'Password must be at least 6 characters');
const phoneField = z.string().max(50).optional();
const avatarField = z.string().url().or(z.string().max(500)).optional();
const bioField = z.string().max(1000).optional();
const addressField = z.string().max(500).optional();
const cityField = z.string().max(100).optional();
const stateField = z.string().max(100).optional();
const zipCodeField = z.string().max(20).optional();
const dateOfBirthField = z.string().optional();

// ============================================
// CREATE STAFF SCHEMA
// ============================================

export const createStaffSchema = z.object({
  name: nameField,
  email: emailField,
  password: passwordField,
  role: z.enum(STAFF_ROLES).default('trainer'),
  phone: phoneField,
  avatar: avatarField,
  bio: bioField,
  status: z.enum(USER_STATUSES).optional(),
  dateOfBirth: dateOfBirthField,
  gender: z.enum(GENDERS).optional(),
  address: addressField,
  city: cityField,
  state: stateField,
  zipCode: zipCodeField,
  branchId: z.number().int().positive().optional(),
  branchIds: z.array(z.number().int().positive()).optional(),
});

// ============================================
// UPDATE STAFF SCHEMA (partial, no password)
// ============================================

export const updateStaffSchema = createStaffSchema
  .partial()
  .omit({ password: true });

// ============================================
// CREATE CLIENT SCHEMA
// ============================================

export const createClientSchema = z.object({
  name: nameField,
  email: emailField,
  password: passwordField.optional(), // Optional for clients (can be set later)
  phone: phoneField,
  avatar: avatarField,
  bio: bioField,
  status: z.enum(USER_STATUSES).optional(),
  dateOfBirth: dateOfBirthField,
  gender: z.enum(GENDERS).optional(),
  address: addressField,
  city: cityField,
  state: stateField,
  zipCode: zipCodeField,
  emergencyContactName: z.string().max(255).optional(),
  emergencyContactPhone: z.string().max(50).optional(),
  branchId: z.number().int().positive().optional(),
  joinDate: z.string().optional(),
});

// ============================================
// UPDATE CLIENT SCHEMA (partial, no password)
// ============================================

export const updateClientSchema = createClientSchema
  .partial()
  .omit({ password: true });

// ============================================
// CREATE USER SCHEMA (generic)
// ============================================

export const createUserSchema = z.object({
  name: nameField,
  email: emailField,
  password: passwordField.optional(),
  phone: phoneField,
  avatar: avatarField,
  bio: bioField,
  role: z.enum(USER_ROLES).optional(),
  status: z.enum(USER_STATUSES).optional(),
  dateOfBirth: dateOfBirthField,
  gender: z.enum(GENDERS).optional(),
  address: addressField,
  city: cityField,
  state: stateField,
  zipCode: zipCodeField,
  gymId: z.number().int().positive().optional(),
  trainerId: z.number().int().positive().optional(),
  branchId: z.number().int().positive().optional(),
  branchIds: z.array(z.number().int().positive()).optional(),
  joinDate: z.string().optional(),
});

// ============================================
// UPDATE USER SCHEMA (partial)
// ============================================

export const updateUserSchema = createUserSchema.partial();

// ============================================
// QUERY SCHEMAS
// ============================================

export const getUsersQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(10),
  search: z.string().optional(),
  role: z.enum(USER_ROLES).optional(),
  status: z.enum(USER_STATUSES).optional(),
  branchId: z.coerce.number().int().positive().optional(),
  trainerId: z.coerce.number().int().positive().optional(),
  noPagination: z.enum(['true', 'false']).transform((v) => v === 'true').optional(),
});

export const getStaffQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(10),
  search: z.string().optional(),
  role: z.enum(STAFF_ROLES).optional(),
  status: z.enum(USER_STATUSES).optional(),
  branchId: z.coerce.number().int().positive().optional(),
  noPagination: z.enum(['true', 'false']).transform((v) => v === 'true').optional(),
});

export const getClientsQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(10),
  search: z.string().optional(),
  status: z.enum(USER_STATUSES).optional(),
  branchId: z.coerce.number().int().positive().optional(),
  trainerId: z.coerce.number().int().positive().optional(),
  membershipStatus: z.enum(['active', 'expired', 'none']).optional(),
  noPagination: z.enum(['true', 'false']).transform((v) => v === 'true').optional(),
});

// ============================================
// ADMIN ACTIONS SCHEMAS
// ============================================

export const adminResetPasswordSchema = z.object({
  newPassword: passwordField,
});

export const approveRequestSchema = z.object({
  planId: z.number().int().positive().optional(),
  startDate: z.string().optional(),
  paymentMethod: z.string().optional(),
  notes: z.string().max(500).optional(),
});

export const bulkUpdateUsersSchema = z.object({
  userIds: z.array(z.number().int().positive()).min(1),
  branchIds: z.array(z.number().int().positive()).optional(),
  status: z.enum(USER_STATUSES).optional(),
});

export const bulkDeleteUsersSchema = z.object({
  userIds: z.array(z.number().int().positive()).min(1),
});

// ============================================
// DTO CLASSES (for NestJS controllers)
// ============================================

export class CreateStaffDto extends createZodDto(createStaffSchema) {}
export class UpdateStaffDto extends createZodDto(updateStaffSchema) {}
export class CreateClientDto extends createZodDto(createClientSchema) {}
export class UpdateClientDto extends createZodDto(updateClientSchema) {}
export class CreateUserDto extends createZodDto(createUserSchema) {}
export class UpdateUserDto extends createZodDto(updateUserSchema) {}
export class GetUsersQueryDto extends createZodDto(getUsersQuerySchema) {}
export class GetStaffQueryDto extends createZodDto(getStaffQuerySchema) {}
export class GetClientsQueryDto extends createZodDto(getClientsQuerySchema) {}
export class AdminResetPasswordDto extends createZodDto(adminResetPasswordSchema) {}
export class ApproveRequestDto extends createZodDto(approveRequestSchema) {}
export class BulkUpdateUsersDto extends createZodDto(bulkUpdateUsersSchema) {}
export class BulkDeleteUsersDto extends createZodDto(bulkDeleteUsersSchema) {}

// ============================================
// TYPE EXPORTS
// ============================================

export type UserRole = (typeof USER_ROLES)[number];
export type StaffRole = (typeof STAFF_ROLES)[number];
export type UserStatus = (typeof USER_STATUSES)[number];
export type Gender = (typeof GENDERS)[number];

export type CreateStaff = z.infer<typeof createStaffSchema>;
export type UpdateStaff = z.infer<typeof updateStaffSchema>;
export type CreateClient = z.infer<typeof createClientSchema>;
export type UpdateClient = z.infer<typeof updateClientSchema>;
export type CreateUser = z.infer<typeof createUserSchema>;
export type UpdateUser = z.infer<typeof updateUserSchema>;
export type GetUsersQuery = z.infer<typeof getUsersQuerySchema>;
export type GetStaffQuery = z.infer<typeof getStaffQuerySchema>;
export type GetClientsQuery = z.infer<typeof getClientsQuerySchema>;
