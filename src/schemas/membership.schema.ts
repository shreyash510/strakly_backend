import { z } from 'zod';
import { createZodDto } from 'nestjs-zod';

// ============================================
// MEMBERSHIP STATUS CONSTANTS
// ============================================

export const MEMBERSHIP_STATUSES = ['active', 'expired', 'cancelled', 'frozen', 'pending'] as const;
export const PAYMENT_STATUSES = ['pending', 'paid', 'partial', 'refunded', 'failed'] as const;

// ============================================
// CREATE MEMBERSHIP SCHEMA
// ============================================

export const createMembershipSchema = z.object({
  userId: z.number().int().positive(),
  gymId: z.number().int().positive().optional(),
  planId: z.number().int().positive(),
  offerCode: z.string().optional(),
  startDate: z.string(), // ISO date string
  paymentMethod: z.string().optional(),
  notes: z.string().max(500).optional(),
  facilityIds: z.array(z.number().int().positive()).optional(),
  amenityIds: z.array(z.number().int().positive()).optional(),
});

// ============================================
// UPDATE MEMBERSHIP SCHEMA
// ============================================

export const updateMembershipSchema = z.object({
  status: z.enum(MEMBERSHIP_STATUSES).optional(),
  paymentStatus: z.enum(PAYMENT_STATUSES).optional(),
  paymentMethod: z.string().optional(),
  paymentRef: z.string().optional(),
  paidAt: z.string().optional(),
  notes: z.string().max(500).optional(),
});

// ============================================
// CANCEL MEMBERSHIP SCHEMA
// ============================================

export const cancelMembershipSchema = z.object({
  reason: z.string().min(1, 'Cancellation reason is required').max(500),
});

// ============================================
// RENEW MEMBERSHIP SCHEMA
// ============================================

export const renewMembershipSchema = z.object({
  gymId: z.number().int().positive(),
  planId: z.number().int().positive().optional(),
  offerCode: z.string().optional(),
  paymentMethod: z.string().optional(),
  notes: z.string().max(500).optional(),
});

// ============================================
// RECORD PAYMENT SCHEMA
// ============================================

export const recordPaymentSchema = z.object({
  paymentMethod: z.string().min(1, 'Payment method is required'),
  paymentRef: z.string().optional(),
  amount: z.number().min(0).optional(),
});

// ============================================
// FREEZE MEMBERSHIP SCHEMA
// ============================================

export const freezeMembershipSchema = z.object({
  reason: z.string().max(500).optional(),
  freezeDays: z.number().int().positive().optional(),
});

// ============================================
// QUERY SCHEMAS
// ============================================

export const getMembershipsQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(10),
  search: z.string().optional(),
  status: z.enum(MEMBERSHIP_STATUSES).optional(),
  paymentStatus: z.enum(PAYMENT_STATUSES).optional(),
  userId: z.coerce.number().int().positive().optional(),
  planId: z.coerce.number().int().positive().optional(),
  branchId: z.coerce.number().int().positive().optional(),
  startDate: z.string().optional(),
  endDate: z.string().optional(),
  noPagination: z.enum(['true', 'false']).transform((v) => v === 'true').optional(),
});

// ============================================
// DTO CLASSES
// ============================================

export class CreateMembershipDto extends createZodDto(createMembershipSchema) {}
export class UpdateMembershipDto extends createZodDto(updateMembershipSchema) {}
export class CancelMembershipDto extends createZodDto(cancelMembershipSchema) {}
export class RenewMembershipDto extends createZodDto(renewMembershipSchema) {}
export class RecordPaymentDto extends createZodDto(recordPaymentSchema) {}
export class FreezeMembershipDto extends createZodDto(freezeMembershipSchema) {}
export class GetMembershipsQueryDto extends createZodDto(getMembershipsQuerySchema) {}

// ============================================
// TYPE EXPORTS
// ============================================

export type MembershipStatus = (typeof MEMBERSHIP_STATUSES)[number];
export type PaymentStatus = (typeof PAYMENT_STATUSES)[number];
export type CreateMembership = z.infer<typeof createMembershipSchema>;
export type UpdateMembership = z.infer<typeof updateMembershipSchema>;
export type CancelMembership = z.infer<typeof cancelMembershipSchema>;
export type RenewMembership = z.infer<typeof renewMembershipSchema>;
export type RecordPayment = z.infer<typeof recordPaymentSchema>;
export type GetMembershipsQuery = z.infer<typeof getMembershipsQuerySchema>;
