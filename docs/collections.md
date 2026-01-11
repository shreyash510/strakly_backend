# Firestore Collections

This document describes all Firestore collections used in the Strakly backend.

---

## Quick Reference

### Root Collections
- `users`
- `challenges`
- `challengeInvitations`
- `friendRequests`
- `posts`

### User Subcollections (`users/{userId}/...`)
- `goals`
- `habits`
- `tasks`
- `rewards`
- `punishments`
- `friends`
- `current-streaks`

---

## Overview

| Type | Count |
|------|-------|
| Root Collections | 5 |
| User Subcollections | 7 |
| **Total** | **12** |

---

## Root-Level Collections

### 1. `users`

Main collection storing user accounts and profile data.

```typescript
interface User {
  id: string;
  name: string;
  email: string;
  password: string;          /* Hashed with bcrypt */
  createdAt: string;         /* ISO date string */
  updatedAt: string;         /* ISO date string */
}
```

---

### 2. `challenges`

Stores all challenges (shared between users).

```typescript
interface Challenge {
  id: string;
  title: string;
  description?: string;
  creatorId: string;
  participantIds: string[];  /* Array of user IDs */
  participants: ChallengeParticipant[];
  challengeType: 'habit' | 'goal' | 'custom';
  targetValue: number;
  unit: string;
  startDate: string;
  endDate: string;
  prize?: string;
  status: 'upcoming' | 'active' | 'completed' | 'cancelled';
  winnerId?: string;
  createdAt: string;
  updatedAt: string;
}

interface ChallengeParticipant {
  oderId: string;
  odername: string;
  oderedAt: string;
  progress: number;
  status: 'pending' | 'accepted' | 'declined';
}
```

---

### 3. `challengeInvitations`

Stores challenge invitation records.

```typescript
interface ChallengeInvitation {
  id: string;
  challengeId: string;
  challengeTitle: string;
  challengeDescription?: string;
  challengePrize?: string;
  fromUserId: string;
  fromUserName: string;
  toUserId: string;
  toUserName: string;
  startDate: string;
  endDate: string;
  participantCount: number;
  status: 'pending' | 'accepted' | 'declined';
  createdAt: string;
  updatedAt: string;
}
```

---

### 4. `friendRequests`

Stores friend request records.

```typescript
interface FriendRequest {
  id: string;
  fromUserId: string;
  fromUserName: string;
  fromUserEmail: string;
  toUserId: string;
  toUserName: string;
  toUserEmail: string;
  status: 'pending' | 'accepted' | 'declined';
  createdAt: string;
  updatedAt: string;
}
```

---

### 5. `posts`

Stores social posts/success stories.

```typescript
interface Post {
  id: string;
  userId: string;
  userName: string;
  userAvatar?: string;
  content: string;
  category?: 'general' | 'challenge';
  reactions: PostReaction[];
  comments: PostComment[];
  createdAt: string;
  updatedAt: string;
}

interface PostReaction {
  userId: string;
  userName: string;
  type: 'like' | 'celebrate' | 'support';
}

interface PostComment {
  id: string;
  userId: string;
  userName: string;
  userAvatar?: string;
  content: string;
  createdAt: string;
}
```

---

## User Subcollections

All subcollections are stored under `users/{userId}/`

### 1. `users/{userId}/goals`

User's personal goals.

```typescript
interface Goal {
  id: string;
  title: string;
  description: string;
  category: 'health' | 'career' | 'finance' | 'education' | 'relationships' | 'personal' | 'other';
  goalType: 'regular' | 'savings';
  targetDate: string;
  progress: number;          /* 0-100 */
  status: 'not_started' | 'in_progress' | 'completed' | 'abandoned';
  streak: number;
  longestStreak: number;
  targetAmount?: number;     /* For savings goals */
  currentAmount?: number;    /* For savings goals */
  createdAt: string;
  updatedAt: string;
}
```

---

### 2. `users/{userId}/habits`

User's habits.

```typescript
interface Habit {
  id: string;
  title: string;
  description?: string;
  frequency: 'daily' | 'weekly' | 'monthly';
  isGoodHabit: boolean;
  isActive: boolean;
  streak: number;
  longestStreak: number;
  completedDates: string[];  /* Array of ISO date strings */
  createdAt: string;
  updatedAt: string;
}
```

---

### 3. `users/{userId}/tasks`

User's tasks/todos.

```typescript
interface Task {
  id: string;
  title: string;
  description?: string;
  dueDate?: string;
  priority: 'low' | 'medium' | 'high';
  status: 'pending' | 'in_progress' | 'completed';
  category?: string;
  createdAt: string;
  updatedAt: string;
}
```

---

### 4. `users/{userId}/rewards`

User's reward system.

```typescript
interface Reward {
  id: string;
  reward: string;
  description?: string;
  category: 'entertainment' | 'food' | 'shopping' | 'experience' | 'self_care' | 'other';
  pointsRequired: number;
  currentPoints: number;
  status: 'in_progress' | 'available' | 'claimed';
  claimedAt?: string;
  createdAt: string;
  updatedAt: string;
}
```

---

### 5. `users/{userId}/punishments`

User's punishment rules.

```typescript
interface Punishment {
  id: string;
  title: string;
  description?: string;
  category: 'restriction' | 'task' | 'financial' | 'social' | 'other';
  severity: 'mild' | 'moderate' | 'severe';
  triggerCondition: string;
  isActive: boolean;
  status: 'pending' | 'completed' | 'skipped';
  triggeredAt?: string;
  completedAt?: string;
  createdAt: string;
  updatedAt: string;
}
```

---

### 6. `users/{userId}/friends`

User's friends list.

```typescript
interface Friend {
  oderId: string;          /* Friend's user ID */
  friendUserId: string;
  friendName: string;
  friendEmail: string;
  addedAt: string;
}
```

---

### 7. `users/{userId}/current-streaks`

User's streak data. Contains a single document `user-streaks`.

**Document path:** `users/{userId}/current-streaks/user-streaks`

```typescript
interface UserStreaks {
  items: {
    [itemId: string]: {
      itemId: string;
      itemName: string;
      itemType: 'habit' | 'goal';
      streak: number;
      longestStreak: number;
      lastCompletedDate: string;
    };
  };
  updatedAt: string;
}
```

---

## Collection Relationships

```
users (root)
├── goals (subcollection)
├── habits (subcollection)
├── tasks (subcollection)
├── rewards (subcollection)
├── punishments (subcollection)
├── friends (subcollection)
└── current-streaks (subcollection)
    └── user-streaks (document)

challenges (root)
└── participantIds[] → references users

challengeInvitations (root)
├── fromUserId → references users
└── toUserId → references users

friendRequests (root)
├── fromUserId → references users
└── toUserId → references users

posts (root)
├── userId → references users
├── reactions[].userId → references users
└── comments[].userId → references users
```

---

## API Endpoints by Collection

| Collection | Endpoints |
|------------|-----------|
| users | `POST /auth/register`, `POST /auth/login`, `GET /auth/profile` |
| goals | `GET/POST /goals`, `GET/PUT/DELETE /goals/:id` |
| habits | `GET/POST /habits`, `GET/PUT/DELETE /habits/:id`, `POST /habits/:id/complete` |
| tasks | `GET/POST /tasks`, `GET/PUT/DELETE /tasks/:id` |
| rewards | `GET/POST /rewards`, `GET/PUT/DELETE /rewards/:id`, `POST /rewards/:id/claim` |
| punishments | `GET/POST /punishments`, `GET/PUT/DELETE /punishments/:id` |
| friends | `GET /friends`, `GET /friends/with-stats`, `DELETE /friends/:id` |
| friendRequests | `GET/POST /friends/requests`, `POST /friends/requests/:id/accept`, `POST /friends/requests/:id/decline` |
| challenges | `GET/POST /challenges`, `GET/PUT/DELETE /challenges/:id` |
| challengeInvitations | `GET /challenges/invitations`, `POST /challenges/invitations/:id/accept` |
| posts | `GET/POST /posts`, `GET/PUT/DELETE /posts/:id`, `POST /posts/:id/react`, `POST /posts/:id/comment` |
| dashboard | `GET /dashboard`, `GET /dashboard/stats`, `GET /dashboard/activity`, `GET /dashboard/streaks` |

---

## Remaining Collections to Add

The following collections are planned but not yet implemented:

### 1. `notifications` (Root Collection)

For push notifications and in-app alerts.

```typescript
interface Notification {
  id: string;
  userId: string;              /* Recipient user ID */
  type: 'friend_request' | 'challenge_invite' | 'challenge_update' | 'streak_reminder' | 'achievement';
  title: string;
  message: string;
  data?: {                     /* Additional data based on type */
    senderId?: string;
    senderName?: string;
    challengeId?: string;
    requestId?: string;
  };
  isRead: boolean;
  createdAt: string;
}
```

**Endpoints needed:**
- `GET /notifications` - Get user notifications
- `PUT /notifications/:id/read` - Mark as read
- `PUT /notifications/read-all` - Mark all as read
- `DELETE /notifications/:id` - Delete notification

---

### 2. `users/{userId}/settings` (Subcollection)

User preferences and settings.

```typescript
interface UserSettings {
  theme: 'light' | 'dark' | 'system';
  notifications: {
    email: boolean;
    push: boolean;
    friendRequests: boolean;
    challengeInvites: boolean;
    streakReminders: boolean;
  };
  privacy: {
    profileVisibility: 'public' | 'friends' | 'private';
    showStreak: boolean;
    showProgress: boolean;
  };
  updatedAt: string;
}
```

**Endpoints needed:**
- `GET /users/settings` - Get user settings
- `PUT /users/settings` - Update user settings

---

### 3. `users/{userId}/achievements` (Subcollection)

User achievements and badges.

```typescript
interface Achievement {
  id: string;
  type: 'streak_7' | 'streak_30' | 'streak_100' | 'goals_completed_5' | 'challenges_won_3' | 'first_friend';
  title: string;
  description: string;
  icon: string;
  unlockedAt: string;
}
```

**Endpoints needed:**
- `GET /achievements` - Get user achievements
- `GET /achievements/available` - Get all available achievements

---

### 4. `users/{userId}/activity-log` (Subcollection)

Detailed activity history for audit and analytics.

```typescript
interface ActivityLog {
  id: string;
  action: 'create' | 'update' | 'delete' | 'complete' | 'claim';
  entityType: 'goal' | 'habit' | 'task' | 'reward' | 'challenge';
  entityId: string;
  entityTitle: string;
  details?: Record<string, any>;
  createdAt: string;
}
```

**Endpoints needed:**
- `GET /activity` - Get user activity log (paginated)

---

## Summary: Implementation Status

| Collection | Status | Priority |
|------------|--------|----------|
| users | Implemented | - |
| goals | Implemented | - |
| habits | Implemented | - |
| tasks | Implemented | - |
| rewards | Implemented | - |
| punishments | Implemented | - |
| friends | Implemented | - |
| friendRequests | Implemented | - |
| challenges | Implemented | - |
| challengeInvitations | Implemented | - |
| posts | Implemented | - |
| current-streaks | Implemented | - |
| **notifications** | Not Implemented | High |
| **settings** | Not Implemented | Medium |
| **achievements** | Not Implemented | Low |
| **activity-log** | Not Implemented | Low |
