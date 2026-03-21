/* ======================================================================
   TENANT INITIAL SETUP - Consolidated Migration
   Contains ALL tenant table creation, columns, constraints, and indexes.
   Runner sets search_path so NO schema prefix is needed on table names.
   ====================================================================== */


/* ============ CREATE TABLES ============ */

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
  referred_by INTEGER,
  referral_code VARCHAR(20) UNIQUE,
  lead_source VARCHAR(50),
  occupation VARCHAR(100),
  blood_group VARCHAR(10),
  medical_conditions TEXT,
  fitness_goal VARCHAR(50),
  preferred_time_slot VARCHAR(20),
  nationality VARCHAR(50),
  id_type VARCHAR(30),
  id_number VARCHAR(50),
  manager_permissions JSONB,
  unlocked_sidebar_items JSONB,
  pinned_sidebar_items JSONB,
  is_deleted BOOLEAN DEFAULT FALSE,
  deleted_at TIMESTAMP,
  deleted_by INTEGER,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

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
  max_freeze_days INTEGER DEFAULT 0,
  includes_pt_sessions INTEGER DEFAULT 0,
  access_hours VARCHAR(50) DEFAULT 'all_day',
  is_deleted BOOLEAN DEFAULT FALSE,
  deleted_at TIMESTAMP,
  deleted_by INTEGER,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(branch_id, code)
);

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

CREATE TABLE IF NOT EXISTS plan_offer_xref (
  id SERIAL PRIMARY KEY,
  branch_id INTEGER,
  plan_id INTEGER NOT NULL REFERENCES plans(id) ON DELETE CASCADE,
  offer_id INTEGER NOT NULL REFERENCES offers(id) ON DELETE CASCADE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(plan_id, offer_id)
);

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
  cancellation_reason_code VARCHAR(50),
  notes TEXT,
  created_by INTEGER,
  is_active BOOLEAN DEFAULT TRUE,
  auto_renew BOOLEAN DEFAULT FALSE,
  freeze_start_date TIMESTAMP,
  freeze_end_date TIMESTAMP,
  freeze_reason TEXT,
  total_freeze_days INTEGER DEFAULT 0,
  is_deleted BOOLEAN DEFAULT FALSE,
  deleted_at TIMESTAMP,
  deleted_by INTEGER,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

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

CREATE TABLE IF NOT EXISTS membership_facilities (
  id SERIAL PRIMARY KEY,
  membership_id INTEGER NOT NULL REFERENCES memberships(id) ON DELETE CASCADE,
  facility_id INTEGER NOT NULL REFERENCES facilities(id) ON DELETE CASCADE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(membership_id, facility_id)
);

CREATE TABLE IF NOT EXISTS membership_amenities (
  id SERIAL PRIMARY KEY,
  membership_id INTEGER NOT NULL REFERENCES memberships(id) ON DELETE CASCADE,
  amenity_id INTEGER NOT NULL REFERENCES amenities(id) ON DELETE CASCADE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(membership_id, amenity_id)
);

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
  is_deleted BOOLEAN DEFAULT FALSE,
  deleted_at TIMESTAMP,
  deleted_by INTEGER,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

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
  is_deleted BOOLEAN DEFAULT FALSE,
  deleted_at TIMESTAMP,
  deleted_by INTEGER,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS notifications (
  id SERIAL PRIMARY KEY,
  branch_id INTEGER,
  user_id INTEGER NOT NULL,
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
  created_by INTEGER,
  is_deleted BOOLEAN DEFAULT FALSE,
  deleted_at TIMESTAMP,
  deleted_by INTEGER
);

CREATE TABLE IF NOT EXISTS member_notes (
  id SERIAL PRIMARY KEY,
  branch_id INTEGER,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  note_type VARCHAR(30) NOT NULL DEFAULT 'general',
  content TEXT NOT NULL,
  is_pinned BOOLEAN DEFAULT FALSE,
  visibility VARCHAR(20) DEFAULT 'all',
  created_by INTEGER NOT NULL,
  is_deleted BOOLEAN DEFAULT FALSE,
  deleted_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS membership_freezes (
  id SERIAL PRIMARY KEY,
  branch_id INTEGER,
  membership_id INTEGER NOT NULL REFERENCES memberships(id) ON DELETE CASCADE,
  start_date TIMESTAMP NOT NULL,
  end_date TIMESTAMP NOT NULL,
  reason TEXT,
  approved_by INTEGER,
  status VARCHAR(20) DEFAULT 'active',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS cancellation_reasons (
  id SERIAL PRIMARY KEY,
  code VARCHAR(50) NOT NULL UNIQUE,
  label VARCHAR(100) NOT NULL,
  display_order INTEGER DEFAULT 0,
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS user_branch_xref (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  branch_id INTEGER NOT NULL,
  is_primary BOOLEAN DEFAULT FALSE,
  is_active BOOLEAN DEFAULT TRUE,
  assigned_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(user_id, branch_id)
);

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
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS lead_sources (
  id SERIAL PRIMARY KEY,
  code VARCHAR(50) NOT NULL UNIQUE,
  name VARCHAR(100) NOT NULL,
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS leads (
  id SERIAL PRIMARY KEY,
  branch_id INTEGER,
  name VARCHAR(100) NOT NULL,
  email VARCHAR(255),
  phone VARCHAR(30),
  lead_source VARCHAR(50),
  pipeline_stage VARCHAR(30) NOT NULL DEFAULT 'new',
  assigned_to INTEGER,
  score VARCHAR(10) DEFAULT 'warm',
  inquiry_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  expected_close_date DATE,
  deal_value NUMERIC(10,2),
  win_loss_reason TEXT,
  notes TEXT,
  converted_user_id INTEGER,
  stage_entered_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  is_deleted BOOLEAN DEFAULT FALSE,
  deleted_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS lead_activities (
  id SERIAL PRIMARY KEY,
  lead_id INTEGER NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
  type VARCHAR(30) NOT NULL,
  notes TEXT,
  scheduled_at TIMESTAMP,
  completed_at TIMESTAMP,
  performed_by INTEGER NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS referrals (
  id SERIAL PRIMARY KEY,
  branch_id INTEGER,
  referrer_id INTEGER NOT NULL,
  referred_id INTEGER,
  referral_code VARCHAR(20) NOT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'pending',
  reward_type VARCHAR(20),
  reward_amount NUMERIC(10,2),
  converted_at TIMESTAMP,
  rewarded_at TIMESTAMP,
  notes TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS progress_photos (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL,
  photo_url TEXT NOT NULL,
  thumbnail_url TEXT,
  category VARCHAR(20) NOT NULL DEFAULT 'other',
  taken_at DATE DEFAULT CURRENT_DATE,
  notes TEXT,
  body_metrics_id INTEGER,
  uploaded_by INTEGER NOT NULL,
  visibility VARCHAR(20) DEFAULT 'all',
  file_size INTEGER,
  is_deleted BOOLEAN DEFAULT FALSE,
  deleted_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS lead_stage_history (
  id SERIAL PRIMARY KEY,
  lead_id INTEGER NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
  from_stage VARCHAR(30),
  to_stage VARCHAR(30) NOT NULL,
  changed_by INTEGER,
  changed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS class_types (
  id SERIAL PRIMARY KEY,
  branch_id INTEGER,
  name VARCHAR(100) NOT NULL,
  description TEXT,
  category VARCHAR(50),
  default_duration INTEGER NOT NULL DEFAULT 60,
  default_capacity INTEGER NOT NULL DEFAULT 20,
  color VARCHAR(20),
  icon VARCHAR(50),
  is_active BOOLEAN DEFAULT TRUE,
  is_deleted BOOLEAN DEFAULT FALSE,
  deleted_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS class_schedules (
  id SERIAL PRIMARY KEY,
  class_type_id INTEGER NOT NULL REFERENCES class_types(id) ON DELETE CASCADE,
  branch_id INTEGER,
  instructor_id INTEGER,
  room VARCHAR(100),
  day_of_week INTEGER NOT NULL,
  start_time VARCHAR(10) NOT NULL,
  end_time VARCHAR(10) NOT NULL,
  capacity INTEGER NOT NULL DEFAULT 20,
  is_recurring BOOLEAN DEFAULT TRUE,
  start_date DATE,
  end_date DATE,
  is_active BOOLEAN DEFAULT TRUE,
  is_deleted BOOLEAN DEFAULT FALSE,
  deleted_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS class_sessions (
  id SERIAL PRIMARY KEY,
  schedule_id INTEGER NOT NULL REFERENCES class_schedules(id) ON DELETE CASCADE,
  branch_id INTEGER,
  date DATE NOT NULL,
  instructor_id INTEGER,
  status VARCHAR(20) NOT NULL DEFAULT 'scheduled',
  actual_capacity INTEGER,
  notes TEXT,
  cancelled_reason TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS class_bookings (
  id SERIAL PRIMARY KEY,
  session_id INTEGER NOT NULL REFERENCES class_sessions(id) ON DELETE CASCADE,
  user_id INTEGER NOT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'booked',
  booked_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  cancelled_at TIMESTAMP,
  cancel_reason TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS services (
  id SERIAL PRIMARY KEY,
  branch_id INTEGER,
  name VARCHAR(200) NOT NULL,
  description TEXT,
  duration_minutes INTEGER NOT NULL DEFAULT 60,
  price NUMERIC(10,2) NOT NULL DEFAULT 0,
  currency VARCHAR(10) DEFAULT 'INR',
  max_participants INTEGER DEFAULT 1,
  category VARCHAR(50),
  buffer_minutes INTEGER DEFAULT 0,
  is_active BOOLEAN DEFAULT TRUE,
  is_deleted BOOLEAN DEFAULT FALSE,
  deleted_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS trainer_availability (
  id SERIAL PRIMARY KEY,
  trainer_id INTEGER NOT NULL,
  branch_id INTEGER,
  day_of_week INTEGER NOT NULL,
  start_time VARCHAR(10) NOT NULL,
  end_time VARCHAR(10) NOT NULL,
  is_available BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS appointments (
  id SERIAL PRIMARY KEY,
  service_id INTEGER REFERENCES services(id),
  trainer_id INTEGER NOT NULL,
  user_id INTEGER NOT NULL,
  branch_id INTEGER,
  start_time TIMESTAMP NOT NULL,
  end_time TIMESTAMP NOT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'booked',
  notes TEXT,
  cancelled_reason TEXT,
  cancelled_at TIMESTAMP,
  created_by INTEGER,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS session_packages (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL,
  service_id INTEGER REFERENCES services(id),
  branch_id INTEGER,
  total_sessions INTEGER NOT NULL,
  used_sessions INTEGER NOT NULL DEFAULT 0,
  remaining_sessions INTEGER NOT NULL,
  purchased_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  expires_at TIMESTAMP,
  status VARCHAR(20) NOT NULL DEFAULT 'active',
  payment_id INTEGER,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS guest_visits (
  id SERIAL PRIMARY KEY,
  branch_id INTEGER,
  guest_name VARCHAR(200) NOT NULL,
  guest_phone VARCHAR(30),
  guest_email VARCHAR(255),
  brought_by INTEGER,
  visit_date DATE NOT NULL DEFAULT CURRENT_DATE,
  day_pass_amount NUMERIC(10,2) DEFAULT 0,
  payment_method VARCHAR(30),
  converted_to_member BOOLEAN DEFAULT FALSE,
  notes TEXT,
  checked_in_by INTEGER,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS equipment (
  id SERIAL PRIMARY KEY,
  branch_id INTEGER,
  name VARCHAR(200) NOT NULL,
  brand VARCHAR(100),
  model VARCHAR(100),
  serial_number VARCHAR(100),
  purchase_date DATE,
  purchase_cost DECIMAL(10, 2),
  warranty_expiry DATE,
  status VARCHAR(30) NOT NULL DEFAULT 'operational',
  location VARCHAR(200),
  notes TEXT,
  is_deleted BOOLEAN DEFAULT FALSE,
  deleted_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS equipment_maintenance (
  id SERIAL PRIMARY KEY,
  equipment_id INTEGER NOT NULL REFERENCES equipment(id) ON DELETE CASCADE,
  branch_id INTEGER,
  type VARCHAR(30) NOT NULL DEFAULT 'preventive',
  description TEXT NOT NULL,
  scheduled_date DATE NOT NULL,
  completed_date DATE,
  performed_by INTEGER,
  cost DECIMAL(10, 2),
  notes TEXT,
  status VARCHAR(30) NOT NULL DEFAULT 'scheduled',
  is_deleted BOOLEAN DEFAULT FALSE,
  deleted_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS product_categories (
  id SERIAL PRIMARY KEY,
  branch_id INTEGER,
  name VARCHAR(200) NOT NULL,
  description TEXT,
  display_order INTEGER DEFAULT 0,
  is_deleted BOOLEAN DEFAULT FALSE,
  deleted_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS products (
  id SERIAL PRIMARY KEY,
  branch_id INTEGER,
  category_id INTEGER REFERENCES product_categories(id) ON DELETE SET NULL,
  name VARCHAR(200) NOT NULL,
  sku VARCHAR(50),
  barcode VARCHAR(100),
  description TEXT,
  price DECIMAL(10, 2) NOT NULL,
  cost_price DECIMAL(10, 2),
  tax_rate DECIMAL(5, 2) DEFAULT 0,
  stock_quantity INTEGER NOT NULL DEFAULT 0,
  low_stock_threshold INTEGER DEFAULT 5,
  is_active BOOLEAN DEFAULT TRUE,
  is_deleted BOOLEAN DEFAULT FALSE,
  deleted_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS product_sales (
  id SERIAL PRIMARY KEY,
  branch_id INTEGER,
  product_id INTEGER NOT NULL REFERENCES products(id) ON DELETE RESTRICT,
  user_id INTEGER,
  quantity INTEGER NOT NULL DEFAULT 1,
  unit_price DECIMAL(10, 2) NOT NULL,
  tax_amount DECIMAL(10, 2) DEFAULT 0,
  total_amount DECIMAL(10, 2) NOT NULL,
  payment_method VARCHAR(50) NOT NULL,
  payment_id INTEGER,
  sold_by INTEGER NOT NULL,
  sold_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  notes TEXT,
  is_deleted BOOLEAN DEFAULT FALSE,
  deleted_at TIMESTAMP,
  deleted_by INTEGER,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS product_stock_movements (
  id SERIAL PRIMARY KEY,
  product_id INTEGER NOT NULL REFERENCES products(id),
  branch_id INTEGER,
  movement_type VARCHAR(50) NOT NULL,
  quantity INTEGER NOT NULL,
  stock_before INTEGER NOT NULL,
  stock_after INTEGER NOT NULL,
  reference_id INTEGER,
  reason TEXT,
  performed_by INTEGER NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS stock_takes (
  id SERIAL PRIMARY KEY,
  branch_id INTEGER,
  status VARCHAR(20) DEFAULT 'in_progress',
  started_by INTEGER NOT NULL,
  completed_by INTEGER,
  started_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  completed_at TIMESTAMP,
  notes TEXT,
  total_products INTEGER DEFAULT 0,
  total_discrepancies INTEGER DEFAULT 0,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS stock_take_items (
  id SERIAL PRIMARY KEY,
  stock_take_id INTEGER NOT NULL REFERENCES stock_takes(id),
  product_id INTEGER NOT NULL,
  product_name VARCHAR(255),
  system_quantity INTEGER NOT NULL,
  counted_quantity INTEGER,
  discrepancy INTEGER,
  adjustment_applied BOOLEAN DEFAULT FALSE,
  notes TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS custom_fields (
  id SERIAL PRIMARY KEY,
  branch_id INTEGER,
  entity_type VARCHAR(30) NOT NULL DEFAULT 'user',
  name VARCHAR(100) NOT NULL,
  label VARCHAR(200) NOT NULL,
  field_type VARCHAR(30) NOT NULL,
  options JSONB,
  default_value TEXT,
  is_required BOOLEAN DEFAULT FALSE,
  is_active BOOLEAN DEFAULT TRUE,
  visibility VARCHAR(20) DEFAULT 'all',
  display_order INTEGER DEFAULT 0,
  validation_rules JSONB,
  is_deleted BOOLEAN DEFAULT FALSE,
  deleted_at TIMESTAMP,
  created_by INTEGER NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS custom_field_values (
  id SERIAL PRIMARY KEY,
  custom_field_id INTEGER NOT NULL REFERENCES custom_fields(id) ON DELETE CASCADE,
  entity_id INTEGER NOT NULL,
  value TEXT,
  file_url TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(custom_field_id, entity_id)
);

CREATE TABLE IF NOT EXISTS surveys (
  id SERIAL PRIMARY KEY,
  branch_id INTEGER,
  title VARCHAR(200) NOT NULL,
  description TEXT,
  type VARCHAR(30) NOT NULL DEFAULT 'custom',
  status VARCHAR(20) NOT NULL DEFAULT 'draft',
  is_anonymous BOOLEAN DEFAULT FALSE,
  trigger_type VARCHAR(30),
  trigger_config JSONB,
  start_date TIMESTAMP,
  end_date TIMESTAMP,
  created_by INTEGER NOT NULL,
  is_deleted BOOLEAN DEFAULT FALSE,
  deleted_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS survey_questions (
  id SERIAL PRIMARY KEY,
  survey_id INTEGER NOT NULL REFERENCES surveys(id) ON DELETE CASCADE,
  question_text TEXT NOT NULL,
  question_type VARCHAR(30) NOT NULL,
  options JSONB,
  is_required BOOLEAN DEFAULT TRUE,
  display_order INTEGER DEFAULT 0,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS survey_responses (
  id SERIAL PRIMARY KEY,
  survey_id INTEGER NOT NULL REFERENCES surveys(id) ON DELETE CASCADE,
  user_id INTEGER,
  submitted_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS survey_answers (
  id SERIAL PRIMARY KEY,
  response_id INTEGER NOT NULL REFERENCES survey_responses(id) ON DELETE CASCADE,
  question_id INTEGER NOT NULL REFERENCES survey_questions(id) ON DELETE CASCADE,
  answer_text TEXT,
  answer_numeric NUMERIC(5,2),
  answer_choices JSONB,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS loyalty_config (
  id SERIAL PRIMARY KEY,
  branch_id INTEGER,
  is_enabled BOOLEAN DEFAULT TRUE,
  points_per_visit INTEGER DEFAULT 10,
  points_per_referral INTEGER DEFAULT 100,
  points_per_purchase_unit NUMERIC(5,2) DEFAULT 1,
  points_per_class_booking INTEGER DEFAULT 5,
  point_expiry_days INTEGER DEFAULT 365,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS loyalty_tiers (
  id SERIAL PRIMARY KEY,
  branch_id INTEGER,
  name VARCHAR(50) NOT NULL,
  min_points INTEGER NOT NULL DEFAULT 0,
  multiplier NUMERIC(3,2) DEFAULT 1.00,
  benefits JSONB,
  icon VARCHAR(100),
  color VARCHAR(20),
  display_order INTEGER DEFAULT 0,
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS loyalty_points (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL UNIQUE,
  total_earned INTEGER NOT NULL DEFAULT 0,
  total_redeemed INTEGER NOT NULL DEFAULT 0,
  current_balance INTEGER NOT NULL DEFAULT 0,
  tier_id INTEGER REFERENCES loyalty_tiers(id) ON DELETE SET NULL,
  tier_updated_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS loyalty_transactions (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL,
  type VARCHAR(10) NOT NULL,
  points INTEGER NOT NULL,
  balance_after INTEGER NOT NULL,
  source VARCHAR(30) NOT NULL,
  reference_type VARCHAR(30),
  reference_id INTEGER,
  description TEXT,
  expires_at TIMESTAMP,
  created_by INTEGER,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS loyalty_rewards (
  id SERIAL PRIMARY KEY,
  branch_id INTEGER,
  name VARCHAR(200) NOT NULL,
  description TEXT,
  points_cost INTEGER NOT NULL,
  reward_type VARCHAR(30) NOT NULL,
  reward_value JSONB,
  stock INTEGER,
  max_per_user INTEGER,
  is_active BOOLEAN DEFAULT TRUE,
  is_deleted BOOLEAN DEFAULT FALSE,
  deleted_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

/* Additional history tables (from migration 0016) */

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


/* ============ ALTER TABLE ADD COLUMN (conditional) ============ */
/* Note: The consolidated CREATE TABLE statements above already include all columns.
   These DO $$ blocks are kept for safety in case the migration runs against
   an existing schema that was partially migrated. */

/* 0002 - role column */
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = current_schema() AND table_name = 'users' AND column_name = 'role'
  ) THEN
    ALTER TABLE users ADD COLUMN role VARCHAR(50) NOT NULL DEFAULT 'client';
  END IF;
END $$;

/* 0003 - branch_id columns */
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = current_schema() AND table_name = 'users' AND column_name = 'branch_id'
  ) THEN
    ALTER TABLE users ADD COLUMN branch_id INTEGER;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = current_schema() AND table_name = 'plans' AND column_name = 'branch_id'
  ) THEN
    ALTER TABLE plans ADD COLUMN branch_id INTEGER;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = current_schema() AND table_name = 'offers' AND column_name = 'branch_id'
  ) THEN
    ALTER TABLE offers ADD COLUMN branch_id INTEGER;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = current_schema() AND table_name = 'memberships' AND column_name = 'branch_id'
  ) THEN
    ALTER TABLE memberships ADD COLUMN branch_id INTEGER;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = current_schema() AND table_name = 'membership_history' AND column_name = 'branch_id'
  ) THEN
    ALTER TABLE membership_history ADD COLUMN branch_id INTEGER;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = current_schema() AND table_name = 'attendance' AND column_name = 'branch_id'
  ) THEN
    ALTER TABLE attendance ADD COLUMN branch_id INTEGER;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = current_schema() AND table_name = 'attendance_history' AND column_name = 'branch_id'
  ) THEN
    ALTER TABLE attendance_history ADD COLUMN branch_id INTEGER;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = current_schema() AND table_name = 'body_metrics' AND column_name = 'branch_id'
  ) THEN
    ALTER TABLE body_metrics ADD COLUMN branch_id INTEGER;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = current_schema() AND table_name = 'body_metrics_history' AND column_name = 'branch_id'
  ) THEN
    ALTER TABLE body_metrics_history ADD COLUMN branch_id INTEGER;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = current_schema() AND table_name = 'trainer_client_xref' AND column_name = 'branch_id'
  ) THEN
    ALTER TABLE trainer_client_xref ADD COLUMN branch_id INTEGER;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = current_schema() AND table_name = 'plan_offer_xref' AND column_name = 'branch_id'
  ) THEN
    ALTER TABLE plan_offer_xref ADD COLUMN branch_id INTEGER;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = current_schema() AND table_name = 'staff_salaries' AND column_name = 'branch_id'
  ) THEN
    ALTER TABLE staff_salaries ADD COLUMN branch_id INTEGER;
  END IF;
END $$;

/* 0010 - status_id column */
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = current_schema() AND table_name = 'users' AND column_name = 'status_id'
  ) THEN
    ALTER TABLE users ADD COLUMN status_id INTEGER;
  END IF;
END $$;

/* 0011 - soft delete columns */
DO $$
DECLARE
  t TEXT;
  c TEXT;
  d TEXT;
BEGIN
  FOR t, c, d IN
    SELECT * FROM (VALUES
      ('users','is_deleted','BOOLEAN DEFAULT FALSE'),
      ('users','deleted_at','TIMESTAMP'),
      ('users','deleted_by','INTEGER'),
      ('plans','is_deleted','BOOLEAN DEFAULT FALSE'),
      ('plans','deleted_at','TIMESTAMP'),
      ('plans','deleted_by','INTEGER'),
      ('memberships','is_deleted','BOOLEAN DEFAULT FALSE'),
      ('memberships','deleted_at','TIMESTAMP'),
      ('memberships','deleted_by','INTEGER'),
      ('offers','is_deleted','BOOLEAN DEFAULT FALSE'),
      ('offers','deleted_at','TIMESTAMP'),
      ('offers','deleted_by','INTEGER'),
      ('attendance','is_deleted','BOOLEAN DEFAULT FALSE'),
      ('attendance','deleted_at','TIMESTAMP'),
      ('attendance','deleted_by','INTEGER'),
      ('attendance_history','is_deleted','BOOLEAN DEFAULT FALSE'),
      ('attendance_history','deleted_at','TIMESTAMP'),
      ('attendance_history','deleted_by','INTEGER'),
      ('staff_salaries','is_deleted','BOOLEAN DEFAULT FALSE'),
      ('staff_salaries','deleted_at','TIMESTAMP'),
      ('staff_salaries','deleted_by','INTEGER'),
      ('announcements','is_deleted','BOOLEAN DEFAULT FALSE'),
      ('announcements','deleted_at','TIMESTAMP'),
      ('announcements','deleted_by','INTEGER'),
      ('workout_plans','is_deleted','BOOLEAN DEFAULT FALSE'),
      ('workout_plans','deleted_at','TIMESTAMP'),
      ('workout_plans','deleted_by','INTEGER'),
      ('workout_assignments','is_deleted','BOOLEAN DEFAULT FALSE'),
      ('workout_assignments','deleted_at','TIMESTAMP'),
      ('workout_assignments','deleted_by','INTEGER'),
      ('notifications','is_deleted','BOOLEAN DEFAULT FALSE'),
      ('notifications','deleted_at','TIMESTAMP'),
      ('notifications','deleted_by','INTEGER')
    ) AS v(tbl, col, def)
  LOOP
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = current_schema() AND table_name = t AND column_name = c
    ) THEN
      EXECUTE format('ALTER TABLE %I ADD COLUMN %I %s', t, c, d);
    END IF;
  END LOOP;
END $$;

/* 0012 - attendance_date columns */
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = current_schema() AND table_name = 'attendance' AND column_name = 'attendance_date'
  ) THEN
    ALTER TABLE attendance ADD COLUMN attendance_date DATE;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = current_schema() AND table_name = 'attendance_history' AND column_name = 'attendance_date'
  ) THEN
    ALTER TABLE attendance_history ADD COLUMN attendance_date DATE;
  END IF;
END $$;

/* 0022 - phase1 columns */
DO $$
DECLARE
  t TEXT;
  c TEXT;
  d TEXT;
BEGIN
  FOR t, c, d IN
    SELECT * FROM (VALUES
      ('users','referred_by','INTEGER'),
      ('users','referral_code','VARCHAR(20)'),
      ('users','lead_source','VARCHAR(50)'),
      ('users','occupation','VARCHAR(100)'),
      ('users','blood_group','VARCHAR(10)'),
      ('users','medical_conditions','TEXT'),
      ('users','fitness_goal','VARCHAR(50)'),
      ('users','preferred_time_slot','VARCHAR(20)'),
      ('users','nationality','VARCHAR(50)'),
      ('users','id_type','VARCHAR(30)'),
      ('users','id_number','VARCHAR(50)'),
      ('memberships','auto_renew','BOOLEAN DEFAULT FALSE'),
      ('memberships','freeze_start_date','TIMESTAMP'),
      ('memberships','freeze_end_date','TIMESTAMP'),
      ('memberships','freeze_reason','TEXT'),
      ('memberships','total_freeze_days','INTEGER DEFAULT 0'),
      ('memberships','cancellation_reason_code','VARCHAR(50)'),
      ('plans','max_freeze_days','INTEGER DEFAULT 0'),
      ('plans','includes_pt_sessions','INTEGER DEFAULT 0'),
      ('plans','access_hours','VARCHAR(50) DEFAULT ''all_day''')
    ) AS v(tbl, col, def)
  LOOP
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = current_schema() AND table_name = t AND column_name = c
    ) THEN
      EXECUTE format('ALTER TABLE %I ADD COLUMN %I %s', t, c, d);
    END IF;
  END LOOP;
END $$;

/* 0027 - phase2 gap columns */
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = current_schema() AND table_name = 'leads' AND column_name = 'stage_entered_at'
  ) THEN
    ALTER TABLE leads ADD COLUMN stage_entered_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = current_schema() AND table_name = 'progress_photos' AND column_name = 'file_size'
  ) THEN
    ALTER TABLE progress_photos ADD COLUMN file_size INTEGER;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = current_schema() AND table_name = 'progress_photos' AND column_name = 'updated_at'
  ) THEN
    ALTER TABLE progress_photos ADD COLUMN updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = current_schema() AND table_name = 'services' AND column_name = 'buffer_minutes'
  ) THEN
    ALTER TABLE services ADD COLUMN buffer_minutes INTEGER DEFAULT 0;
  END IF;
END $$;

/* 0034 - sidebar columns */
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = current_schema() AND table_name = 'users' AND column_name = 'unlocked_sidebar_items'
  ) THEN
    ALTER TABLE users ADD COLUMN unlocked_sidebar_items JSONB;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = current_schema() AND table_name = 'users' AND column_name = 'pinned_sidebar_items'
  ) THEN
    ALTER TABLE users ADD COLUMN pinned_sidebar_items JSONB;
  END IF;
END $$;

/* 0035 - manager_permissions column */
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = current_schema() AND table_name = 'users' AND column_name = 'manager_permissions'
  ) THEN
    ALTER TABLE users ADD COLUMN manager_permissions JSONB;
  END IF;
END $$;


/* ============ CONSTRAINT ADDITIONS ============ */

/* 0013 - status CHECK constraints */
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'chk_users_status'
  ) THEN
    ALTER TABLE users
    ADD CONSTRAINT chk_users_status
    CHECK (status IN ('onboarding', 'confirm', 'active', 'expired', 'inactive', 'rejected', 'archive'));
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'chk_memberships_status'
  ) THEN
    ALTER TABLE memberships
    ADD CONSTRAINT chk_memberships_status
    CHECK (status IN ('pending', 'active', 'expired', 'cancelled', 'suspended'));
  END IF;
END $$;

/* 0021 - payment CHECK constraints */
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'chk_payments_reference_table'
  ) THEN
    ALTER TABLE payments
    ADD CONSTRAINT chk_payments_reference_table
    CHECK (reference_table IN ('memberships', 'staff_salaries', 'plans', 'offers', 'product_sales'));
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'chk_payments_payer_type'
  ) THEN
    ALTER TABLE payments
    ADD CONSTRAINT chk_payments_payer_type
    CHECK (payer_type IN ('client', 'gym', 'staff', 'admin', 'guest'));
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'chk_payments_payee_type'
  ) THEN
    ALTER TABLE payments
    ADD CONSTRAINT chk_payments_payee_type
    CHECK (payee_type IS NULL OR payee_type IN ('client', 'gym', 'staff', 'admin', 'guest'));
  END IF;
END $$;

/* 0020 - FK constraints */
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'fk_user_branch_xref_user'
  ) THEN
    ALTER TABLE user_branch_xref
    ADD CONSTRAINT fk_user_branch_xref_user
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE;
  END IF;
END $$;


/* ============ INDEXES ============ */

/* -- users -- */
CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
CREATE INDEX IF NOT EXISTS idx_users_role ON users(role);
CREATE INDEX IF NOT EXISTS idx_users_status ON users(status);
CREATE INDEX IF NOT EXISTS idx_users_status_id ON users(status_id);
CREATE INDEX IF NOT EXISTS idx_users_attendance_code ON users(attendance_code);
CREATE INDEX IF NOT EXISTS idx_users_branch ON users(branch_id);
CREATE INDEX IF NOT EXISTS idx_users_branch_role_active ON users(branch_id, role, status) WHERE is_deleted = FALSE OR is_deleted IS NULL;
CREATE UNIQUE INDEX IF NOT EXISTS idx_users_referral_code ON users(referral_code) WHERE referral_code IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_users_lead_source ON users(lead_source) WHERE lead_source IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_users_fitness_goal ON users(fitness_goal) WHERE fitness_goal IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_users_referred_by ON users(referred_by) WHERE referred_by IS NOT NULL;

/* -- plans -- */
CREATE INDEX IF NOT EXISTS idx_plans_branch ON plans(branch_id);

/* -- offers -- */
CREATE INDEX IF NOT EXISTS idx_offers_branch ON offers(branch_id);

/* -- plan_offer_xref -- */
CREATE INDEX IF NOT EXISTS idx_plan_offer_xref_branch ON plan_offer_xref(branch_id);

/* -- memberships -- */
CREATE INDEX IF NOT EXISTS idx_memberships_user ON memberships(user_id);
CREATE INDEX IF NOT EXISTS idx_memberships_status ON memberships(status);
CREATE INDEX IF NOT EXISTS idx_memberships_dates ON memberships(start_date, end_date);
CREATE INDEX IF NOT EXISTS idx_memberships_branch ON memberships(branch_id);
CREATE INDEX IF NOT EXISTS idx_memberships_plan ON memberships(plan_id);
CREATE INDEX IF NOT EXISTS idx_memberships_offer ON memberships(offer_id);
CREATE INDEX IF NOT EXISTS idx_memberships_created_by ON memberships(created_by);
CREATE INDEX IF NOT EXISTS idx_memberships_branch_status_end ON memberships(branch_id, status, end_date);
CREATE INDEX IF NOT EXISTS idx_memberships_user_active ON memberships(user_id, status) WHERE status = 'active';

/* -- membership_history -- */
CREATE INDEX IF NOT EXISTS idx_membership_history_branch ON membership_history(branch_id);

/* -- attendance -- */
CREATE INDEX IF NOT EXISTS idx_attendance_user ON attendance(user_id);
CREATE INDEX IF NOT EXISTS idx_attendance_date ON attendance(date);
CREATE INDEX IF NOT EXISTS idx_attendance_marked_by ON attendance(marked_by);
CREATE INDEX IF NOT EXISTS idx_attendance_branch ON attendance(branch_id);
CREATE INDEX IF NOT EXISTS idx_attendance_membership ON attendance(membership_id);
CREATE INDEX IF NOT EXISTS idx_attendance_branch_date_composite ON attendance(branch_id, date);
CREATE INDEX IF NOT EXISTS idx_attendance_attendance_date ON attendance(attendance_date);

/* -- attendance_history -- */
CREATE INDEX IF NOT EXISTS idx_attendance_history_user ON attendance_history(user_id);
CREATE INDEX IF NOT EXISTS idx_attendance_history_date ON attendance_history(date);
CREATE INDEX IF NOT EXISTS idx_attendance_history_branch ON attendance_history(branch_id);
CREATE INDEX IF NOT EXISTS idx_attendance_history_membership ON attendance_history(membership_id);
CREATE INDEX IF NOT EXISTS idx_attendance_history_marked_by ON attendance_history(marked_by);
CREATE INDEX IF NOT EXISTS idx_attendance_history_checked_out_by ON attendance_history(checked_out_by);
CREATE INDEX IF NOT EXISTS idx_attendance_history_date_col ON attendance_history(attendance_date);

/* -- body_metrics -- */
CREATE INDEX IF NOT EXISTS idx_body_metrics_branch ON body_metrics(branch_id);

/* -- body_metrics_history -- */
CREATE INDEX IF NOT EXISTS idx_body_metrics_history_branch ON body_metrics_history(branch_id);
CREATE INDEX IF NOT EXISTS idx_body_metrics_history_user ON body_metrics_history(user_id);

/* -- trainer_client_xref -- */
CREATE INDEX IF NOT EXISTS idx_trainer_client_trainer ON trainer_client_xref(trainer_id);
CREATE INDEX IF NOT EXISTS idx_trainer_client_client ON trainer_client_xref(client_id);
CREATE INDEX IF NOT EXISTS idx_trainer_client_branch ON trainer_client_xref(branch_id);

/* -- staff_salaries -- */
CREATE INDEX IF NOT EXISTS idx_staff_salaries_staff ON staff_salaries(staff_id);
CREATE INDEX IF NOT EXISTS idx_staff_salaries_status ON staff_salaries(payment_status);
CREATE INDEX IF NOT EXISTS idx_staff_salaries_period ON staff_salaries(year, month);
CREATE INDEX IF NOT EXISTS idx_staff_salaries_branch ON staff_salaries(branch_id);
CREATE INDEX IF NOT EXISTS idx_staff_salaries_paid_by ON staff_salaries(paid_by_id);
CREATE INDEX IF NOT EXISTS idx_staff_salaries_branch_status_composite ON staff_salaries(branch_id, payment_status);
CREATE INDEX IF NOT EXISTS idx_staff_salaries_period_status ON staff_salaries(year, month, payment_status);

/* -- facilities -- */
CREATE INDEX IF NOT EXISTS idx_facilities_branch ON facilities(branch_id);
CREATE INDEX IF NOT EXISTS idx_facilities_code ON facilities(code);
CREATE INDEX IF NOT EXISTS idx_facilities_active ON facilities(is_active);

/* -- amenities -- */
CREATE INDEX IF NOT EXISTS idx_amenities_branch ON amenities(branch_id);
CREATE INDEX IF NOT EXISTS idx_amenities_code ON amenities(code);
CREATE INDEX IF NOT EXISTS idx_amenities_active ON amenities(is_active);

/* -- membership_facilities -- */
CREATE INDEX IF NOT EXISTS idx_membership_facilities_membership ON membership_facilities(membership_id);
CREATE INDEX IF NOT EXISTS idx_membership_facilities_facility ON membership_facilities(facility_id);

/* -- membership_amenities -- */
CREATE INDEX IF NOT EXISTS idx_membership_amenities_membership ON membership_amenities(membership_id);
CREATE INDEX IF NOT EXISTS idx_membership_amenities_amenity ON membership_amenities(amenity_id);

/* -- workout_plans -- */
CREATE INDEX IF NOT EXISTS idx_workout_plans_branch ON workout_plans(branch_id);
CREATE INDEX IF NOT EXISTS idx_workout_plans_status ON workout_plans(status);
CREATE INDEX IF NOT EXISTS idx_workout_plans_type ON workout_plans(type);
CREATE INDEX IF NOT EXISTS idx_workout_plans_category ON workout_plans(category);
CREATE INDEX IF NOT EXISTS idx_workout_plans_created_by ON workout_plans(created_by);

/* -- workout_assignments -- */
CREATE INDEX IF NOT EXISTS idx_workout_assignments_branch ON workout_assignments(branch_id);
CREATE INDEX IF NOT EXISTS idx_workout_assignments_workout ON workout_assignments(workout_plan_id);
CREATE INDEX IF NOT EXISTS idx_workout_assignments_user ON workout_assignments(user_id);
CREATE INDEX IF NOT EXISTS idx_workout_assignments_status ON workout_assignments(status);
CREATE INDEX IF NOT EXISTS idx_workout_assignments_assigned_by ON workout_assignments(assigned_by);

/* -- notifications -- */
CREATE INDEX IF NOT EXISTS idx_notifications_user ON notifications(user_id);
CREATE INDEX IF NOT EXISTS idx_notifications_unread ON notifications(user_id, is_read) WHERE is_read = FALSE;
CREATE INDEX IF NOT EXISTS idx_notifications_type ON notifications(type);
CREATE INDEX IF NOT EXISTS idx_notifications_created ON notifications(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_notifications_branch ON notifications(branch_id);
CREATE INDEX IF NOT EXISTS idx_notifications_created_by ON notifications(created_by);

/* -- member_notes -- */
CREATE INDEX IF NOT EXISTS idx_member_notes_user_id ON member_notes(user_id) WHERE is_deleted = FALSE;

/* -- membership_freezes -- */
CREATE INDEX IF NOT EXISTS idx_membership_freezes_membership_id ON membership_freezes(membership_id);

/* -- user_branch_xref -- */
CREATE INDEX IF NOT EXISTS idx_user_branch_xref_user ON user_branch_xref(user_id);
CREATE INDEX IF NOT EXISTS idx_user_branch_xref_branch ON user_branch_xref(branch_id);
CREATE INDEX IF NOT EXISTS idx_user_branch_xref_active ON user_branch_xref(is_active) WHERE is_active = TRUE;

/* -- payments -- */
CREATE INDEX IF NOT EXISTS idx_payments_branch ON payments(branch_id);
CREATE INDEX IF NOT EXISTS idx_payments_type ON payments(payment_type);
CREATE INDEX IF NOT EXISTS idx_payments_ref ON payments(reference_table, reference_id);
CREATE INDEX IF NOT EXISTS idx_payments_status ON payments(status);
CREATE INDEX IF NOT EXISTS idx_payments_payer ON payments(payer_type, payer_id);
CREATE INDEX IF NOT EXISTS idx_payments_created ON payments(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_payments_processed_by ON payments(processed_by);

/* -- activity_logs -- */
CREATE INDEX IF NOT EXISTS idx_activity_logs_actor ON activity_logs(actor_id, actor_type);
CREATE INDEX IF NOT EXISTS idx_activity_logs_action ON activity_logs(action);
CREATE INDEX IF NOT EXISTS idx_activity_logs_category ON activity_logs(action_category);
CREATE INDEX IF NOT EXISTS idx_activity_logs_target ON activity_logs(target_type, target_id);
CREATE INDEX IF NOT EXISTS idx_activity_logs_created ON activity_logs(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_activity_logs_branch_created ON activity_logs(branch_id, created_at DESC);

/* -- announcements -- */
CREATE INDEX IF NOT EXISTS idx_announcements_branch ON announcements(branch_id);
CREATE INDEX IF NOT EXISTS idx_announcements_active ON announcements(is_active, start_date, end_date);
CREATE INDEX IF NOT EXISTS idx_announcements_pinned ON announcements(is_pinned, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_announcements_type ON announcements(type);
CREATE INDEX IF NOT EXISTS idx_announcements_created_by ON announcements(created_by);

/* -- leads -- */
CREATE INDEX IF NOT EXISTS idx_leads_stage ON leads(pipeline_stage) WHERE is_deleted = FALSE;
CREATE INDEX IF NOT EXISTS idx_leads_branch ON leads(branch_id) WHERE is_deleted = FALSE;
CREATE INDEX IF NOT EXISTS idx_leads_source ON leads(lead_source) WHERE is_deleted = FALSE;
CREATE INDEX IF NOT EXISTS idx_leads_assigned ON leads(assigned_to) WHERE is_deleted = FALSE;

/* -- lead_activities -- */
CREATE INDEX IF NOT EXISTS idx_lead_activities_lead ON lead_activities(lead_id);

/* -- lead_stage_history -- */
CREATE INDEX IF NOT EXISTS idx_lead_stage_history_lead ON lead_stage_history(lead_id);

/* -- referrals -- */
CREATE INDEX IF NOT EXISTS idx_referrals_referrer ON referrals(referrer_id);
CREATE INDEX IF NOT EXISTS idx_referrals_referred ON referrals(referred_id);

/* -- progress_photos -- */
CREATE INDEX IF NOT EXISTS idx_progress_photos_user ON progress_photos(user_id) WHERE is_deleted = FALSE;

/* -- class_types -- */
CREATE INDEX IF NOT EXISTS idx_class_types_branch ON class_types(branch_id) WHERE is_deleted = FALSE;

/* -- class_schedules -- */
CREATE INDEX IF NOT EXISTS idx_class_schedules_type ON class_schedules(class_type_id);
CREATE INDEX IF NOT EXISTS idx_class_schedules_branch ON class_schedules(branch_id);
CREATE INDEX IF NOT EXISTS idx_class_schedules_instructor ON class_schedules(instructor_id);
CREATE INDEX IF NOT EXISTS idx_class_schedules_day ON class_schedules(day_of_week);

/* -- class_sessions -- */
CREATE UNIQUE INDEX IF NOT EXISTS idx_class_sessions_schedule_date ON class_sessions(schedule_id, date);
CREATE INDEX IF NOT EXISTS idx_class_sessions_date ON class_sessions(date);
CREATE INDEX IF NOT EXISTS idx_class_sessions_status ON class_sessions(status);
CREATE INDEX IF NOT EXISTS idx_class_sessions_branch ON class_sessions(branch_id);

/* -- class_bookings -- */
CREATE INDEX IF NOT EXISTS idx_class_bookings_session ON class_bookings(session_id);
CREATE INDEX IF NOT EXISTS idx_class_bookings_user ON class_bookings(user_id);
CREATE INDEX IF NOT EXISTS idx_class_bookings_status ON class_bookings(status);

/* -- services -- */
CREATE INDEX IF NOT EXISTS idx_services_branch ON services(branch_id) WHERE is_deleted = FALSE;

/* -- trainer_availability -- */
CREATE INDEX IF NOT EXISTS idx_trainer_avail_trainer ON trainer_availability(trainer_id);
CREATE INDEX IF NOT EXISTS idx_trainer_avail_day ON trainer_availability(day_of_week);

/* -- appointments -- */
CREATE INDEX IF NOT EXISTS idx_appointments_trainer ON appointments(trainer_id);
CREATE INDEX IF NOT EXISTS idx_appointments_user ON appointments(user_id);
CREATE INDEX IF NOT EXISTS idx_appointments_branch ON appointments(branch_id);
CREATE INDEX IF NOT EXISTS idx_appointments_status ON appointments(status);
CREATE INDEX IF NOT EXISTS idx_appointments_time ON appointments(start_time, end_time);
CREATE INDEX IF NOT EXISTS idx_appointments_service ON appointments(service_id) WHERE service_id IS NOT NULL;

/* -- session_packages -- */
CREATE INDEX IF NOT EXISTS idx_session_pkgs_user ON session_packages(user_id);
CREATE INDEX IF NOT EXISTS idx_session_pkgs_status ON session_packages(status);
CREATE INDEX IF NOT EXISTS idx_session_pkgs_service ON session_packages(service_id) WHERE service_id IS NOT NULL;

/* -- guest_visits -- */
CREATE INDEX IF NOT EXISTS idx_guest_visits_branch ON guest_visits(branch_id);
CREATE INDEX IF NOT EXISTS idx_guest_visits_date ON guest_visits(visit_date);
CREATE INDEX IF NOT EXISTS idx_guest_visits_brought_by ON guest_visits(brought_by) WHERE brought_by IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_guest_visits_checked_in ON guest_visits(checked_in_by) WHERE checked_in_by IS NOT NULL;

/* -- equipment -- */
CREATE INDEX IF NOT EXISTS idx_equipment_branch ON equipment(branch_id) WHERE is_deleted = FALSE;
CREATE INDEX IF NOT EXISTS idx_equipment_status ON equipment(status) WHERE is_deleted = FALSE;
CREATE INDEX IF NOT EXISTS idx_equipment_serial ON equipment(serial_number) WHERE is_deleted = FALSE;

/* -- equipment_maintenance -- */
CREATE INDEX IF NOT EXISTS idx_equip_maint_equipment ON equipment_maintenance(equipment_id) WHERE is_deleted = FALSE;
CREATE INDEX IF NOT EXISTS idx_equip_maint_scheduled ON equipment_maintenance(scheduled_date) WHERE is_deleted = FALSE AND status = 'scheduled';
CREATE INDEX IF NOT EXISTS idx_equip_maint_branch ON equipment_maintenance(branch_id) WHERE is_deleted = FALSE;

/* -- product_categories -- */
CREATE INDEX IF NOT EXISTS idx_product_categories_branch ON product_categories(branch_id) WHERE is_deleted = FALSE;

/* -- products -- */
CREATE INDEX IF NOT EXISTS idx_products_branch ON products(branch_id) WHERE is_deleted = FALSE;
CREATE INDEX IF NOT EXISTS idx_products_category ON products(category_id) WHERE is_deleted = FALSE;
CREATE INDEX IF NOT EXISTS idx_products_sku ON products(sku) WHERE is_deleted = FALSE;
CREATE INDEX IF NOT EXISTS idx_products_barcode ON products(barcode) WHERE is_deleted = FALSE;
CREATE INDEX IF NOT EXISTS idx_products_active ON products(is_active) WHERE is_deleted = FALSE;
CREATE INDEX IF NOT EXISTS idx_products_low_stock ON products(stock_quantity, low_stock_threshold) WHERE is_deleted = FALSE AND is_active = TRUE;

/* -- product_sales -- */
CREATE INDEX IF NOT EXISTS idx_product_sales_branch ON product_sales(branch_id) WHERE is_deleted = FALSE;
CREATE INDEX IF NOT EXISTS idx_product_sales_product ON product_sales(product_id) WHERE is_deleted = FALSE;
CREATE INDEX IF NOT EXISTS idx_product_sales_user ON product_sales(user_id) WHERE is_deleted = FALSE;
CREATE INDEX IF NOT EXISTS idx_product_sales_sold_at ON product_sales(sold_at) WHERE is_deleted = FALSE;

/* -- product_stock_movements -- */
CREATE INDEX IF NOT EXISTS idx_stock_movements_product ON product_stock_movements(product_id);

/* -- stock_take_items -- */
CREATE INDEX IF NOT EXISTS idx_stock_take_items_stock_take ON stock_take_items(stock_take_id);
CREATE INDEX IF NOT EXISTS idx_stock_take_items_product ON stock_take_items(product_id);

/* -- custom_fields -- */
CREATE INDEX IF NOT EXISTS idx_custom_fields_entity_type ON custom_fields(entity_type) WHERE is_deleted = FALSE;
CREATE INDEX IF NOT EXISTS idx_custom_fields_branch ON custom_fields(branch_id) WHERE is_deleted = FALSE;

/* -- custom_field_values -- */
CREATE INDEX IF NOT EXISTS idx_custom_field_values_field ON custom_field_values(custom_field_id);
CREATE INDEX IF NOT EXISTS idx_custom_field_values_entity ON custom_field_values(entity_id);
CREATE INDEX IF NOT EXISTS idx_custom_field_values_composite ON custom_field_values(custom_field_id, entity_id);

/* -- surveys -- */
CREATE INDEX IF NOT EXISTS idx_surveys_branch ON surveys(branch_id) WHERE is_deleted = FALSE;
CREATE INDEX IF NOT EXISTS idx_surveys_status ON surveys(status) WHERE is_deleted = FALSE;
CREATE INDEX IF NOT EXISTS idx_surveys_type ON surveys(type) WHERE is_deleted = FALSE;

/* -- survey_questions -- */
CREATE INDEX IF NOT EXISTS idx_survey_questions_survey ON survey_questions(survey_id);

/* -- survey_responses -- */
CREATE INDEX IF NOT EXISTS idx_survey_responses_survey ON survey_responses(survey_id);
CREATE INDEX IF NOT EXISTS idx_survey_responses_user ON survey_responses(user_id);

/* -- survey_answers -- */
CREATE INDEX IF NOT EXISTS idx_survey_answers_response ON survey_answers(response_id);
CREATE INDEX IF NOT EXISTS idx_survey_answers_question ON survey_answers(question_id);

/* -- loyalty_points -- */
CREATE INDEX IF NOT EXISTS idx_loyalty_points_user ON loyalty_points(user_id);
CREATE INDEX IF NOT EXISTS idx_loyalty_points_tier ON loyalty_points(tier_id);

/* -- loyalty_transactions -- */
CREATE INDEX IF NOT EXISTS idx_loyalty_transactions_user ON loyalty_transactions(user_id);
CREATE INDEX IF NOT EXISTS idx_loyalty_transactions_type ON loyalty_transactions(type);
CREATE INDEX IF NOT EXISTS idx_loyalty_transactions_source ON loyalty_transactions(source);
CREATE INDEX IF NOT EXISTS idx_loyalty_transactions_created ON loyalty_transactions(created_at DESC);

/* -- loyalty_rewards -- */
CREATE INDEX IF NOT EXISTS idx_loyalty_rewards_branch ON loyalty_rewards(branch_id) WHERE is_deleted = FALSE;
CREATE INDEX IF NOT EXISTS idx_loyalty_rewards_active ON loyalty_rewards(is_active) WHERE is_deleted = FALSE;

/* -- loyalty_tiers -- */
CREATE INDEX IF NOT EXISTS idx_loyalty_tiers_branch ON loyalty_tiers(branch_id);
CREATE INDEX IF NOT EXISTS idx_loyalty_tiers_points ON loyalty_tiers(min_points);

/* -- user_history -- */
CREATE INDEX IF NOT EXISTS idx_user_history_user ON user_history(user_id);
CREATE INDEX IF NOT EXISTS idx_user_history_type ON user_history(change_type);
CREATE INDEX IF NOT EXISTS idx_user_history_created ON user_history(created_at DESC);

/* -- plan_history -- */
CREATE INDEX IF NOT EXISTS idx_plan_history_plan ON plan_history(plan_id);
CREATE INDEX IF NOT EXISTS idx_plan_history_created ON plan_history(created_at DESC);

/* -- salary_history -- */
CREATE INDEX IF NOT EXISTS idx_salary_history_salary ON salary_history(salary_id);
CREATE INDEX IF NOT EXISTS idx_salary_history_staff ON salary_history(staff_id);
CREATE INDEX IF NOT EXISTS idx_salary_history_created ON salary_history(created_at DESC);

/* -- soft-delete partial indexes -- */
CREATE INDEX IF NOT EXISTS idx_users_not_deleted ON users(is_deleted) WHERE is_deleted = FALSE;
CREATE INDEX IF NOT EXISTS idx_plans_not_deleted ON plans(is_deleted) WHERE is_deleted = FALSE;
CREATE INDEX IF NOT EXISTS idx_memberships_not_deleted ON memberships(is_deleted) WHERE is_deleted = FALSE;
CREATE INDEX IF NOT EXISTS idx_offers_not_deleted ON offers(is_deleted) WHERE is_deleted = FALSE;
CREATE INDEX IF NOT EXISTS idx_attendance_not_deleted ON attendance(is_deleted) WHERE is_deleted = FALSE;
CREATE INDEX IF NOT EXISTS idx_attendance_history_not_deleted ON attendance_history(is_deleted) WHERE is_deleted = FALSE;
CREATE INDEX IF NOT EXISTS idx_staff_salaries_not_deleted ON staff_salaries(is_deleted) WHERE is_deleted = FALSE;
CREATE INDEX IF NOT EXISTS idx_announcements_not_deleted ON announcements(is_deleted) WHERE is_deleted = FALSE;
CREATE INDEX IF NOT EXISTS idx_workout_plans_not_deleted ON workout_plans(is_deleted) WHERE is_deleted = FALSE;
CREATE INDEX IF NOT EXISTS idx_workout_assignments_not_deleted ON workout_assignments(is_deleted) WHERE is_deleted = FALSE;
CREATE INDEX IF NOT EXISTS idx_notifications_not_deleted ON notifications(is_deleted) WHERE is_deleted = FALSE;
