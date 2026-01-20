// ============================================
// USER CONSTANTS
// ============================================
export const USER_ROLES = ['superadmin', 'admin', 'manager', 'trainer', 'member'] as const;
export type UserRole = typeof USER_ROLES[number];

export const USER_STATUSES = ['active', 'inactive', 'suspended'] as const;
export type UserStatus = typeof USER_STATUSES[number];

export const GENDERS = ['male', 'female', 'other'] as const;
export type Gender = typeof GENDERS[number];
