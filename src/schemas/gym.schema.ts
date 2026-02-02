import { z } from 'zod';
import { createZodDto } from 'nestjs-zod';

// ============================================
// BASE FIELD SCHEMAS
// ============================================

const timeRegex = /^([01]\d|2[0-3]):([0-5]\d)$/;

// ============================================
// ADMIN USER FOR GYM CREATION
// ============================================

export const createAdminUserSchema = z.object({
  name: z.string().min(1, 'Name is required').max(255),
  email: z.string().email('Invalid email'),
  password: z.string().min(6, 'Password must be at least 6 characters'),
  phone: z.string().optional(),
});

// ============================================
// CREATE GYM SCHEMA
// ============================================

export const createGymSchema = z.object({
  admin: createAdminUserSchema,
  name: z.string().min(1, 'Gym name is required').max(255),
  description: z.string().max(2000).optional(),
  logo: z.string().url().or(z.string().max(500)).optional(),
  phone: z.string().max(50).optional(),
  email: z.string().email().optional(),
  website: z.string().url().optional(),
  address: z.string().max(500).optional(),
  city: z.string().max(100).optional(),
  state: z.string().max(100).optional(),
  zipCode: z.string().max(20).optional(),
  country: z.string().max(100).default('India'),
  openingTime: z
    .string()
    .regex(timeRegex, 'Opening time must be in HH:MM format')
    .optional(),
  closingTime: z
    .string()
    .regex(timeRegex, 'Closing time must be in HH:MM format')
    .optional(),
  capacity: z.number().int().positive().optional(),
  amenities: z.array(z.string()).optional(),
  isActive: z.boolean().default(true),
});

// ============================================
// UPDATE GYM SCHEMA (no admin field)
// ============================================

export const updateGymSchema = createGymSchema
  .omit({ admin: true })
  .partial();

// ============================================
// GYM QUERY SCHEMA
// ============================================

export const getGymsQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(10),
  search: z.string().optional(),
  isActive: z.enum(['true', 'false']).transform((v) => v === 'true').optional(),
  city: z.string().optional(),
  state: z.string().optional(),
  noPagination: z.enum(['true', 'false']).transform((v) => v === 'true').optional(),
});

// ============================================
// GYM SETTINGS SCHEMA
// ============================================

export const updateGymSettingsSchema = z.object({
  allowClientRegistration: z.boolean().optional(),
  requireApproval: z.boolean().optional(),
  defaultMembershipPlanId: z.number().int().positive().optional(),
  timezone: z.string().optional(),
  currency: z.string().max(3).optional(),
  dateFormat: z.string().optional(),
  notificationEmail: z.string().email().optional(),
});

// ============================================
// DTO CLASSES
// ============================================

export class CreateGymDto extends createZodDto(createGymSchema) {}
export class UpdateGymDto extends createZodDto(updateGymSchema) {}
export class GetGymsQueryDto extends createZodDto(getGymsQuerySchema) {}
export class UpdateGymSettingsDto extends createZodDto(updateGymSettingsSchema) {}

// ============================================
// TYPE EXPORTS
// ============================================

export type CreateGym = z.infer<typeof createGymSchema>;
export type UpdateGym = z.infer<typeof updateGymSchema>;
export type GetGymsQuery = z.infer<typeof getGymsQuerySchema>;
export type UpdateGymSettings = z.infer<typeof updateGymSettingsSchema>;
