// ============================================
// USER CONSTANTS
// ============================================
export const USER_ROLES = ['superadmin', 'admin', 'manager', 'trainer', 'user'] as const;
export type UserRole = typeof USER_ROLES[number];

export const USER_STATUSES = ['active', 'inactive', 'suspended'] as const;
export type UserStatus = typeof USER_STATUSES[number];

export const GENDERS = ['male', 'female', 'other'] as const;
export type Gender = typeof GENDERS[number];

// ============================================
// TRAINER CONSTANTS
// ============================================
export const TRAINER_STATUSES = ['active', 'inactive', 'on_leave'] as const;
export type TrainerStatus = typeof TRAINER_STATUSES[number];

export const TRAINER_SPECIALIZATIONS = ['strength', 'cardio', 'yoga', 'pilates', 'crossfit', 'nutrition', 'rehabilitation', 'personal_training'] as const;
export type TrainerSpecialization = typeof TRAINER_SPECIALIZATIONS[number];

// ============================================
// GYM CONSTANTS
// ============================================
export const GYM_STATUSES = ['active', 'inactive', 'pending'] as const;
export type GymStatus = typeof GYM_STATUSES[number];

// ============================================
// SUPPORT/TICKET CONSTANTS
// ============================================
export const TICKET_CATEGORIES = ['bug', 'feature_request', 'account', 'billing', 'other'] as const;
export type TicketCategory = typeof TICKET_CATEGORIES[number];

export const TICKET_PRIORITIES = ['low', 'medium', 'high', 'urgent'] as const;
export type TicketPriority = typeof TICKET_PRIORITIES[number];

export const TICKET_STATUSES = ['open', 'in_progress', 'resolved', 'closed'] as const;
export type TicketStatus = typeof TICKET_STATUSES[number];

// ============================================
// ANNOUNCEMENT CONSTANTS
// ============================================
export const ANNOUNCEMENT_TYPES = ['general', 'update', 'event', 'maintenance', 'promotion'] as const;
export type AnnouncementType = typeof ANNOUNCEMENT_TYPES[number];

export const ANNOUNCEMENT_PRIORITIES = ['low', 'medium', 'high', 'urgent'] as const;
export type AnnouncementPriority = typeof ANNOUNCEMENT_PRIORITIES[number];

export const ANNOUNCEMENT_STATUSES = ['draft', 'published', 'archived'] as const;
export type AnnouncementStatus = typeof ANNOUNCEMENT_STATUSES[number];

export const TARGET_AUDIENCES = ['user', 'trainer', 'admin'] as const;
export type TargetAudience = typeof TARGET_AUDIENCES[number];

// ============================================
// PROGRAM CONSTANTS
// ============================================
export const PROGRAM_TYPES = ['workout', 'diet', 'exercise'] as const;
export type ProgramType = typeof PROGRAM_TYPES[number];

export const PROGRAM_DIFFICULTIES = ['beginner', 'intermediate', 'advanced'] as const;
export type ProgramDifficulty = typeof PROGRAM_DIFFICULTIES[number];

export const PROGRAM_STATUSES = ['draft', 'active', 'archived'] as const;
export type ProgramStatus = typeof PROGRAM_STATUSES[number];

// ============================================
// SUBSCRIPTION CONSTANTS
// ============================================
export const SUBSCRIPTION_PLANS = ['free', 'basic', 'premium', 'enterprise'] as const;
export type SubscriptionPlan = typeof SUBSCRIPTION_PLANS[number];

export const SUBSCRIPTION_STATUSES = ['active', 'inactive', 'cancelled', 'expired', 'pending'] as const;
export type SubscriptionStatus = typeof SUBSCRIPTION_STATUSES[number];

export const BILLING_CYCLES = ['monthly', 'quarterly', 'yearly'] as const;
export type BillingCycle = typeof BILLING_CYCLES[number];

// ============================================
// REPORT CONSTANTS
// ============================================
export const REPORT_TYPES = ['revenue', 'membership', 'attendance', 'trainer_performance', 'equipment', 'custom'] as const;
export type ReportType = typeof REPORT_TYPES[number];

export const REPORT_STATUSES = ['draft', 'generated', 'published', 'archived'] as const;
export type ReportStatus = typeof REPORT_STATUSES[number];

export const REPORT_PERIODS = ['daily', 'weekly', 'monthly', 'quarterly', 'yearly', 'custom'] as const;
export type ReportPeriod = typeof REPORT_PERIODS[number];

// ============================================
// GOAL CONSTANTS
// ============================================
export const GOAL_CATEGORIES = ['health', 'career', 'finance', 'education', 'relationships', 'personal', 'other'] as const;
export type GoalCategory = typeof GOAL_CATEGORIES[number];

export const GOAL_TYPES = ['regular', 'savings'] as const;
export type GoalType = typeof GOAL_TYPES[number];

export const GOAL_STATUSES = ['not_started', 'in_progress', 'completed', 'abandoned'] as const;
export type GoalStatus = typeof GOAL_STATUSES[number];

// ============================================
// TASK CONSTANTS
// ============================================
export const TASK_PRIORITIES = ['low', 'medium', 'high'] as const;
export type TaskPriority = typeof TASK_PRIORITIES[number];

export const TASK_STATUSES = ['pending', 'in_progress', 'completed'] as const;
export type TaskStatus = typeof TASK_STATUSES[number];

// ============================================
// HABIT CONSTANTS
// ============================================
export const HABIT_FREQUENCIES = ['daily', 'weekly', 'monthly'] as const;
export type HabitFrequency = typeof HABIT_FREQUENCIES[number];

// ============================================
// CHALLENGE CONSTANTS
// ============================================
export const CHALLENGE_TYPES = ['habit', 'goal', 'custom'] as const;
export type ChallengeType = typeof CHALLENGE_TYPES[number];

export const CHALLENGE_STATUSES = ['upcoming', 'active', 'completed', 'cancelled'] as const;
export type ChallengeStatus = typeof CHALLENGE_STATUSES[number];

export const PARTICIPANT_STATUSES = ['pending', 'accepted', 'declined'] as const;
export type ParticipantStatus = typeof PARTICIPANT_STATUSES[number];

// ============================================
// NOTIFICATION CONSTANTS
// ============================================
export const NOTIFICATION_TYPES = ['info', 'warning', 'success', 'error', 'system', 'reminder', 'challenge', 'friend_request', 'achievement'] as const;
export type NotificationType = typeof NOTIFICATION_TYPES[number];

// ============================================
// PUNISHMENT CONSTANTS
// ============================================
export const PUNISHMENT_CATEGORIES = ['restriction', 'task', 'financial', 'social', 'other'] as const;
export type PunishmentCategory = typeof PUNISHMENT_CATEGORIES[number];

export const PUNISHMENT_SEVERITIES = ['mild', 'moderate', 'severe'] as const;
export type PunishmentSeverity = typeof PUNISHMENT_SEVERITIES[number];

export const PUNISHMENT_STATUSES = ['pending', 'completed', 'skipped'] as const;
export type PunishmentStatus = typeof PUNISHMENT_STATUSES[number];

// ============================================
// FRIEND REQUEST CONSTANTS
// ============================================
export const FRIEND_REQUEST_STATUSES = ['pending', 'accepted', 'declined'] as const;
export type FriendRequestStatus = typeof FRIEND_REQUEST_STATUSES[number];

// ============================================
// STREAK CONSTANTS
// ============================================
export const STREAK_ITEM_TYPES = ['habit', 'goal'] as const;
export type StreakItemType = typeof STREAK_ITEM_TYPES[number];

// ============================================
// PERMISSION CONSTANTS
// ============================================
export const PERMISSION_RESOURCES = ['users', 'trainers', 'programs', 'announcements', 'challenges', 'reports'] as const;
export type PermissionResource = typeof PERMISSION_RESOURCES[number];

export const PERMISSION_ACTIONS = ['create', 'read', 'update', 'delete'] as const;
export type PermissionAction = typeof PERMISSION_ACTIONS[number];

// Resources that only have read permission
export const READ_ONLY_RESOURCES = ['reports'] as const;
export type ReadOnlyResource = typeof READ_ONLY_RESOURCES[number];

// Resources that have full CRUD permissions
export const CRUD_RESOURCES = ['users', 'trainers', 'programs', 'announcements', 'challenges'] as const;
export type CrudResource = typeof CRUD_RESOURCES[number];
