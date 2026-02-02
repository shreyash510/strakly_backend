-- 001_initial_setup.sql
-- Tenant schema tables for Strakly
-- This migration runs for each tenant schema (tenant_X)
-- IMPORTANT: All tables use IF NOT EXISTS for idempotency

-- =====================
-- MIGRATIONS TRACKING TABLE (per tenant)
-- =====================
CREATE TABLE IF NOT EXISTS migrations (
  id SERIAL PRIMARY KEY,
  schema_name VARCHAR(100) NOT NULL,
  version VARCHAR(10) NOT NULL,
  name VARCHAR(255) NOT NULL,
  md5_hash VARCHAR(32) NOT NULL,
  applied_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(schema_name, version)
);

-- =====================
-- USERS TABLE (STAFF: manager, trainer, branch_admin + CLIENTS: members)
-- =====================
CREATE TABLE IF NOT EXISTS users (
  id SERIAL PRIMARY KEY,
  branch_id INTEGER,
  name VARCHAR(255) NOT NULL,
  email VARCHAR(255) UNIQUE NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  phone VARCHAR(50),
  avatar TEXT,
  bio TEXT,
  role VARCHAR(50) NOT NULL DEFAULT 'client',
  date_of_birth TIMESTAMP,
  gender VARCHAR(20),
  address TEXT,
  city VARCHAR(100),
  state VARCHAR(100),
  zip_code VARCHAR(20),
  emergency_contact_name VARCHAR(255),
  emergency_contact_phone VARCHAR(50),
  status VARCHAR(50) DEFAULT 'active',
  status_id INTEGER,
  email_verified BOOLEAN DEFAULT false,
  attendance_code VARCHAR(20) UNIQUE,
  join_date TIMESTAMP,
  last_login_at TIMESTAMP,
  is_deleted BOOLEAN DEFAULT FALSE,
  deleted_at TIMESTAMP,
  deleted_by INTEGER,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- User indexes
CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
CREATE INDEX IF NOT EXISTS idx_users_role ON users(role);
CREATE INDEX IF NOT EXISTS idx_users_status ON users(status);
CREATE INDEX IF NOT EXISTS idx_users_status_id ON users(status_id);
CREATE INDEX IF NOT EXISTS idx_users_attendance_code ON users(attendance_code);
CREATE INDEX IF NOT EXISTS idx_users_branch ON users(branch_id);
CREATE INDEX IF NOT EXISTS idx_users_not_deleted ON users(is_deleted) WHERE is_deleted = FALSE;

-- =====================
-- PLANS TABLE (gym-specific membership plans)
-- =====================
CREATE TABLE IF NOT EXISTS plans (
  id SERIAL PRIMARY KEY,
  branch_id INTEGER,
  code VARCHAR(100) NOT NULL,
  name VARCHAR(255) NOT NULL,
  description TEXT,
  duration_value INTEGER NOT NULL,
  duration_type VARCHAR(50) NOT NULL,
  price DECIMAL(10, 2) NOT NULL,
  currency VARCHAR(10) DEFAULT 'INR',
  features JSONB,
  display_order INTEGER DEFAULT 0,
  is_featured BOOLEAN DEFAULT FALSE,
  is_active BOOLEAN DEFAULT TRUE,
  is_deleted BOOLEAN DEFAULT FALSE,
  deleted_at TIMESTAMP,
  deleted_by INTEGER,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(branch_id, code)
);

-- Plans indexes
CREATE INDEX IF NOT EXISTS idx_plans_branch ON plans(branch_id);
CREATE INDEX IF NOT EXISTS idx_plans_active ON plans(is_active) WHERE is_active = TRUE;
CREATE INDEX IF NOT EXISTS idx_plans_not_deleted ON plans(is_deleted) WHERE is_deleted = FALSE;

-- =====================
-- OFFERS TABLE (discounts and promotions)
-- =====================
CREATE TABLE IF NOT EXISTS offers (
  id SERIAL PRIMARY KEY,
  branch_id INTEGER,
  code VARCHAR(100) NOT NULL,
  name VARCHAR(255) NOT NULL,
  description TEXT,
  discount_type VARCHAR(50) NOT NULL,
  discount_value DECIMAL(10, 2) NOT NULL,
  valid_from TIMESTAMP NOT NULL,
  valid_to TIMESTAMP NOT NULL,
  max_usage_count INTEGER,
  used_count INTEGER DEFAULT 0,
  max_usage_per_user INTEGER,
  min_purchase_amount DECIMAL(10, 2),
  applicable_to_all BOOLEAN DEFAULT TRUE,
  is_active BOOLEAN DEFAULT TRUE,
  is_deleted BOOLEAN DEFAULT FALSE,
  deleted_at TIMESTAMP,
  deleted_by INTEGER,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(branch_id, code)
);

-- Offers indexes
CREATE INDEX IF NOT EXISTS idx_offers_branch ON offers(branch_id);
CREATE INDEX IF NOT EXISTS idx_offers_active ON offers(is_active) WHERE is_active = TRUE;
CREATE INDEX IF NOT EXISTS idx_offers_validity ON offers(valid_from, valid_to);
CREATE INDEX IF NOT EXISTS idx_offers_not_deleted ON offers(is_deleted) WHERE is_deleted = FALSE;

-- =====================
-- PLAN-OFFER CROSS REFERENCE
-- =====================
CREATE TABLE IF NOT EXISTS plan_offer_xref (
  id SERIAL PRIMARY KEY,
  branch_id INTEGER,
  plan_id INTEGER NOT NULL REFERENCES plans(id) ON DELETE CASCADE,
  offer_id INTEGER NOT NULL REFERENCES offers(id) ON DELETE CASCADE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(plan_id, offer_id)
);

-- Plan-offer indexes
CREATE INDEX IF NOT EXISTS idx_plan_offer_xref_branch ON plan_offer_xref(branch_id);
CREATE INDEX IF NOT EXISTS idx_plan_offer_xref_plan ON plan_offer_xref(plan_id);
CREATE INDEX IF NOT EXISTS idx_plan_offer_xref_offer ON plan_offer_xref(offer_id);

-- =====================
-- MEMBERSHIPS TABLE
-- =====================
CREATE TABLE IF NOT EXISTS memberships (
  id SERIAL PRIMARY KEY,
  branch_id INTEGER,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  plan_id INTEGER NOT NULL REFERENCES plans(id) ON DELETE RESTRICT,
  offer_id INTEGER REFERENCES offers(id),
  start_date TIMESTAMP NOT NULL,
  end_date TIMESTAMP NOT NULL,
  status VARCHAR(50) DEFAULT 'pending',
  original_amount DECIMAL(10, 2) NOT NULL,
  discount_amount DECIMAL(10, 2) DEFAULT 0,
  final_amount DECIMAL(10, 2) NOT NULL,
  currency VARCHAR(10) DEFAULT 'INR',
  payment_status VARCHAR(50) DEFAULT 'pending',
  payment_method VARCHAR(50),
  payment_ref VARCHAR(255),
  paid_at TIMESTAMP,
  cancelled_at TIMESTAMP,
  cancel_reason TEXT,
  notes TEXT,
  created_by INTEGER,
  is_active BOOLEAN DEFAULT TRUE,
  is_deleted BOOLEAN DEFAULT FALSE,
  deleted_at TIMESTAMP,
  deleted_by INTEGER,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Memberships indexes
CREATE INDEX IF NOT EXISTS idx_memberships_user ON memberships(user_id);
CREATE INDEX IF NOT EXISTS idx_memberships_plan ON memberships(plan_id);
CREATE INDEX IF NOT EXISTS idx_memberships_status ON memberships(status);
CREATE INDEX IF NOT EXISTS idx_memberships_dates ON memberships(start_date, end_date);
CREATE INDEX IF NOT EXISTS idx_memberships_branch ON memberships(branch_id);
CREATE INDEX IF NOT EXISTS idx_memberships_payment_status ON memberships(payment_status);
CREATE INDEX IF NOT EXISTS idx_memberships_not_deleted ON memberships(is_deleted) WHERE is_deleted = FALSE;
CREATE INDEX IF NOT EXISTS idx_memberships_branch_status_end ON memberships(branch_id, status, end_date);
CREATE INDEX IF NOT EXISTS idx_memberships_user_active ON memberships(user_id, status) WHERE status = 'active';

-- =====================
-- MEMBERSHIP HISTORY TABLE
-- =====================
CREATE TABLE IF NOT EXISTS membership_history (
  id SERIAL PRIMARY KEY,
  branch_id INTEGER,
  original_id INTEGER NOT NULL,
  user_id INTEGER NOT NULL,
  plan_id INTEGER NOT NULL,
  offer_id INTEGER,
  start_date TIMESTAMP NOT NULL,
  end_date TIMESTAMP NOT NULL,
  status VARCHAR(50) NOT NULL,
  original_amount DECIMAL(10, 2) NOT NULL,
  discount_amount DECIMAL(10, 2) DEFAULT 0,
  final_amount DECIMAL(10, 2) NOT NULL,
  currency VARCHAR(10) DEFAULT 'INR',
  payment_status VARCHAR(50) NOT NULL,
  payment_method VARCHAR(50),
  payment_ref VARCHAR(255),
  paid_at TIMESTAMP,
  cancelled_at TIMESTAMP,
  cancel_reason TEXT,
  notes TEXT,
  archived_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  archive_reason VARCHAR(100),
  original_created_at TIMESTAMP NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Membership history indexes
CREATE INDEX IF NOT EXISTS idx_membership_history_branch ON membership_history(branch_id);
CREATE INDEX IF NOT EXISTS idx_membership_history_user ON membership_history(user_id);
CREATE INDEX IF NOT EXISTS idx_membership_history_original ON membership_history(original_id);

-- =====================
-- ATTENDANCE TABLE (active check-ins)
-- =====================
CREATE TABLE IF NOT EXISTS attendance (
  id SERIAL PRIMARY KEY,
  branch_id INTEGER,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  membership_id INTEGER REFERENCES memberships(id),
  check_in_time TIMESTAMP NOT NULL,
  check_out_time TIMESTAMP,
  date VARCHAR(20) NOT NULL,
  attendance_date DATE,
  marked_by INTEGER NOT NULL,
  check_in_method VARCHAR(50) DEFAULT 'code',
  status VARCHAR(50) DEFAULT 'present',
  is_deleted BOOLEAN DEFAULT FALSE,
  deleted_at TIMESTAMP,
  deleted_by INTEGER,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Attendance indexes
CREATE INDEX IF NOT EXISTS idx_attendance_user ON attendance(user_id);
CREATE INDEX IF NOT EXISTS idx_attendance_date ON attendance(date);
CREATE INDEX IF NOT EXISTS idx_attendance_attendance_date ON attendance(attendance_date);
CREATE INDEX IF NOT EXISTS idx_attendance_marked_by ON attendance(marked_by);
CREATE INDEX IF NOT EXISTS idx_attendance_branch ON attendance(branch_id);
CREATE INDEX IF NOT EXISTS idx_attendance_branch_date_composite ON attendance(branch_id, date);
CREATE INDEX IF NOT EXISTS idx_attendance_not_deleted ON attendance(is_deleted) WHERE is_deleted = FALSE;

-- =====================
-- ATTENDANCE HISTORY TABLE
-- =====================
CREATE TABLE IF NOT EXISTS attendance_history (
  id SERIAL PRIMARY KEY,
  branch_id INTEGER,
  user_id INTEGER NOT NULL,
  membership_id INTEGER,
  check_in_time TIMESTAMP NOT NULL,
  check_out_time TIMESTAMP NOT NULL,
  date VARCHAR(20) NOT NULL,
  attendance_date DATE,
  duration INTEGER,
  marked_by INTEGER NOT NULL,
  checked_out_by INTEGER,
  check_in_method VARCHAR(50) DEFAULT 'code',
  status VARCHAR(50) DEFAULT 'checked_out',
  is_deleted BOOLEAN DEFAULT FALSE,
  deleted_at TIMESTAMP,
  deleted_by INTEGER,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Attendance history indexes
CREATE INDEX IF NOT EXISTS idx_attendance_history_user ON attendance_history(user_id);
CREATE INDEX IF NOT EXISTS idx_attendance_history_date ON attendance_history(date);
CREATE INDEX IF NOT EXISTS idx_attendance_history_attendance_date ON attendance_history(attendance_date);
CREATE INDEX IF NOT EXISTS idx_attendance_history_branch ON attendance_history(branch_id);

-- =====================
-- BODY METRICS TABLE
-- =====================
CREATE TABLE IF NOT EXISTS body_metrics (
  id SERIAL PRIMARY KEY,
  branch_id INTEGER,
  user_id INTEGER UNIQUE NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  height DECIMAL(5, 2),
  weight DECIMAL(5, 2),
  bmi DECIMAL(4, 2),
  body_fat DECIMAL(4, 2),
  muscle_mass DECIMAL(5, 2),
  bone_mass DECIMAL(4, 2),
  water_percentage DECIMAL(4, 2),
  chest DECIMAL(5, 2),
  waist DECIMAL(5, 2),
  hips DECIMAL(5, 2),
  biceps DECIMAL(5, 2),
  thighs DECIMAL(5, 2),
  calves DECIMAL(5, 2),
  shoulders DECIMAL(5, 2),
  neck DECIMAL(5, 2),
  resting_heart_rate INTEGER,
  blood_pressure_sys INTEGER,
  blood_pressure_dia INTEGER,
  target_weight DECIMAL(5, 2),
  target_body_fat DECIMAL(4, 2),
  last_measured_at TIMESTAMP,
  measured_by INTEGER,
  notes TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Body metrics indexes
CREATE INDEX IF NOT EXISTS idx_body_metrics_branch ON body_metrics(branch_id);
CREATE INDEX IF NOT EXISTS idx_body_metrics_user ON body_metrics(user_id);

-- =====================
-- BODY METRICS HISTORY TABLE
-- =====================
CREATE TABLE IF NOT EXISTS body_metrics_history (
  id SERIAL PRIMARY KEY,
  branch_id INTEGER,
  user_id INTEGER NOT NULL,
  measured_at TIMESTAMP NOT NULL,
  height DECIMAL(5, 2),
  weight DECIMAL(5, 2),
  bmi DECIMAL(4, 2),
  body_fat DECIMAL(4, 2),
  muscle_mass DECIMAL(5, 2),
  bone_mass DECIMAL(4, 2),
  water_percentage DECIMAL(4, 2),
  chest DECIMAL(5, 2),
  waist DECIMAL(5, 2),
  hips DECIMAL(5, 2),
  biceps DECIMAL(5, 2),
  thighs DECIMAL(5, 2),
  calves DECIMAL(5, 2),
  shoulders DECIMAL(5, 2),
  neck DECIMAL(5, 2),
  resting_heart_rate INTEGER,
  blood_pressure_sys INTEGER,
  blood_pressure_dia INTEGER,
  measured_by INTEGER,
  notes TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Body metrics history indexes
CREATE INDEX IF NOT EXISTS idx_body_metrics_history_branch ON body_metrics_history(branch_id);
CREATE INDEX IF NOT EXISTS idx_body_metrics_history_user ON body_metrics_history(user_id);
CREATE INDEX IF NOT EXISTS idx_body_metrics_history_measured ON body_metrics_history(measured_at DESC);

-- =====================
-- TRAINER-CLIENT CROSS REFERENCE
-- =====================
CREATE TABLE IF NOT EXISTS trainer_client_xref (
  id SERIAL PRIMARY KEY,
  branch_id INTEGER,
  trainer_id INTEGER NOT NULL,
  client_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  assigned_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  is_active BOOLEAN DEFAULT TRUE,
  notes TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(trainer_id, client_id)
);

-- Trainer-client indexes
CREATE INDEX IF NOT EXISTS idx_trainer_client_trainer ON trainer_client_xref(trainer_id);
CREATE INDEX IF NOT EXISTS idx_trainer_client_client ON trainer_client_xref(client_id);
CREATE INDEX IF NOT EXISTS idx_trainer_client_branch ON trainer_client_xref(branch_id);
CREATE INDEX IF NOT EXISTS idx_trainer_client_active ON trainer_client_xref(is_active) WHERE is_active = TRUE;

-- =====================
-- STAFF SALARIES TABLE
-- =====================
CREATE TABLE IF NOT EXISTS staff_salaries (
  id SERIAL PRIMARY KEY,
  branch_id INTEGER,
  staff_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  month INTEGER NOT NULL,
  year INTEGER NOT NULL,
  base_salary DECIMAL(10, 2) NOT NULL,
  bonus DECIMAL(10, 2) DEFAULT 0,
  deductions DECIMAL(10, 2) DEFAULT 0,
  net_amount DECIMAL(10, 2) NOT NULL,
  currency VARCHAR(10) DEFAULT 'INR',
  is_recurring BOOLEAN DEFAULT FALSE,
  payment_status VARCHAR(20) DEFAULT 'pending',
  payment_method VARCHAR(50),
  payment_ref VARCHAR(100),
  paid_at TIMESTAMP,
  paid_by_id INTEGER,
  notes TEXT,
  is_deleted BOOLEAN DEFAULT FALSE,
  deleted_at TIMESTAMP,
  deleted_by INTEGER,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(staff_id, month, year, branch_id)
);

-- Staff salaries indexes
CREATE INDEX IF NOT EXISTS idx_staff_salaries_staff ON staff_salaries(staff_id);
CREATE INDEX IF NOT EXISTS idx_staff_salaries_status ON staff_salaries(payment_status);
CREATE INDEX IF NOT EXISTS idx_staff_salaries_period ON staff_salaries(year, month);
CREATE INDEX IF NOT EXISTS idx_staff_salaries_branch ON staff_salaries(branch_id);
CREATE INDEX IF NOT EXISTS idx_staff_salaries_branch_status_composite ON staff_salaries(branch_id, payment_status);
CREATE INDEX IF NOT EXISTS idx_staff_salaries_period_status ON staff_salaries(year, month, payment_status);
CREATE INDEX IF NOT EXISTS idx_staff_salaries_not_deleted ON staff_salaries(is_deleted) WHERE is_deleted = FALSE;

-- =====================
-- FACILITIES TABLE
-- =====================
CREATE TABLE IF NOT EXISTS facilities (
  id SERIAL PRIMARY KEY,
  branch_id INTEGER,
  name VARCHAR(100) NOT NULL,
  code VARCHAR(20) NOT NULL,
  description TEXT,
  icon VARCHAR(50),
  is_active BOOLEAN DEFAULT TRUE,
  display_order INTEGER DEFAULT 0,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(branch_id, code)
);

-- Facilities indexes
CREATE INDEX IF NOT EXISTS idx_facilities_branch ON facilities(branch_id);
CREATE INDEX IF NOT EXISTS idx_facilities_code ON facilities(code);
CREATE INDEX IF NOT EXISTS idx_facilities_active ON facilities(is_active) WHERE is_active = TRUE;

-- =====================
-- AMENITIES TABLE
-- =====================
CREATE TABLE IF NOT EXISTS amenities (
  id SERIAL PRIMARY KEY,
  branch_id INTEGER,
  name VARCHAR(100) NOT NULL,
  code VARCHAR(20) NOT NULL,
  description TEXT,
  icon VARCHAR(50),
  is_active BOOLEAN DEFAULT TRUE,
  display_order INTEGER DEFAULT 0,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(branch_id, code)
);

-- Amenities indexes
CREATE INDEX IF NOT EXISTS idx_amenities_branch ON amenities(branch_id);
CREATE INDEX IF NOT EXISTS idx_amenities_code ON amenities(code);
CREATE INDEX IF NOT EXISTS idx_amenities_active ON amenities(is_active) WHERE is_active = TRUE;

-- =====================
-- MEMBERSHIP-FACILITY ASSOCIATION
-- =====================
CREATE TABLE IF NOT EXISTS membership_facilities (
  id SERIAL PRIMARY KEY,
  membership_id INTEGER NOT NULL REFERENCES memberships(id) ON DELETE CASCADE,
  facility_id INTEGER NOT NULL REFERENCES facilities(id) ON DELETE CASCADE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(membership_id, facility_id)
);

-- Membership-facility indexes
CREATE INDEX IF NOT EXISTS idx_membership_facilities_membership ON membership_facilities(membership_id);
CREATE INDEX IF NOT EXISTS idx_membership_facilities_facility ON membership_facilities(facility_id);

-- =====================
-- MEMBERSHIP-AMENITY ASSOCIATION
-- =====================
CREATE TABLE IF NOT EXISTS membership_amenities (
  id SERIAL PRIMARY KEY,
  membership_id INTEGER NOT NULL REFERENCES memberships(id) ON DELETE CASCADE,
  amenity_id INTEGER NOT NULL REFERENCES amenities(id) ON DELETE CASCADE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(membership_id, amenity_id)
);

-- Membership-amenity indexes
CREATE INDEX IF NOT EXISTS idx_membership_amenities_membership ON membership_amenities(membership_id);
CREATE INDEX IF NOT EXISTS idx_membership_amenities_amenity ON membership_amenities(amenity_id);

-- =====================
-- WORKOUT PLANS TABLE
-- =====================
CREATE TABLE IF NOT EXISTS workout_plans (
  id SERIAL PRIMARY KEY,
  branch_id INTEGER,
  title VARCHAR(255) NOT NULL,
  type VARCHAR(50) NOT NULL,
  description TEXT,
  category VARCHAR(100) NOT NULL,
  difficulty VARCHAR(50) DEFAULT 'beginner',
  duration INTEGER DEFAULT 7,
  sessions_per_week INTEGER DEFAULT 3,
  estimated_session_duration INTEGER DEFAULT 45,
  exercises JSONB DEFAULT '[]',
  status VARCHAR(50) DEFAULT 'draft',
  created_by INTEGER NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Workout plans indexes
CREATE INDEX IF NOT EXISTS idx_workout_plans_branch ON workout_plans(branch_id);
CREATE INDEX IF NOT EXISTS idx_workout_plans_status ON workout_plans(status);
CREATE INDEX IF NOT EXISTS idx_workout_plans_type ON workout_plans(type);
CREATE INDEX IF NOT EXISTS idx_workout_plans_category ON workout_plans(category);
CREATE INDEX IF NOT EXISTS idx_workout_plans_created_by ON workout_plans(created_by);

-- =====================
-- WORKOUT ASSIGNMENTS TABLE
-- =====================
CREATE TABLE IF NOT EXISTS workout_assignments (
  id SERIAL PRIMARY KEY,
  branch_id INTEGER,
  workout_plan_id INTEGER NOT NULL REFERENCES workout_plans(id) ON DELETE CASCADE,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  assigned_by INTEGER NOT NULL,
  assigned_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  status VARCHAR(50) DEFAULT 'active',
  progress_percentage INTEGER DEFAULT 0,
  notes TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Workout assignments indexes
CREATE INDEX IF NOT EXISTS idx_workout_assignments_branch ON workout_assignments(branch_id);
CREATE INDEX IF NOT EXISTS idx_workout_assignments_workout ON workout_assignments(workout_plan_id);
CREATE INDEX IF NOT EXISTS idx_workout_assignments_user ON workout_assignments(user_id);
CREATE INDEX IF NOT EXISTS idx_workout_assignments_status ON workout_assignments(status);

-- =====================
-- NOTIFICATIONS TABLE
-- =====================
CREATE TABLE IF NOT EXISTS notifications (
  id SERIAL PRIMARY KEY,
  branch_id INTEGER,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  type VARCHAR(50) NOT NULL,
  title VARCHAR(255) NOT NULL,
  message TEXT NOT NULL,
  data JSONB,
  is_read BOOLEAN DEFAULT FALSE,
  read_at TIMESTAMP,
  action_url VARCHAR(500),
  priority VARCHAR(20) DEFAULT 'normal',
  expires_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  created_by INTEGER
);

-- Notifications indexes
CREATE INDEX IF NOT EXISTS idx_notifications_user ON notifications(user_id);
CREATE INDEX IF NOT EXISTS idx_notifications_unread ON notifications(user_id, is_read) WHERE is_read = FALSE;
CREATE INDEX IF NOT EXISTS idx_notifications_type ON notifications(type);
CREATE INDEX IF NOT EXISTS idx_notifications_created ON notifications(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_notifications_branch ON notifications(branch_id);

-- =====================
-- USER-BRANCH CROSS REFERENCE (multi-branch assignments)
-- =====================
CREATE TABLE IF NOT EXISTS user_branch_xref (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL,
  branch_id INTEGER NOT NULL,
  is_primary BOOLEAN DEFAULT FALSE,
  is_active BOOLEAN DEFAULT TRUE,
  assigned_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(user_id, branch_id)
);

-- User-branch xref indexes
CREATE INDEX IF NOT EXISTS idx_user_branch_xref_user ON user_branch_xref(user_id);
CREATE INDEX IF NOT EXISTS idx_user_branch_xref_branch ON user_branch_xref(branch_id);
CREATE INDEX IF NOT EXISTS idx_user_branch_xref_active ON user_branch_xref(is_active) WHERE is_active = TRUE;

-- =====================
-- PAYMENTS TABLE (centralized payment tracking)
-- =====================
CREATE TABLE IF NOT EXISTS payments (
  id SERIAL PRIMARY KEY,
  branch_id INTEGER,

  -- Payment source (what is being paid for)
  payment_type VARCHAR(50) NOT NULL,
  reference_id INTEGER NOT NULL,
  reference_table VARCHAR(50) NOT NULL,

  -- Payer info
  payer_type VARCHAR(20) NOT NULL,
  payer_id INTEGER NOT NULL,
  payer_name VARCHAR(255),

  -- Payee info (optional, for salaries)
  payee_type VARCHAR(20),
  payee_id INTEGER,
  payee_name VARCHAR(255),

  -- Amount details
  amount DECIMAL(10, 2) NOT NULL,
  currency VARCHAR(10) DEFAULT 'INR',
  tax_amount DECIMAL(10, 2) DEFAULT 0,
  discount_amount DECIMAL(10, 2) DEFAULT 0,
  net_amount DECIMAL(10, 2) NOT NULL,

  -- Payment details
  payment_method VARCHAR(50) NOT NULL,
  payment_ref VARCHAR(255),
  payment_gateway VARCHAR(50),
  payment_gateway_ref VARCHAR(255),

  -- Status
  status VARCHAR(50) DEFAULT 'pending',
  failure_reason TEXT,

  -- Audit
  processed_at TIMESTAMP,
  processed_by INTEGER,
  notes TEXT,
  metadata JSONB,

  -- Timestamps
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Payments indexes
CREATE INDEX IF NOT EXISTS idx_payments_branch ON payments(branch_id);
CREATE INDEX IF NOT EXISTS idx_payments_type ON payments(payment_type);
CREATE INDEX IF NOT EXISTS idx_payments_ref ON payments(reference_table, reference_id);
CREATE INDEX IF NOT EXISTS idx_payments_status ON payments(status);
CREATE INDEX IF NOT EXISTS idx_payments_payer ON payments(payer_type, payer_id);
CREATE INDEX IF NOT EXISTS idx_payments_created ON payments(created_at DESC);

-- =====================
-- USER HISTORY TABLE (audit trail)
-- =====================
CREATE TABLE IF NOT EXISTS user_history (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL,
  change_type VARCHAR(50) NOT NULL,
  old_values JSONB,
  new_values JSONB,
  changed_fields TEXT[],
  changed_by INTEGER,
  changed_by_type VARCHAR(20),
  change_reason TEXT,
  ip_address VARCHAR(50),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- User history indexes
CREATE INDEX IF NOT EXISTS idx_user_history_user ON user_history(user_id);
CREATE INDEX IF NOT EXISTS idx_user_history_type ON user_history(change_type);
CREATE INDEX IF NOT EXISTS idx_user_history_created ON user_history(created_at DESC);

-- =====================
-- PLAN HISTORY TABLE (audit trail)
-- =====================
CREATE TABLE IF NOT EXISTS plan_history (
  id SERIAL PRIMARY KEY,
  plan_id INTEGER NOT NULL,
  change_type VARCHAR(50) NOT NULL,
  old_price DECIMAL(10, 2),
  new_price DECIMAL(10, 2),
  old_features JSONB,
  new_features JSONB,
  old_values JSONB,
  new_values JSONB,
  changed_by INTEGER,
  change_reason TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Plan history indexes
CREATE INDEX IF NOT EXISTS idx_plan_history_plan ON plan_history(plan_id);
CREATE INDEX IF NOT EXISTS idx_plan_history_created ON plan_history(created_at DESC);

-- =====================
-- SALARY HISTORY TABLE (audit trail)
-- =====================
CREATE TABLE IF NOT EXISTS salary_history (
  id SERIAL PRIMARY KEY,
  salary_id INTEGER NOT NULL,
  staff_id INTEGER NOT NULL,
  change_type VARCHAR(50) NOT NULL,
  old_values JSONB,
  new_values JSONB,
  payment_method VARCHAR(50),
  payment_ref VARCHAR(255),
  changed_by INTEGER,
  change_reason TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Salary history indexes
CREATE INDEX IF NOT EXISTS idx_salary_history_salary ON salary_history(salary_id);
CREATE INDEX IF NOT EXISTS idx_salary_history_staff ON salary_history(staff_id);
CREATE INDEX IF NOT EXISTS idx_salary_history_created ON salary_history(created_at DESC);

-- =====================
-- ACTIVITY LOGS TABLE (user action audit trail)
-- =====================
CREATE TABLE IF NOT EXISTS activity_logs (
  id SERIAL PRIMARY KEY,
  branch_id INTEGER,

  -- Actor (who performed the action)
  actor_id INTEGER NOT NULL,
  actor_type VARCHAR(20) NOT NULL,
  actor_name VARCHAR(255),

  -- Action
  action VARCHAR(100) NOT NULL,
  action_category VARCHAR(50),

  -- Target (what was affected)
  target_type VARCHAR(50),
  target_id INTEGER,
  target_name VARCHAR(255),

  -- Details
  description TEXT,
  old_values JSONB,
  new_values JSONB,
  metadata JSONB,

  -- Request context
  ip_address VARCHAR(50),
  user_agent TEXT,
  request_id VARCHAR(100),

  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Activity logs indexes
CREATE INDEX IF NOT EXISTS idx_activity_logs_actor ON activity_logs(actor_id, actor_type);
CREATE INDEX IF NOT EXISTS idx_activity_logs_action ON activity_logs(action);
CREATE INDEX IF NOT EXISTS idx_activity_logs_category ON activity_logs(action_category);
CREATE INDEX IF NOT EXISTS idx_activity_logs_target ON activity_logs(target_type, target_id);
CREATE INDEX IF NOT EXISTS idx_activity_logs_created ON activity_logs(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_activity_logs_branch_created ON activity_logs(branch_id, created_at DESC);

-- =====================
-- ANNOUNCEMENTS TABLE
-- =====================
CREATE TABLE IF NOT EXISTS announcements (
  id SERIAL PRIMARY KEY,
  branch_id INTEGER,

  title VARCHAR(255) NOT NULL,
  content TEXT NOT NULL,
  type VARCHAR(50) DEFAULT 'general',
  priority VARCHAR(20) DEFAULT 'normal',

  -- Targeting
  target_audience VARCHAR(50) DEFAULT 'all',
  target_user_ids INTEGER[],

  -- Display settings
  start_date TIMESTAMP DEFAULT NOW(),
  end_date TIMESTAMP,
  is_pinned BOOLEAN DEFAULT FALSE,
  display_on_dashboard BOOLEAN DEFAULT TRUE,
  display_on_mobile BOOLEAN DEFAULT TRUE,

  -- Attachments
  attachments JSONB,

  -- Audit
  created_by INTEGER NOT NULL,
  is_active BOOLEAN DEFAULT TRUE,
  is_deleted BOOLEAN DEFAULT FALSE,
  deleted_at TIMESTAMP,
  deleted_by INTEGER,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Announcements indexes
CREATE INDEX IF NOT EXISTS idx_announcements_branch ON announcements(branch_id);
CREATE INDEX IF NOT EXISTS idx_announcements_active ON announcements(is_active, start_date, end_date);
CREATE INDEX IF NOT EXISTS idx_announcements_pinned ON announcements(is_pinned, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_announcements_type ON announcements(type);
CREATE INDEX IF NOT EXISTS idx_announcements_not_deleted ON announcements(is_deleted) WHERE is_deleted = FALSE;
