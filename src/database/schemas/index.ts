// User
export { User, UserSchema } from './user.schema';
export type { UserDocument } from './user.schema';

// Goal
export { Goal, GoalSchema } from './goal.schema';
export type { GoalDocument } from './goal.schema';

// Habit
export { Habit, HabitSchema } from './habit.schema';
export type { HabitDocument } from './habit.schema';

// Task
export { Task, TaskSchema } from './task.schema';
export type { TaskDocument } from './task.schema';

// Reward
export { Reward, RewardSchema } from './reward.schema';
export type { RewardDocument } from './reward.schema';

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

// Post
export { Post, PostSchema, PostReaction, PostReactionSchema, PostComment, PostCommentSchema } from './post.schema';
export type { PostDocument } from './post.schema';

// Streak
export { Streak, StreakSchema, StreakItem, StreakItemSchema } from './streak.schema';
export type { StreakDocument } from './streak.schema';
