-- Migration: 009_tenant_expense_controls
-- Description: Enforce controlled, approved, staff-linked expenses.
--   - Adds staff_id, reason, approval_status lifecycle + audit fields to expenses.
--   - Creates expense_approval_history for a dedicated audit trail.
--   - Backfills legacy rows as 'approved' so historical data keeps working.
-- Idempotent: safe to re-run. Does NOT add DB-level NOT NULL on staff_id because
-- legacy rows may not have a staff link; the application enforces it on new rows.

-- ============================================
-- 1. Expense lifecycle + staff-link columns
-- ============================================
ALTER TABLE expenses ADD COLUMN IF NOT EXISTS title            VARCHAR(255);
ALTER TABLE expenses ADD COLUMN IF NOT EXISTS created_by       INTEGER;
-- staff_id references public.users.id (see salary.service.ts); no FK because the
-- tenant schema's `users` table holds clients, not staff.
ALTER TABLE expenses ADD COLUMN IF NOT EXISTS staff_id         INTEGER;
ALTER TABLE expenses ADD COLUMN IF NOT EXISTS reason           TEXT;
ALTER TABLE expenses ADD COLUMN IF NOT EXISTS approval_status  VARCHAR(20) NOT NULL DEFAULT 'pending_approval';
ALTER TABLE expenses ADD COLUMN IF NOT EXISTS submitted_by_id  INTEGER;
ALTER TABLE expenses ADD COLUMN IF NOT EXISTS submitted_at     TIMESTAMP;
ALTER TABLE expenses ADD COLUMN IF NOT EXISTS approved_at      TIMESTAMP;
ALTER TABLE expenses ADD COLUMN IF NOT EXISTS rejected_by_id   INTEGER;
ALTER TABLE expenses ADD COLUMN IF NOT EXISTS rejected_at      TIMESTAMP;
ALTER TABLE expenses ADD COLUMN IF NOT EXISTS rejection_reason TEXT;

CREATE INDEX IF NOT EXISTS idx_expenses_staff_id        ON expenses(staff_id);
CREATE INDEX IF NOT EXISTS idx_expenses_approval_status ON expenses(approval_status);
CREATE INDEX IF NOT EXISTS idx_expenses_submitted_by    ON expenses(submitted_by_id);

-- ============================================
-- 2. Backfill legacy rows
-- ============================================
-- Existing rows pre-date the approval workflow: mark them approved so they stay
-- visible and payable. New rows start at 'pending_approval' via the default.
UPDATE expenses
SET approval_status = 'approved',
    approved_at     = COALESCE(approved_at, updated_at, created_at, NOW())
WHERE approval_status = 'pending_approval'
  AND created_at < NOW();

-- ============================================
-- 3. Approval audit history
-- ============================================
CREATE TABLE IF NOT EXISTS expense_approval_history (
  id          SERIAL PRIMARY KEY,
  expense_id  INTEGER NOT NULL REFERENCES expenses(id) ON DELETE CASCADE,
  action      VARCHAR(30) NOT NULL,  -- submitted | approved | rejected | edited | paid | deleted
  actor_id    INTEGER NOT NULL,
  notes       TEXT,
  old_values  JSONB,
  new_values  JSONB,
  created_at  TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_expense_approval_history_expense ON expense_approval_history(expense_id);
CREATE INDEX IF NOT EXISTS idx_expense_approval_history_actor   ON expense_approval_history(actor_id);
CREATE INDEX IF NOT EXISTS idx_expense_approval_history_created ON expense_approval_history(created_at DESC);
