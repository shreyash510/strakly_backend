export enum NotificationType {
  MEMBERSHIP_EXPIRY = 'membership_expiry',
  MEMBERSHIP_RENEWED = 'membership_renewed',
  TRAINER_ASSIGNED = 'trainer_assigned',
  TRAINER_UNASSIGNED = 'trainer_unassigned',
  NEW_ANNOUNCEMENT = 'new_announcement',
  SYSTEM_NOTIFICATION = 'system_notification',
  SUPPORT_TICKET_RESOLVED = 'support_ticket_resolved',
  NEW_MEMBER_REGISTRATION = 'new_member_registration',
  NEW_STAFF_ADDED = 'new_staff_added',
  NEW_ENROLLMENT = 'new_enrollment',
  NEW_BRANCH_CREATED = 'new_branch_created',
  CLASS_BOOKED = 'class_booked',
  CLASS_BOOKING_CANCELLED = 'class_booking_cancelled',
  CLASS_WAITLIST_PROMOTED = 'class_waitlist_promoted',
  CLASS_SCHEDULE_ASSIGNED = 'class_schedule_assigned',
  APPOINTMENT_BOOKED = 'appointment_booked',
  APPOINTMENT_STATUS_CHANGED = 'appointment_status_changed',
  SURVEY_ASSIGNED = 'survey_assigned',
  SURVEY_RESPONSE_SUBMITTED = 'survey_response_submitted',
  CHALLENGE_CREATED = 'challenge_created',
  ACHIEVEMENT_EARNED = 'achievement_earned',
  STREAK_MILESTONE = 'streak_milestone',
  POINTS_EARNED = 'points_earned',
  REWARD_REDEEMED = 'reward_redeemed',
  TIER_UPGRADED = 'tier_upgraded',
}

export enum NotificationPriority {
  LOW = 'low',
  NORMAL = 'normal',
  HIGH = 'high',
  URGENT = 'urgent',
}

export interface NotificationData {
  entityId?: number;
  entityType?: string;
  actionUrl?: string;
  metadata?: Record<string, any>;
}

export interface Notification {
  id: number;
  branchId: number | null;
  userId: number;
  type: NotificationType;
  title: string;
  message: string;
  data: NotificationData | null;
  isRead: boolean;
  readAt: Date | null;
  actionUrl: string | null;
  priority: NotificationPriority;
  expiresAt: Date | null;
  createdAt: Date;
  createdBy: number | null;
}
