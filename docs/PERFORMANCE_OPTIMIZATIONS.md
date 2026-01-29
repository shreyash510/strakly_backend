# Performance Optimization Roadmap

> **Status:** Pending Implementation
> **Created:** January 2026
> **Priority Levels:** HIGH | MEDIUM | LOW

---

## Overview

This document outlines identified performance bottlenecks and optimization opportunities in the Strakly backend codebase. Issues are categorized by priority and include specific file locations for implementation.

---

## HIGH PRIORITY - Critical Issues

These issues have significant impact on application performance and user experience.

### 1. N+1 Loop Queries in User Service

| Attribute | Value |
|-----------|-------|
| **File** | `src/users/users.service.ts` |
| **Lines** | 1007-1023 |
| **Method** | `findAllUsersAcrossGyms()` |

**Problem:**
Iterates through all gyms with sequential database calls inside loop. If 50 gyms exist, this executes 100+ database queries.

```typescript
// Current (Bad)
for (const gym of gyms) {
  const [staffResult, clientResult] = await Promise.all([
    this.findAllStaff({ ...filters, gymId: gym.id }),
    this.findAllClients({ ...filters, gymId: gym.id }),
  ]);
}
```

**Solution:**
- Batch load all schema data in single query
- Implement result caching
- Use UNION query across schemas

---

### 2. Auth Login Loop - Linear Schema Scan

| Attribute | Value |
|-----------|-------|
| **File** | `src/auth/auth.service.ts` |
| **Lines** | 516-602 |
| **Method** | Staff/Client login flow |

**Problem:**
Linear scan of ALL gym schemas to find user during login. Worst case: 50+ schema queries per login attempt.

```typescript
// Current (Bad)
for (const gym of gyms) {
  const tenantUser = await this.tenantService.executeInTenant(gym.id, ...);
  if (tenantUser) return;
}
```

**Solution:**
- Create global email lookup table/index
- Cache email → gymId mapping in Redis
- Add email index across all tenant schemas

---

### 3. Triple Email Check on User Creation

| Attribute | Value |
|-----------|-------|
| **File** | `src/users/users.service.ts` |
| **Lines** | 118-139, 362-391, 631-658 |
| **Methods** | `createAdmin()`, `createStaff()`, `createClient()` |

**Problem:**
Checks email existence in 3 separate tables with individual queries:
1. `public.users`
2. `system_users`
3. Tenant schema users

**Solution:**
```typescript
// Optimized - Use Promise.all()
const [existingUser, existingSystemUser, existingTenantUser] = await Promise.all([
  this.prisma.user.findUnique({ where: { email } }),
  this.prisma.systemUser.findUnique({ where: { email } }),
  this.tenantService.executeInTenant(gymId, async (client) => {
    return client.query(`SELECT id FROM users WHERE email = $1`, [email]);
  }),
]);
```

---

### 4. Password Reset - All Gyms Loop

| Attribute | Value |
|-----------|-------|
| **File** | `src/auth/auth.service.ts` |
| **Lines** | 1254-1282 |
| **Method** | `findUserByEmail()` |

**Problem:**
Loops through ALL gyms searching tenant schemas one by one for password reset/verification.

**Solution:**
- Global email registry table
- Redis cache for email → tenant mapping

---

### 5. In-Memory Pagination

| Attribute | Value |
|-----------|-------|
| **File** | `src/users/users.service.ts` |
| **Lines** | 968-987 |
| **Method** | `findAll()` |

**Problem:**
Fetches ALL users (admins + staff + clients) without limits, combines in memory, then paginates.

```typescript
// Current (Bad)
const allUsers = [...adminResult.data, ...staffResult.data, ...clientResult.data];
// Then paginate in JS
```

**Solution:**
Use database-level UNION query with LIMIT/OFFSET:
```sql
SELECT * FROM (
  SELECT id, name, email, 'admin' as source FROM public.users
  UNION ALL
  SELECT id, name, email, 'staff' as source FROM tenant_X.users WHERE role != 'client'
  UNION ALL
  SELECT id, name, email, 'client' as source FROM tenant_X.users WHERE role = 'client'
) combined
ORDER BY created_at DESC
LIMIT $1 OFFSET $2
```

---

## MEDIUM PRIORITY - Performance Improvements

### 6. Missing Composite Indexes

| Attribute | Value |
|-----------|-------|
| **File** | `src/tenant/tenant.service.ts` |
| **Lines** | 485-536 |
| **Method** | `createTenantIndexes()` |

**Missing Indexes:**
```sql
-- Memberships (heavily used for user dashboard)
CREATE INDEX idx_memberships_user_status ON memberships(user_id, status);

-- Attendance (used for history queries)
CREATE INDEX idx_attendance_user_date ON attendance(user_id, date);
CREATE INDEX idx_attendance_history_user_date ON attendance_history(user_id, date);

-- Users search
CREATE INDEX idx_users_email_trgm ON users USING gin(email gin_trgm_ops);
```

---

### 7. Sequential Registration Flow

| Attribute | Value |
|-----------|-------|
| **File** | `src/auth/auth.service.ts` |
| **Lines** | 215-309 |
| **Method** | `registerAdminWithGym()` |

**Problem:**
Operations run sequentially: gym → schema → branch → user → subscription

**Solution:**
Parallelize independent operations after gym ID is obtained.

---

### 8. Attendance Deduplication in Memory

| Attribute | Value |
|-----------|-------|
| **File** | `src/attendance/attendance.service.ts` |
| **Lines** | 282-314 |

**Problem:**
Fetches active + history records separately, deduplicates in JavaScript.

**Solution:**
```sql
-- Use database UNION DISTINCT
SELECT * FROM attendance WHERE user_id = $1
UNION
SELECT * FROM attendance_history WHERE user_id = $1
ORDER BY check_in_time DESC
```

---

### 9. Sequential Checkout Operations

| Attribute | Value |
|-----------|-------|
| **File** | `src/attendance/attendance.service.ts` |
| **Lines** | 209-220 |
| **Method** | `checkOut()` |

**Problem:**
INSERT into history then UPDATE attendance status separately.

**Solution:**
Wrap in single transaction or use CTE:
```sql
WITH inserted AS (
  INSERT INTO attendance_history (...) VALUES (...) RETURNING id
)
UPDATE attendance SET status = 'checked_out' WHERE id = $1
```

---

### 10. No Caching - Plans Data

| Attribute | Value |
|-----------|-------|
| **File** | `src/plans/plans.service.ts` |
| **Lines** | 19-43 |
| **Method** | `findAll()` |

**Problem:**
Plans rarely change but queried on every dashboard/membership request.

**Solution:**
```typescript
// Redis cache with 1 hour TTL
const cacheKey = `plans:${gymId}:${branchId || 'all'}`;
const cached = await this.redis.get(cacheKey);
if (cached) return JSON.parse(cached);

const plans = await this.fetchPlans();
await this.redis.setex(cacheKey, 3600, JSON.stringify(plans));
return plans;
```

---

### 11. No Caching - Subscription Info

| Attribute | Value |
|-----------|-------|
| **File** | `src/auth/auth.service.ts` |
| **Lines** | 139-145, 737-739 |

**Problem:**
Subscription info queried on every profile fetch.

**Solution:**
- Cache in JWT token (for static info)
- Redis cache with key `gym_subscription:${gymId}`

---

### 12. No Caching - Schema Existence Check

| Attribute | Value |
|-----------|-------|
| **File** | `src/auth/auth.service.ts` |
| **Lines** | 523-524 |
| **Method** | `tenantSchemaExists()` |

**Problem:**
Checks information_schema for each staff login.

**Solution:**
Cache schema existence (invalidate only on creation):
```typescript
const schemaCache = new Map<number, boolean>();
```

---

### 13. Redundant Gym Lookups

| Attribute | Value |
|-----------|-------|
| **File** | `src/memberships/memberships.service.ts` |
| **Lines** | 316, 343, 360, 377 |

**Problem:**
`findOne()` re-queries gym data on every update/cancel/payment.

**Solution:**
Pass gym data as parameter or use request-scoped cache.

---

### 14. Missing Transaction Wrapper

| Attribute | Value |
|-----------|-------|
| **File** | `src/memberships/memberships.service.ts` |
| **Lines** | 310-316 |
| **Method** | `create()` |

**Problem:**
Membership creation and offer usage update not wrapped in transaction.

**Solution:**
```typescript
await this.tenantService.executeInTenant(gymId, async (client) => {
  await client.query('BEGIN');
  try {
    const membership = await client.query('INSERT INTO memberships...');
    await client.query('UPDATE offers SET used_count = used_count + 1...');
    await client.query('COMMIT');
    return membership;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  }
});
```

---

## LOW PRIORITY - Optimizations

### 15. ILIKE Search Performance

| Attribute | Value |
|-----------|-------|
| **File** | `src/users/users.service.ts` |
| **Lines** | 206-210, 456, 725 |

**Problem:**
`%search%` pattern with ILIKE causes full table scan.

**Solution:**
Add trigram indexes:
```sql
CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE INDEX idx_users_name_trgm ON users USING gin(name gin_trgm_ops);
CREATE INDEX idx_users_email_trgm ON users USING gin(email gin_trgm_ops);
```

---

### 16. Unnecessary JOINs

| Attribute | Value |
|-----------|-------|
| **File** | `src/memberships/memberships.service.ts` |
| **Lines** | 62-68, 400-404 |

**Problem:**
Always joins offers table even when not needed.

**Solution:**
Make offer join conditional based on query parameter.

---

### 17. No Pagination Hard Limit

| Attribute | Value |
|-----------|-------|
| **File** | `src/attendance/attendance.service.ts` |
| **Lines** | 403-458 |
| **Method** | `getAllAttendance()` |

**Problem:**
No hard cap - could return 10,000+ records.

**Solution:**
```typescript
const MAX_LIMIT = 1000;
const safeLimit = Math.min(limit || 50, MAX_LIMIT);
```

---

### 18. Response Data Bloat

| Attribute | Value |
|-----------|-------|
| **File** | `src/users/users.service.ts` |
| **Lines** | 215-226 |

**Problem:**
Returns full gym object with every admin in list.

**Solution:**
Create DTOs with only necessary fields:
```typescript
class AdminListItemDto {
  id: number;
  name: string;
  email: string;
  gymId: number; // Not full gym object
}
```

---

### 19. Connection Per Query

| Attribute | Value |
|-----------|-------|
| **File** | `src/tenant/tenant.service.ts` |
| **Lines** | 658-670 |
| **Method** | `executeInTenant()` |

**Problem:**
New connection + SET search_path per query.

**Solution:**
- Connection pooling per schema
- Session pooling with PgBouncer
- Batch operations where possible

---

### 20. Date Recomputation

| Attribute | Value |
|-----------|-------|
| **File** | `src/attendance/attendance.service.ts` |
| **Lines** | 360-389 |
| **Method** | `getAttendanceStats()` |

**Problem:**
Week/month start calculated on every stats request.

**Solution:**
Extract to utility function or precompute:
```typescript
// utils/date.util.ts
export const getWeekStart = () => startOfWeek(new Date());
export const getMonthStart = () => startOfMonth(new Date());
```

---

## Quick Wins Checklist

- [ ] Use `Promise.all()` for email checks (3 queries → parallel)
- [ ] Add composite indexes for frequent queries
- [ ] Cache plans data (1 hour TTL)
- [ ] Cache gym subscription info
- [ ] Add hard limit (max 1000) on list endpoints
- [ ] Wrap membership creation in transaction

---

## Implementation Notes

### Caching Strategy

Recommended caching solution: **Redis**

```typescript
// Cache keys convention
plans:${gymId}:${branchId}           // TTL: 1 hour
subscription:${gymId}                 // TTL: 1 hour
schema_exists:${gymId}               // TTL: 24 hours (invalidate on create)
email_to_gym:${email}                // TTL: 1 hour
```

### Index Creation Script

```sql
-- Run in each tenant schema
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_memberships_user_status
  ON memberships(user_id, status);

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_attendance_user_date
  ON attendance(user_id, date);

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_attendance_history_user_date
  ON attendance_history(user_id, date);

-- For search optimization (requires pg_trgm extension)
CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_users_name_trgm
  ON users USING gin(name gin_trgm_ops);
```

---

## Performance Metrics to Track

| Metric | Current | Target |
|--------|---------|--------|
| Login response time | TBD | < 200ms |
| User list (paginated) | TBD | < 300ms |
| Dashboard load | TBD | < 500ms |
| Membership creation | TBD | < 200ms |
| Attendance check-in | TBD | < 150ms |

---

## References

- [PostgreSQL Index Types](https://www.postgresql.org/docs/current/indexes-types.html)
- [Redis Caching Patterns](https://redis.io/docs/manual/patterns/)
- [NestJS Caching](https://docs.nestjs.com/techniques/caching)
- [Prisma Query Optimization](https://www.prisma.io/docs/guides/performance-and-optimization)
