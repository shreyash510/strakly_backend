-- Performance indexes for production
-- These columns are frequently queried but missing indexes

CREATE INDEX IF NOT EXISTS idx_memberships_paid_at ON memberships(paid_at) WHERE (is_deleted = FALSE OR is_deleted IS NULL);
CREATE INDEX IF NOT EXISTS idx_memberships_payment_status ON memberships(payment_status) WHERE (is_deleted = FALSE OR is_deleted IS NULL);
CREATE INDEX IF NOT EXISTS idx_expenses_expense_date ON expenses(expense_date) WHERE (is_deleted = FALSE OR is_deleted IS NULL);
CREATE INDEX IF NOT EXISTS idx_attendance_history_date ON attendance_history(attendance_date);
CREATE INDEX IF NOT EXISTS idx_attendance_history_user ON attendance_history(user_id);
CREATE INDEX IF NOT EXISTS idx_membership_history_original ON membership_history(original_id);
CREATE INDEX IF NOT EXISTS idx_membership_history_user ON membership_history(user_id);
CREATE INDEX IF NOT EXISTS idx_notifications_user_read ON notifications(user_id, is_read, created_at);
CREATE INDEX IF NOT EXISTS idx_staff_salaries_period ON staff_salaries(staff_id, year, month) WHERE (is_deleted = FALSE OR is_deleted IS NULL);
