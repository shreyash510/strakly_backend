// User
export { User, UserSchema } from './user.schema';
export type { UserDocument } from './user.schema';
export type { UserRole, UserStatus, Gender } from '../../constants';

// Goal
export { Goal, GoalSchema } from './goal.schema';
export type { GoalDocument } from './goal.schema';

// Habit
export { Habit, HabitSchema } from './habit.schema';
export type { HabitDocument } from './habit.schema';

// Task
export { Task, TaskSchema } from './task.schema';
export type { TaskDocument } from './task.schema';


// Punishment
export { Punishment, PunishmentSchema } from './punishment.schema';
export type { PunishmentDocument } from './punishment.schema';

// Friend
export { Friend, FriendSchema } from './friend.schema';
export type { FriendDocument } from './friend.schema';

// Friend Request
export { FriendRequest, FriendRequestSchema } from './friend-request.schema';
export type { FriendRequestDocument } from './friend-request.schema';

// Challenge
export { Challenge, ChallengeSchema, ChallengeParticipant, ChallengeParticipantSchema } from './challenge.schema';
export type { ChallengeDocument } from './challenge.schema';

// Challenge Invitation
export { ChallengeInvitation, ChallengeInvitationSchema } from './challenge-invitation.schema';
export type { ChallengeInvitationDocument } from './challenge-invitation.schema';


// Streak
export { Streak, StreakSchema, StreakItem, StreakItemSchema } from './streak.schema';
export type { StreakDocument } from './streak.schema';

// Gym
export { Gym, GymSchema } from './gym.schema';
export type { GymDocument } from './gym.schema';
export type { GymStatus } from '../../constants';

// Trainer
export { Trainer, TrainerSchema } from './trainer.schema';
export type { TrainerDocument, TrainerStatus } from './trainer.schema';

// Program
export { Program, ProgramSchema, Exercise, ExerciseSchema } from './program.schema';
export type { ProgramDocument, ProgramType, DifficultyLevel } from './program.schema';

// Announcement
export { Announcement, AnnouncementSchema } from './announcement.schema';
export type { AnnouncementDocument, AnnouncementType, AnnouncementPriority, AnnouncementStatus } from './announcement.schema';

// Support
export { Support, SupportSchema, SupportResponse, SupportResponseSchema } from './support.schema';
export type { SupportDocument, SupportCategory, SupportPriority, SupportStatus } from './support.schema';

// Notification
export { Notification, NotificationSchema } from './notification.schema';
export type { NotificationDocument, NotificationType } from './notification.schema';

// Report
export { Report, ReportSchema, ReportMetrics, ReportMetricsSchema } from './report.schema';
export type { ReportDocument, ReportType, ReportStatus, ReportPeriod } from './report.schema';

// Subscription
export { Subscription, SubscriptionSchema } from './subscription.schema';
export type { SubscriptionDocument, SubscriptionPlan, SubscriptionStatus, BillingCycle } from './subscription.schema';
