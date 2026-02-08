export enum NotificationType {
  MEMBERSHIP_EXPIRY = 'membership_expiry',
  MEMBERSHIP_RENEWED = 'membership_renewed',
  TRAINER_ASSIGNED = 'trainer_assigned',
  TRAINER_UNASSIGNED = 'trainer_unassigned',
  NEW_ANNOUNCEMENT = 'new_announcement',
  SYSTEM_NOTIFICATION = 'system_notification',
  SUPPORT_TICKET_RESOLVED = 'support_ticket_resolved',
  NEW_MEMBER_REGISTRATION = 'new_member_registration',
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
