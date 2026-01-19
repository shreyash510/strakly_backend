# Strakly Collections

This document describes all collections used in Strakly backend (MongoDB/Firestore).

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
- `punishmentRules`
- `punishments`
- `friends`
- `mistakes`
- `rules`
- `streaks`

---

## Overview

| Type | Count |
|------|-------|
| Root Collections | 5 |
| User Subcollections | 10 |
| **Total** | **15** |

---

## Root-Level Collections

### 1. `users`

Main collection storing user accounts and profile data.

```typescript
interface User {
  id: string;
  name: string;                  // required
  email: string;                 // required, unique
  passwordHash: string;          // required, bcrypt hashed
  phone?: string;
  avatar?: string;
  bio?: string;

  role: 'superadmin' | 'admin' | 'manager' | 'trainer' | 'user';  // default: 'user'
  status: 'active' | 'inactive' | 'suspended';                     // default: 'active'

  dateOfBirth?: string;
  gender?: 'male' | 'female' | 'other';
  address?: string;
  city?: string;
  state?: string;
  zipCode?: string;

  gymId?: string;                // optional gym association
  trainerId?: string;            // optional trainer assignment

  streak: number;                // default: 0
  joinDate?: string;
  lastLoginAt?: string;

  createdAt: string;
  updatedAt: string;
}
```

---

### 2. `challenges`

Stores all challenges (shared between users).

```typescript
interface Challenge {
  id: string;
  title: string;                 // required, max 100 chars
  description?: string;          // max 500 chars
  prize: string;                 // required, max 200 chars - what loser owes winner

  startDate: string;             // required
  endDate: string;               // required

  creatorId: string;             // required
  creatorName: string;

  participants: ChallengeParticipant[];

  status: 'upcoming' | 'active' | 'completed';  // default: 'upcoming'
  winnerId?: string;
  winnerName?: string;

  createdAt: string;
  updatedAt: string;
}

interface ChallengeParticipant {
  userId: string;                // required
  userName: string;              // required
  userAvatar?: string;
  currentStreak: number;         // default: 0
  rank: number;
  status: 'active' | 'failed' | 'won' | 'lost';
  joinedAt: string;
  lastCompletedDate?: string;
}
```

---

### 3. `challengeInvitations`

Stores challenge invitation records.

```typescript
interface ChallengeInvitation {
  id: string;
  challengeId: string;           // required
  challengeTitle: string;        // required
  challengeDescription?: string;
  challengePrize?: string;

  startDate: string;             // required
  endDate: string;               // required

  fromUserId: string;            // required, inviter
  fromUserName: string;          // required

  toUserId: string;              // required, invitee

  participantCount: number;      // default: 0
  status: 'pending' | 'accepted' | 'declined';  // default: 'pending'

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
  fromUserId: string;            // required, sender
  fromUserName: string;          // required
  fromUserEmail: string;         // required
  fromUserAvatar?: string;

  toUserId: string;              // required, recipient
  toUserName: string;            // required
  toUserEmail: string;           // required

  status: 'pending' | 'accepted' | 'rejected';  // default: 'pending'

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
  userId: string;                // required
  userName: string;              // required
  userAvatar?: string;

  content: string;               // required, max 1000 chars
  category?: 'general' | 'challenge' | 'habit' | 'goal';

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
  title: string;                 // required, max 100 chars
  description: string;           // max 500 chars
  category: 'health' | 'career' | 'finance' | 'education' | 'relationships' | 'personal' | 'other';
  goalType: 'regular' | 'savings';  // default: 'regular'

  targetDate: string;            // required
  progress: number;              // 0-100, default: 0
  status: 'not_started' | 'in_progress' | 'completed' | 'abandoned';  // default: 'not_started'

  streak: number;                // default: 0
  longestStreak: number;         // default: 0

  // For savings goals
  targetAmount?: number;
  currentAmount?: number;

  createdAt: string;
  updatedAt: string;
}
```

---

### 2. `users/{userId}/habits`

User's habits (good and bad).

```typescript
interface Habit {
  id: string;
  title: string;                 // required, max 100 chars
  description?: string;          // max 300 chars
  frequency: 'daily' | 'weekly' | 'custom';  // default: 'daily'
  customDays: number[];          // array of day indices (0=Sun, 1=Mon, ..., 6=Sat)

  isGoodHabit: boolean;          // true for good habits, false for bad habits
  isActive: boolean;             // default: true

  streak: number;                // default: 0
  longestStreak: number;         // default: 0
  completedDates: string[];      // array of ISO date strings

  // For bad habits
  targetDays?: number;           // target days to stay clean (1-365)
  lastSlipDate?: string;         // date of last slip
  thoughts?: string;             // max 1000 chars

  createdAt: string;
  updatedAt: string;
}
```

---

### 3. `users/{userId}/tasks`

User's repeating tasks.

```typescript
interface Task {
  id: string;
  title: string;                 // required, max 200 chars
  description?: string;          // max 500 chars
  repeatDays: number[];          // array of day indices (0=Sun, 1=Mon, ..., 6=Sat)

  status: 'pending' | 'in_progress' | 'completed';  // default: 'pending'
  completedAt?: string;

  // Streak tracking for repeating tasks
  streak: number;                // default: 0
  longestStreak: number;         // default: 0
  completedDates: string[];      // array of ISO date strings

  createdAt: string;
  updatedAt: string;
}
```

---

### 4. `users/{userId}/rewards`

User's reward system linked to habits/tasks/goals.

```typescript
interface Reward {
  id: string;
  challenge: string;             // required, max 200 chars - what user commits to do
  reward: string;                // required, max 200 chars - what user gets on completion

  targetStreak: number;          // required, 1-365
  currentStreak: number;         // default: 0

  category?: 'habit' | 'task' | 'goal';
  linkedItemId?: string;         // reference to linked habit/task/goal
  linkedItemName?: string;       // name of linked item

  status: 'in_progress' | 'completed' | 'failed' | 'claimed';  // default: 'in_progress'
  claimedAt?: string;

  createdAt: string;
  updatedAt: string;
}
```

---

### 5. `users/{userId}/punishmentRules`

Rules defining when punishments trigger.

```typescript
interface PunishmentRule {
  id: string;
  title: string;                 // required, max 200 chars - the punishment
  description?: string;          // max 500 chars

  category: 'goal' | 'habit' | 'task';
  linkedItemId: string;          // required, reference to linked item
  linkedItemName: string;        // name of linked item

  triggerStreak: number;         // 0-100, streak break count that triggers punishment
  isActive: boolean;             // default: true

  createdAt: string;
  updatedAt: string;
}
```

---

### 6. `users/{userId}/punishments`

Triggered punishments.

```typescript
interface Punishment {
  id: string;
  ruleId: string;                // required, reference to punishment rule

  title: string;                 // required
  description?: string;
  reason: string;                // why punishment was triggered
  thoughts?: string;             // user reflections
  date?: string;                 // when it was triggered

  category: 'goal' | 'habit' | 'task';
  linkedItemId: string;
  linkedItemName: string;
  streak?: number;               // streak count when triggered

  status: 'pending' | 'completed' | 'skipped';  // default: 'pending'
  completedAt?: string;

  createdAt: string;
  updatedAt: string;
}
```

---

### 7. `users/{userId}/friends`

User's friends list with stats.

```typescript
interface Friend {
  id: string;                    // friend's user ID
  name: string;
  email: string;
  avatar?: string;

  totalStreak: number;           // default: 0
  challengesWon: number;         // default: 0
  challengesLost: number;        // default: 0

  connectedAt: string;           // when friendship was established
}
```

---

### 8. `users/{userId}/mistakes`

Mistake tracking with lessons learned.

```typescript
interface Mistake {
  id: string;
  title: string;                 // required, max 100 chars
  description: string;           // required, max 1000 chars
  lesson: string;                // required, max 500 chars - what was learned

  startDate: string;             // required
  endDate?: string;              // optional, when resolved

  category: 'communication' | 'time_management' | 'decision_making' | 'habits' | 'relationships' | 'work' | 'health' | 'financial' | 'other';
  status: 'pending' | 'resolved' | 'failed';  // default: 'pending'

  createdAt: string;
  updatedAt: string;
}
```

---

### 9. `users/{userId}/rules`

Rules with chances system.

```typescript
interface Rule {
  id: string;
  title: string;                 // required, max 100 chars
  description: string;           // required, max 500 chars

  startDate: string;             // required
  endDate: string;               // required

  totalChances: number;          // required, 1-10
  chancesUsed: number;           // default: 0

  status: 'active' | 'completed' | 'failed';  // default: 'active'

  createdAt: string;
  updatedAt: string;
}
```

---

### 10. `users/{userId}/streaks`

Centralized streak tracking. Contains a single document `user-streaks`.

**Document path:** `users/{userId}/streaks/user-streaks`

```typescript
interface UserStreaks {
  items: {
    [itemId: string]: {
      itemId: string;
      itemName: string;
      itemType: 'habit' | 'goal';
      streak: number;            // default: 0
      longestStreak: number;     // default: 0
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
├── punishmentRules (subcollection)
├── punishments (subcollection)
│   └── ruleId → references punishmentRules
├── friends (subcollection)
├── mistakes (subcollection)
├── rules (subcollection)
└── streaks (subcollection)
    └── user-streaks (document)

challenges (root)
└── participants[].userId → references users

challengeInvitations (root)
├── challengeId → references challenges
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
| users | `POST /auth/register`, `POST /auth/login`, `GET /auth/profile`, `PATCH /auth/profile`, `POST /auth/change-password` |
| goals | `GET/POST /goals`, `GET/PATCH/DELETE /goals/:id`, `PATCH /goals/:id/progress` |
| habits | `GET/POST /habits`, `GET/PATCH/DELETE /habits/:id`, `POST /habits/:id/complete`, `POST /habits/:id/slip` |
| tasks | `GET/POST /tasks`, `GET/PATCH/DELETE /tasks/:id`, `POST /tasks/:id/complete` |
| rewards | `GET/POST /rewards`, `GET/PATCH/DELETE /rewards/:id`, `POST /rewards/:id/claim` |
| punishmentRules | `GET/POST /punishment-rules`, `GET/PATCH/DELETE /punishment-rules/:id` |
| punishments | `GET /punishments`, `PATCH /punishments/:id/complete`, `PATCH /punishments/:id/skip` |
| friends | `GET /friends`, `DELETE /friends/:id` |
| friendRequests | `GET /friends/requests`, `POST /friends/requests`, `POST /friends/requests/:id/accept`, `POST /friends/requests/:id/decline` |
| challenges | `GET/POST /challenges`, `GET/PATCH/DELETE /challenges/:id`, `POST /challenges/:id/complete-day` |
| challengeInvitations | `GET /challenges/invitations`, `POST /challenges/invitations/:id/accept`, `POST /challenges/invitations/:id/decline` |
| posts | `GET/POST /posts`, `GET/PATCH/DELETE /posts/:id`, `POST /posts/:id/react`, `POST /posts/:id/comment` |
| mistakes | `GET/POST /mistakes`, `GET/PATCH/DELETE /mistakes/:id`, `PATCH /mistakes/:id/resolve` |
| rules | `GET/POST /rules`, `GET/PATCH/DELETE /rules/:id`, `POST /rules/:id/use-chance` |
| streaks | `GET /streaks`, `GET /dashboard/streaks` |
| dashboard | `GET /dashboard`, `GET /dashboard/stats`, `GET /dashboard/activity` |

---

## Enums Reference

### User Roles
```typescript
['superadmin', 'admin', 'manager', 'trainer', 'user']
```

### User Statuses
```typescript
['active', 'inactive', 'suspended']
```

### Goal Categories
```typescript
['health', 'career', 'finance', 'education', 'relationships', 'personal', 'other']
```

### Goal Types
```typescript
['regular', 'savings']
```

### Goal Statuses
```typescript
['not_started', 'in_progress', 'completed', 'abandoned']
```

### Habit Frequencies
```typescript
['daily', 'weekly', 'custom']
```

### Task Statuses
```typescript
['pending', 'in_progress', 'completed']
```

### Reward Statuses
```typescript
['in_progress', 'completed', 'failed', 'claimed']
```

### Reward/Punishment Categories
```typescript
['habit', 'task', 'goal']
```

### Punishment Statuses
```typescript
['pending', 'completed', 'skipped']
```

### Friend Request Statuses
```typescript
['pending', 'accepted', 'rejected']
```

### Challenge Statuses
```typescript
['upcoming', 'active', 'completed']
```

### Participant Statuses
```typescript
['active', 'failed', 'won', 'lost']
```

### Challenge Invitation Statuses
```typescript
['pending', 'accepted', 'declined']
```

### Post Categories
```typescript
['general', 'challenge', 'habit', 'goal']
```

### Reaction Types
```typescript
['like', 'celebrate', 'support']
```

### Mistake Categories
```typescript
['communication', 'time_management', 'decision_making', 'habits', 'relationships', 'work', 'health', 'financial', 'other']
```

### Mistake Statuses
```typescript
['pending', 'resolved', 'failed']
```

### Rule Statuses
```typescript
['active', 'completed', 'failed']
```
