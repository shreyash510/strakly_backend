/**
 * Application Constants
 * Centralized constants for consistent usage across the app
 */

// User Roles
export const ROLES = {
  SUPERADMIN: 'superadmin',
  ADMIN: 'admin',
  BRANCH_ADMIN: 'branch_admin',
  MANAGER: 'manager',
  TRAINER: 'trainer',
  CLIENT: 'client',
} as const;

export type UserRole = (typeof ROLES)[keyof typeof ROLES];

export const ALL_ROLES = Object.values(ROLES);
export const STAFF_ROLES = [
  ROLES.ADMIN,
  ROLES.BRANCH_ADMIN,
  ROLES.MANAGER,
  ROLES.TRAINER,
] as const;
export const ADMIN_ROLES = [ROLES.ADMIN, ROLES.BRANCH_ADMIN] as const; // Admin-level roles in public.users
export const TENANT_ROLES = [
  ROLES.MANAGER,
  ROLES.TRAINER,
  ROLES.CLIENT,
] as const;

// User Status
// Client statuses: onboarding, confirm, active, expired, inactive, rejected, archive
// Staff statuses: active, inactive, suspended
export const USER_STATUS = {
  ONBOARDING: 'onboarding',
  CONFIRM: 'confirm',
  ACTIVE: 'active',
  EXPIRED: 'expired',
  INACTIVE: 'inactive',
  REJECTED: 'rejected',
  ARCHIVE: 'archive',
  SUSPENDED: 'suspended',
} as const;

export type UserStatus = (typeof USER_STATUS)[keyof typeof USER_STATUS];

export const USER_STATUSES_ARRAY = Object.values(USER_STATUS);

// Gym Status
export const GYM_STATUS = {
  ACTIVE: 'active',
  INACTIVE: 'inactive',
  PENDING: 'pending',
} as const;

export type GymStatus = (typeof GYM_STATUS)[keyof typeof GYM_STATUS];

// Membership Status
export const MEMBERSHIP_STATUS = {
  ACTIVE: 'active',
  INACTIVE: 'inactive',
  PENDING: 'pending',
  EXPIRED: 'expired',
  CANCELLED: 'cancelled',
} as const;

export type MembershipStatus =
  (typeof MEMBERSHIP_STATUS)[keyof typeof MEMBERSHIP_STATUS];

// Plan Status
export const PLAN_STATUS = {
  ACTIVE: 'active',
  INACTIVE: 'inactive',
} as const;

export type PlanStatus = (typeof PLAN_STATUS)[keyof typeof PLAN_STATUS];

// Attendance Status
export const ATTENDANCE_STATUS = {
  CHECKED_IN: 'checked_in',
  CHECKED_OUT: 'checked_out',
} as const;

export type AttendanceStatus =
  (typeof ATTENDANCE_STATUS)[keyof typeof ATTENDANCE_STATUS];

// Password Configuration
export const PASSWORD_CONFIG = {
  SALT_ROUNDS: 10,
  MIN_LENGTH: 8,
} as const;

// OTP Configuration
export const OTP_CONFIG = {
  EXPIRY_MINUTES: 10,
  LENGTH: 6,
} as const;

// Attendance Code Configuration
export const ATTENDANCE_CODE_CONFIG = {
  LENGTH: 4,
  BATCH_SIZE: 10,
  MAX_ATTEMPTS: 5,
  FALLBACK_LENGTH: 6,
} as const;

// Pagination Defaults
export const PAGINATION = {
  DEFAULT_PAGE: 1,
  DEFAULT_LIMIT: 15,
  MAX_LIMIT: 100,
} as const;
