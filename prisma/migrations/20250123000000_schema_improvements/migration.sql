-- Schema Improvements Migration
-- 1. Rename xref tables for consistency
-- 2. Add gymId to Plan and Offer for tenant isolation
-- 3. Add isActive for soft delete standardization
-- 4. Convert date string fields to timestamp

-- ============================================
-- 1. RENAME XREF TABLES
-- ============================================

-- Rename role_permissions to role_permission_xref
ALTER TABLE IF EXISTS role_permissions RENAME TO role_permission_xref;

-- Rename plan_offers to plan_offer_xref
ALTER TABLE IF EXISTS plan_offers RENAME TO plan_offer_xref;

-- ============================================
-- 2. ADD GYM_ID TO PLANS AND OFFERS
-- ============================================

-- Add gym_id to plans table (nullable for global plans)
ALTER TABLE plans ADD COLUMN IF NOT EXISTS gym_id INTEGER;

-- Add foreign key constraint
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.table_constraints
        WHERE constraint_name = 'fk_plans_gym' AND table_name = 'plans'
    ) THEN
        ALTER TABLE plans ADD CONSTRAINT fk_plans_gym
        FOREIGN KEY (gym_id) REFERENCES gyms(id) ON DELETE CASCADE;
    END IF;
END $$;

-- Add index on gym_id
CREATE INDEX IF NOT EXISTS idx_plans_gym_id ON plans(gym_id);

-- Add gym_id to offers table (nullable for global offers)
ALTER TABLE offers ADD COLUMN IF NOT EXISTS gym_id INTEGER;

-- Add foreign key constraint
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.table_constraints
        WHERE constraint_name = 'fk_offers_gym' AND table_name = 'offers'
    ) THEN
        ALTER TABLE offers ADD CONSTRAINT fk_offers_gym
        FOREIGN KEY (gym_id) REFERENCES gyms(id) ON DELETE CASCADE;
    END IF;
END $$;

-- Add index on gym_id
CREATE INDEX IF NOT EXISTS idx_offers_gym_id ON offers(gym_id);

-- ============================================
-- 3. ADD IS_ACTIVE FOR SOFT DELETE
-- ============================================

-- Add is_active to memberships
ALTER TABLE memberships ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT true;

-- Add is_active to support_tickets
ALTER TABLE support_tickets ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT true;

-- Add is_active to contact_requests
ALTER TABLE contact_requests ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT true;

-- Add is_active to gym_subscriptions
ALTER TABLE gym_subscriptions ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT true;

-- ============================================
-- 4. CONVERT DATE STRING FIELDS TO TIMESTAMP
-- ============================================

-- Convert date_of_birth from varchar to timestamp
ALTER TABLE users
ALTER COLUMN date_of_birth TYPE TIMESTAMP
USING CASE
    WHEN date_of_birth IS NOT NULL AND date_of_birth != ''
    THEN date_of_birth::timestamp
    ELSE NULL
END;

-- Convert join_date from varchar to timestamp
ALTER TABLE users
ALTER COLUMN join_date TYPE TIMESTAMP
USING CASE
    WHEN join_date IS NOT NULL AND join_date != ''
    THEN join_date::timestamp
    ELSE NULL
END;

-- Convert last_login_at from varchar to timestamp
ALTER TABLE users
ALTER COLUMN last_login_at TYPE TIMESTAMP
USING CASE
    WHEN last_login_at IS NOT NULL AND last_login_at != ''
    THEN last_login_at::timestamp
    ELSE NULL
END;
