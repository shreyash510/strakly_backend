/* ============================================================
   Restore branch_id columns that were dropped by migration 003
   (on local DB only). Production tenants that ran the old
   tenant.service.ts migrations still have these columns.

   The backend INSERT statements reference branch_id with NULL
   values, so the columns must exist even though they're unused.

   Uses IF NOT EXISTS pattern — safe for tenants that already
   have the columns.
   ============================================================ */

DO $$
DECLARE
  tbl TEXT;
  tables_with_branch TEXT[] := ARRAY[
    'users', 'plans', 'offers', 'memberships',
    'attendance', 'attendance_history',
    'body_metrics', 'staff_salaries',
    'facilities', 'amenities',
    'notifications', 'activity_logs', 'announcements', 'payments',
    'diets', 'diet_assignments',
    'class_types', 'class_schedules', 'class_sessions',
    'services', 'trainer_availability', 'appointments', 'session_packages',
    'guest_visits',
    'equipment', 'equipment_maintenance',
    'products', 'product_sales', 'product_categories',
    'leads', 'referrals', 'progress_photos',
    'member_notes', 'membership_freezes'
  ];
BEGIN
  FOREACH tbl IN ARRAY tables_with_branch
  LOOP
    IF EXISTS (
      SELECT 1 FROM information_schema.tables
      WHERE table_schema = current_schema() AND table_name = tbl
    ) AND NOT EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = current_schema() AND table_name = tbl AND column_name = 'branch_id'
    ) THEN
      EXECUTE format('ALTER TABLE %I ADD COLUMN branch_id INTEGER', tbl);
    END IF;
  END LOOP;
END $$;

-- Restore user_branch_xref table if dropped
CREATE TABLE IF NOT EXISTS user_branch_xref (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL,
  branch_id INTEGER NOT NULL,
  is_primary BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);
