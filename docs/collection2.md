# Strakly Database Collections v2

Based on Frontend Types and Redux State

---

## Collections Overview

| # | Collection | Type | Description |
|---|------------|------|-------------|
| 1 | `users` | Root | User accounts and authentication |

---

## 1. Users Collection

**Collection:** `users`

```typescript
interface User {
  id: string;
  name: string;                    // required
  email: string;                   // required, unique
  passwordHash: string;            // required, bcrypt hashed

  // Optional profile fields
  phone?: string;
  avatar?: string;
  bio?: string;
  dateOfBirth?: string;
  gender?: 'male' | 'female' | 'other';
  address?: string;
  city?: string;
  state?: string;
  zipCode?: string;

  // Role & Status
  role: 'superadmin' | 'admin' | 'manager' | 'trainer' | 'user';  // default: 'user'
  status: 'active' | 'inactive' | 'suspended';                     // default: 'active'

  // Associations
  gymId?: string;
  trainerId?: string;

  // Tracking
  streak: number;                  // default: 0
  joinDate?: string;
  lastLoginAt?: string;

  createdAt: string;
  updatedAt: string;
}
```

**Redux State:** `authSlice`
```typescript
interface AuthState {
  user: User | null;
  isLoading: boolean;
  error: string | null;
}
```

---

## API Endpoints

### Auth
| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/auth/register` | Register new user |
| POST | `/auth/login` | Login |
| POST | `/auth/logout` | Logout |
| GET | `/auth/profile` | Get profile |
| PATCH | `/auth/profile` | Update profile |
| POST | `/auth/change-password` | Change password |
| POST | `/auth/refresh` | Refresh token |
| GET | `/auth/search` | Search users |

---

## Enums Quick Reference

```typescript
// User
type UserRole = 'superadmin' | 'admin' | 'manager' | 'trainer' | 'user';
type UserStatus = 'active' | 'inactive' | 'suspended';
type Gender = 'male' | 'female' | 'other';
```
