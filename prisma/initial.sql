-- Strakly Database Schema
-- Initial SQL Migration
-- Generated from Prisma schema

-- ============================================
-- LOOKUP TABLES
-- ============================================

-- LookupType table - Categories for lookup values
CREATE TABLE lookup_types (
    id SERIAL PRIMARY KEY,
    code VARCHAR(255) UNIQUE NOT NULL,
    name VARCHAR(255) NOT NULL,
    description TEXT,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Lookup table - Actual lookup values
CREATE TABLE lookups (
    id SERIAL PRIMARY KEY,
    lookup_type_id INTEGER NOT NULL,
    code VARCHAR(255) NOT NULL,
    name VARCHAR(255) NOT NULL,
    value VARCHAR(255),
    display_order INTEGER DEFAULT 0,
    is_active BOOLEAN DEFAULT true,
    metadata JSONB,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_lookups_lookup_type FOREIGN KEY (lookup_type_id) REFERENCES lookup_types(id) ON DELETE CASCADE,
    CONSTRAINT uq_lookups_type_code UNIQUE (lookup_type_id, code)
);

-- ============================================
-- GYM TABLE
-- ============================================

CREATE TABLE gyms (
    id SERIAL PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    description TEXT,
    logo VARCHAR(255),
    phone VARCHAR(50),
    email VARCHAR(255),
    website VARCHAR(255),
    address TEXT,
    city VARCHAR(100),
    state VARCHAR(100),
    zip_code VARCHAR(20),
    country VARCHAR(100) DEFAULT 'India',
    opening_time VARCHAR(10),
    closing_time VARCHAR(10),
    capacity INTEGER,
    amenities JSONB,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ============================================
-- USER TABLE
-- ============================================

CREATE TABLE users (
    id SERIAL PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    email VARCHAR(255) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    phone VARCHAR(50),
    avatar VARCHAR(255),
    bio TEXT,
    date_of_birth TIMESTAMP,
    address TEXT,
    city VARCHAR(100),
    state VARCHAR(100),
    zip_code VARCHAR(20),
    role_id INTEGER NOT NULL,
    status VARCHAR(50) DEFAULT 'active',
    gender VARCHAR(20),
    attendance_code VARCHAR(50) UNIQUE,
    gym_id INTEGER,
    join_date TIMESTAMP,
    last_login_at TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_users_role FOREIGN KEY (role_id) REFERENCES lookups(id),
    CONSTRAINT fk_users_gym FOREIGN KEY (gym_id) REFERENCES gyms(id) ON DELETE SET NULL
);

CREATE INDEX idx_users_gym_id ON users(gym_id);
CREATE INDEX idx_users_role_gym ON users(role_id, gym_id);
CREATE INDEX idx_users_status_gym ON users(status, gym_id);

-- ============================================
-- USER GYM CROSS REFERENCE TABLE
-- ============================================

CREATE TABLE user_gym_xref (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL,
    gym_id INTEGER NOT NULL,
    role VARCHAR(50) DEFAULT 'admin',
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_user_gym_xref_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE RESTRICT,
    CONSTRAINT fk_user_gym_xref_gym FOREIGN KEY (gym_id) REFERENCES gyms(id) ON DELETE RESTRICT,
    CONSTRAINT uq_user_gym_xref UNIQUE (user_id, gym_id)
);

-- ============================================
-- PERMISSION TABLES
-- ============================================

CREATE TABLE permissions (
    id SERIAL PRIMARY KEY,
    code VARCHAR(255) UNIQUE NOT NULL,
    name VARCHAR(255) NOT NULL,
    module VARCHAR(100) NOT NULL,
    description TEXT,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_permissions_module ON permissions(module);

CREATE TABLE role_permission_xref (
    id SERIAL PRIMARY KEY,
    role VARCHAR(100) NOT NULL,
    permission_id INTEGER NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_role_permission_xref_permission FOREIGN KEY (permission_id) REFERENCES permissions(id) ON DELETE CASCADE,
    CONSTRAINT uq_role_permission_xref UNIQUE (role, permission_id)
);

CREATE INDEX idx_role_permission_xref_role ON role_permission_xref(role);

-- ============================================
-- MEMBERSHIP & SUBSCRIPTION TABLES
-- ============================================

-- Plan table - Membership plans available
CREATE TABLE plans (
    id SERIAL PRIMARY KEY,
    code VARCHAR(100) UNIQUE NOT NULL,
    name VARCHAR(255) NOT NULL,
    description TEXT,
    gym_id INTEGER,
    duration_value INTEGER NOT NULL,
    duration_type VARCHAR(20) NOT NULL,
    price DECIMAL(10, 2) NOT NULL,
    currency VARCHAR(10) DEFAULT 'INR',
    features JSONB,
    display_order INTEGER DEFAULT 0,
    is_featured BOOLEAN DEFAULT false,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_plans_gym FOREIGN KEY (gym_id) REFERENCES gyms(id) ON DELETE CASCADE
);

CREATE INDEX idx_plans_gym_id ON plans(gym_id);
CREATE INDEX idx_plans_active_order ON plans(is_active, display_order);

-- Offer table - Discounts and promotions
CREATE TABLE offers (
    id SERIAL PRIMARY KEY,
    code VARCHAR(100) UNIQUE NOT NULL,
    name VARCHAR(255) NOT NULL,
    description TEXT,
    gym_id INTEGER,
    discount_type VARCHAR(20) NOT NULL,
    discount_value DECIMAL(10, 2) NOT NULL,
    valid_from TIMESTAMP NOT NULL,
    valid_to TIMESTAMP NOT NULL,
    max_usage_count INTEGER,
    used_count INTEGER DEFAULT 0,
    max_usage_per_user INTEGER,
    min_purchase_amount DECIMAL(10, 2),
    applicable_to_all BOOLEAN DEFAULT true,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_offers_gym FOREIGN KEY (gym_id) REFERENCES gyms(id) ON DELETE CASCADE
);

CREATE INDEX idx_offers_gym_id ON offers(gym_id);
CREATE INDEX idx_offers_active_validity ON offers(is_active, valid_from, valid_to);
CREATE INDEX idx_offers_code ON offers(code);

-- PlanOfferXref table - Many-to-many: which offers apply to which plans
CREATE TABLE plan_offer_xref (
    id SERIAL PRIMARY KEY,
    plan_id INTEGER NOT NULL,
    offer_id INTEGER NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_plan_offer_xref_plan FOREIGN KEY (plan_id) REFERENCES plans(id) ON DELETE CASCADE,
    CONSTRAINT fk_plan_offer_xref_offer FOREIGN KEY (offer_id) REFERENCES offers(id) ON DELETE CASCADE,
    CONSTRAINT uq_plan_offer_xref UNIQUE (plan_id, offer_id)
);

-- Membership table - User's subscription/membership record
CREATE TABLE memberships (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL,
    gym_id INTEGER NOT NULL,
    plan_id INTEGER NOT NULL,
    offer_id INTEGER,
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
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_memberships_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE RESTRICT,
    CONSTRAINT fk_memberships_gym FOREIGN KEY (gym_id) REFERENCES gyms(id) ON DELETE RESTRICT,
    CONSTRAINT fk_memberships_plan FOREIGN KEY (plan_id) REFERENCES plans(id) ON DELETE RESTRICT,
    CONSTRAINT fk_memberships_offer FOREIGN KEY (offer_id) REFERENCES offers(id)
);

CREATE INDEX idx_memberships_user_status ON memberships(user_id, status);
CREATE INDEX idx_memberships_gym_status ON memberships(gym_id, status);
CREATE INDEX idx_memberships_status_end ON memberships(status, end_date);
CREATE INDEX idx_memberships_plan ON memberships(plan_id);
CREATE INDEX idx_memberships_payment ON memberships(payment_status, paid_at);
CREATE INDEX idx_memberships_gym_payment ON memberships(gym_id, payment_status);

-- ============================================
-- ATTENDANCE TABLES
-- ============================================

-- Attendance table - Active check-in sessions
CREATE TABLE attendance (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL,
    gym_id INTEGER NOT NULL,
    membership_id INTEGER,
    check_in_time TIMESTAMP NOT NULL,
    check_out_time TIMESTAMP,
    date VARCHAR(20) NOT NULL,
    marked_by_id INTEGER NOT NULL,
    check_in_method VARCHAR(20) DEFAULT 'code',
    status VARCHAR(50) DEFAULT 'present',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_attendance_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    CONSTRAINT fk_attendance_gym FOREIGN KEY (gym_id) REFERENCES gyms(id) ON DELETE CASCADE,
    CONSTRAINT fk_attendance_membership FOREIGN KEY (membership_id) REFERENCES memberships(id)
);

CREATE INDEX idx_attendance_user_date ON attendance(user_id, date);
CREATE INDEX idx_attendance_gym_date ON attendance(gym_id, date);
CREATE INDEX idx_attendance_date_status ON attendance(date, status);

-- AttendanceHistory table - Completed attendance records
CREATE TABLE attendance_history (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL,
    gym_id INTEGER NOT NULL,
    membership_id INTEGER,
    check_in_time TIMESTAMP NOT NULL,
    check_out_time TIMESTAMP NOT NULL,
    date VARCHAR(20) NOT NULL,
    duration INTEGER,
    marked_by_id INTEGER NOT NULL,
    checked_out_by_id INTEGER,
    check_in_method VARCHAR(20) DEFAULT 'code',
    status VARCHAR(50) DEFAULT 'checked_out',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_attendance_history_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    CONSTRAINT fk_attendance_history_gym FOREIGN KEY (gym_id) REFERENCES gyms(id) ON DELETE CASCADE,
    CONSTRAINT fk_attendance_history_membership FOREIGN KEY (membership_id) REFERENCES memberships(id)
);

CREATE INDEX idx_attendance_history_user_date ON attendance_history(user_id, date);
CREATE INDEX idx_attendance_history_gym_date ON attendance_history(gym_id, date);
CREATE INDEX idx_attendance_history_date ON attendance_history(date);
CREATE INDEX idx_attendance_history_user_checkin ON attendance_history(user_id, check_in_time);

-- ============================================
-- BODY METRICS TABLES
-- ============================================

-- BodyMetrics table - Current/latest body metrics for a user
CREATE TABLE body_metrics (
    id SERIAL PRIMARY KEY,
    user_id INTEGER UNIQUE NOT NULL,
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
    measured_by VARCHAR(100),
    notes TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_body_metrics_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- BodyMetricsHistory table - Historical body metrics records
CREATE TABLE body_metrics_history (
    id SERIAL PRIMARY KEY,
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
    measured_by VARCHAR(100),
    notes TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_body_metrics_history_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX idx_body_metrics_history_user_measured ON body_metrics_history(user_id, measured_at);
CREATE INDEX idx_body_metrics_history_user_created ON body_metrics_history(user_id, created_at);

-- ============================================
-- SUPPORT TICKET TABLES
-- ============================================

-- SupportTicket table - Support tickets from users
CREATE TABLE support_tickets (
    id SERIAL PRIMARY KEY,
    ticket_number VARCHAR(50) UNIQUE NOT NULL,
    subject VARCHAR(255) NOT NULL,
    description TEXT NOT NULL,
    category VARCHAR(50) DEFAULT 'general',
    priority VARCHAR(20) DEFAULT 'medium',
    status VARCHAR(50) DEFAULT 'open',
    user_id INTEGER NOT NULL,
    gym_id INTEGER,
    assigned_to_id INTEGER,
    resolution TEXT,
    resolved_at TIMESTAMP,
    closed_at TIMESTAMP,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_support_tickets_gym FOREIGN KEY (gym_id) REFERENCES gyms(id) ON DELETE SET NULL
);

CREATE INDEX idx_support_tickets_user ON support_tickets(user_id);
CREATE INDEX idx_support_tickets_gym ON support_tickets(gym_id);
CREATE INDEX idx_support_tickets_status ON support_tickets(status);
CREATE INDEX idx_support_tickets_assigned ON support_tickets(assigned_to_id);
CREATE INDEX idx_support_tickets_priority_status ON support_tickets(priority, status);

-- SupportTicketMessage table - Messages/comments on support tickets
CREATE TABLE support_ticket_messages (
    id SERIAL PRIMARY KEY,
    ticket_id INTEGER NOT NULL,
    message TEXT NOT NULL,
    sender_id INTEGER NOT NULL,
    sender_type VARCHAR(20) NOT NULL,
    attachment VARCHAR(255),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_support_ticket_messages_ticket FOREIGN KEY (ticket_id) REFERENCES support_tickets(id) ON DELETE CASCADE
);

CREATE INDEX idx_support_ticket_messages_ticket_created ON support_ticket_messages(ticket_id, created_at);

-- ============================================
-- CONTACT REQUEST TABLE
-- ============================================

CREATE TABLE contact_requests (
    id SERIAL PRIMARY KEY,
    request_number VARCHAR(50) UNIQUE NOT NULL,
    name VARCHAR(255) NOT NULL,
    email VARCHAR(255) NOT NULL,
    phone VARCHAR(50),
    subject VARCHAR(255),
    message TEXT NOT NULL,
    status VARCHAR(50) DEFAULT 'new',
    admin_notes TEXT,
    replied_at TIMESTAMP,
    replied_by INTEGER,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_contact_requests_status ON contact_requests(status);
CREATE INDEX idx_contact_requests_email ON contact_requests(email);
CREATE INDEX idx_contact_requests_created ON contact_requests(created_at);

-- ============================================
-- SAAS SUBSCRIPTION TABLES (Platform subscriptions for gyms)
-- ============================================

-- SaasPlan table - Platform subscription plans offered to gyms
CREATE TABLE saas_plans (
    id SERIAL PRIMARY KEY,
    code VARCHAR(100) UNIQUE NOT NULL,
    name VARCHAR(255) NOT NULL,
    description TEXT,
    price DECIMAL(10, 2) NOT NULL,
    currency VARCHAR(10) DEFAULT 'INR',
    billing_period VARCHAR(20) DEFAULT 'monthly',
    max_members INTEGER DEFAULT -1,
    max_staff INTEGER DEFAULT -1,
    max_branches INTEGER DEFAULT 1,
    features JSONB,
    display_order INTEGER DEFAULT 0,
    is_featured BOOLEAN DEFAULT false,
    badge VARCHAR(100),
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_saas_plans_active_order ON saas_plans(is_active, display_order);

-- GymSubscription table - A gym's subscription to a SaaS plan
CREATE TABLE gym_subscriptions (
    id SERIAL PRIMARY KEY,
    gym_id INTEGER UNIQUE NOT NULL,
    plan_id INTEGER NOT NULL,
    start_date TIMESTAMP NOT NULL,
    end_date TIMESTAMP NOT NULL,
    status VARCHAR(50) DEFAULT 'trial',
    trial_ends_at TIMESTAMP,
    amount DECIMAL(10, 2) NOT NULL,
    currency VARCHAR(10) DEFAULT 'INR',
    payment_status VARCHAR(50) DEFAULT 'pending',
    payment_method VARCHAR(50),
    payment_ref VARCHAR(255),
    last_payment_at TIMESTAMP,
    next_payment_at TIMESTAMP,
    cancelled_at TIMESTAMP,
    cancel_reason TEXT,
    auto_renew BOOLEAN DEFAULT true,
    notes TEXT,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_gym_subscriptions_gym FOREIGN KEY (gym_id) REFERENCES gyms(id) ON DELETE CASCADE,
    CONSTRAINT fk_gym_subscriptions_plan FOREIGN KEY (plan_id) REFERENCES saas_plans(id)
);

CREATE INDEX idx_gym_subscriptions_status ON gym_subscriptions(status);
CREATE INDEX idx_gym_subscriptions_plan ON gym_subscriptions(plan_id);
CREATE INDEX idx_gym_subscriptions_payment ON gym_subscriptions(payment_status);
CREATE INDEX idx_gym_subscriptions_end_status ON gym_subscriptions(end_date, status);
