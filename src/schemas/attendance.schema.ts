import { z } from 'zod';
import { createZodDto } from 'nestjs-zod';

// ============================================
// CHECK-IN METHOD CONSTANTS
// ============================================

export const CHECK_IN_METHODS = ['code', 'qr', 'manual', 'self', 'card'] as const;

// ============================================
// MARK ATTENDANCE SCHEMA
// ============================================

export const markAttendanceSchema = z.object({
  code: z.string().length(4, 'Attendance code must be 4 digits'),
  staffId: z.number().int().positive(),
  gymId: z.number().int().positive().optional(),
  branchId: z.number().int().positive().optional(),
  checkInMethod: z.enum(CHECK_IN_METHODS).default('code'),
});

// ============================================
// MANUAL ATTENDANCE SCHEMA
// ============================================

export const manualAttendanceSchema = z.object({
  userId: z.number().int().positive(),
  gymId: z.number().int().positive().optional(),
  branchId: z.number().int().positive().optional(),
  checkIn: z.string().optional(), // ISO datetime string
  checkOut: z.string().optional(),
  notes: z.string().max(500).optional(),
});

// ============================================
// CHECK OUT SCHEMA
// ============================================

export const checkOutSchema = z.object({
  attendanceId: z.number().int().positive().optional(),
  userId: z.number().int().positive().optional(),
  notes: z.string().max(500).optional(),
});

// ============================================
// ATTENDANCE QUERY SCHEMA
// ============================================

export const getAttendanceQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(10),
  userId: z.coerce.number().int().positive().optional(),
  branchId: z.coerce.number().int().positive().optional(),
  startDate: z.string().optional(),
  endDate: z.string().optional(),
  checkInMethod: z.enum(CHECK_IN_METHODS).optional(),
  noPagination: z.enum(['true', 'false']).transform((v) => v === 'true').optional(),
});

// ============================================
// ATTENDANCE REPORT QUERY SCHEMA
// ============================================

export const attendanceReportQuerySchema = z.object({
  startDate: z.string(),
  endDate: z.string(),
  branchId: z.coerce.number().int().positive().optional(),
  userId: z.coerce.number().int().positive().optional(),
  groupBy: z.enum(['day', 'week', 'month']).default('day'),
});

// ============================================
// DTO CLASSES
// ============================================

export class MarkAttendanceDto extends createZodDto(markAttendanceSchema) {}
export class ManualAttendanceDto extends createZodDto(manualAttendanceSchema) {}
export class CheckOutDto extends createZodDto(checkOutSchema) {}
export class GetAttendanceQueryDto extends createZodDto(getAttendanceQuerySchema) {}
export class AttendanceReportQueryDto extends createZodDto(attendanceReportQuerySchema) {}

// ============================================
// TYPE EXPORTS
// ============================================

export type CheckInMethod = (typeof CHECK_IN_METHODS)[number];
export type MarkAttendance = z.infer<typeof markAttendanceSchema>;
export type ManualAttendance = z.infer<typeof manualAttendanceSchema>;
export type CheckOut = z.infer<typeof checkOutSchema>;
export type GetAttendanceQuery = z.infer<typeof getAttendanceQuerySchema>;
export type AttendanceReportQuery = z.infer<typeof attendanceReportQuerySchema>;
