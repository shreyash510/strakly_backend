import { z } from 'zod';
import { createZodDto } from 'nestjs-zod';

// ============================================
// MEMBERSHIP TRANSFER ACTION
// ============================================

export const MEMBERSHIP_TRANSFER_ACTIONS = ['cancel', 'transfer', 'keep'] as const;

// ============================================
// CREATE BRANCH SCHEMA
// ============================================

export const createBranchSchema = z.object({
  name: z.string().min(1, 'Branch name is required').max(255),
  code: z.string().min(1, 'Branch code is required').max(50),
  phone: z.string().max(50).optional(),
  email: z.string().email().optional(),
  address: z.string().max(500).optional(),
  city: z.string().max(100).optional(),
  state: z.string().max(100).optional(),
  zipCode: z.string().max(20).optional(),
  isActive: z.boolean().default(true),
});

// ============================================
// UPDATE BRANCH SCHEMA
// ============================================

export const updateBranchSchema = createBranchSchema.partial();

// ============================================
// BRANCH QUERY SCHEMA
// ============================================

export const getBranchesQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(10),
  search: z.string().optional(),
  isActive: z.enum(['true', 'false']).transform((v) => v === 'true').optional(),
  noPagination: z.enum(['true', 'false']).transform((v) => v === 'true').optional(),
});

// ============================================
// TRANSFER MEMBER SCHEMA
// ============================================

export const transferMemberSchema = z.object({
  memberId: z.number().int().positive(),
  fromBranchId: z.number().int().positive(),
  toBranchId: z.number().int().positive(),
  membershipAction: z.enum(MEMBERSHIP_TRANSFER_ACTIONS).default('transfer'),
  notes: z.string().max(500).optional(),
});

// ============================================
// DTO CLASSES
// ============================================

export class CreateBranchDto extends createZodDto(createBranchSchema) {}
export class UpdateBranchDto extends createZodDto(updateBranchSchema) {}
export class GetBranchesQueryDto extends createZodDto(getBranchesQuerySchema) {}
export class TransferMemberDto extends createZodDto(transferMemberSchema) {}

// ============================================
// TYPE EXPORTS
// ============================================

export type MembershipTransferAction = (typeof MEMBERSHIP_TRANSFER_ACTIONS)[number];
export type CreateBranch = z.infer<typeof createBranchSchema>;
export type UpdateBranch = z.infer<typeof updateBranchSchema>;
export type GetBranchesQuery = z.infer<typeof getBranchesQuerySchema>;
export type TransferMember = z.infer<typeof transferMemberSchema>;
