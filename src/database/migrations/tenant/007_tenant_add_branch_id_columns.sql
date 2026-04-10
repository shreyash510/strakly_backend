-- Add branch_id to all tenant tables that need branch filtering
-- Also adds allowed_branch_ids to users for multi-branch manager access
-- Uses IF NOT EXISTS so it is safe to re-run on schemas that already have the column

ALTER TABLE users ADD COLUMN IF NOT EXISTS branch_id INTEGER;
ALTER TABLE users ADD COLUMN IF NOT EXISTS allowed_branch_ids JSONB DEFAULT '[]';

ALTER TABLE leads ADD COLUMN IF NOT EXISTS branch_id INTEGER;
ALTER TABLE referrals ADD COLUMN IF NOT EXISTS branch_id INTEGER;
ALTER TABLE plans ADD COLUMN IF NOT EXISTS branch_id INTEGER;
ALTER TABLE memberships ADD COLUMN IF NOT EXISTS branch_id INTEGER;
ALTER TABLE products ADD COLUMN IF NOT EXISTS branch_id INTEGER;
ALTER TABLE product_sales ADD COLUMN IF NOT EXISTS branch_id INTEGER;
ALTER TABLE expenses ADD COLUMN IF NOT EXISTS branch_id INTEGER;
ALTER TABLE attendance ADD COLUMN IF NOT EXISTS branch_id INTEGER;
ALTER TABLE attendance_history ADD COLUMN IF NOT EXISTS branch_id INTEGER;
ALTER TABLE announcements ADD COLUMN IF NOT EXISTS branch_id INTEGER;
ALTER TABLE class_types ADD COLUMN IF NOT EXISTS branch_id INTEGER;
ALTER TABLE class_schedules ADD COLUMN IF NOT EXISTS branch_id INTEGER;
ALTER TABLE class_sessions ADD COLUMN IF NOT EXISTS branch_id INTEGER;
ALTER TABLE appointments ADD COLUMN IF NOT EXISTS branch_id INTEGER;
ALTER TABLE guest_visits ADD COLUMN IF NOT EXISTS branch_id INTEGER;
ALTER TABLE activity_logs ADD COLUMN IF NOT EXISTS branch_id INTEGER;
ALTER TABLE staff_salaries ADD COLUMN IF NOT EXISTS branch_id INTEGER;
