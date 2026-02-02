-- 001_initial_setup.sql
-- Main/Public schema tables for Strakly
-- This migration runs once on the public schema

-- =====================
-- MIGRATIONS TRACKING TABLE
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

CREATE INDEX IF NOT EXISTS idx_migrations_schema ON migrations(schema_name);
CREATE INDEX IF NOT EXISTS idx_migrations_applied ON migrations(applied_at DESC);

-- =====================
-- LOOKUPS TABLE (shared reference data)
-- =====================
CREATE TABLE IF NOT EXISTS lookups (
  id SERIAL PRIMARY KEY,
  category VARCHAR(100) NOT NULL,
  code VARCHAR(100) NOT NULL,
  name VARCHAR(255) NOT NULL,
  description TEXT,
  sort_order INT DEFAULT 0,
  is_active BOOLEAN DEFAULT TRUE,
  is_system BOOLEAN DEFAULT FALSE,
  metadata JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(category, code)
);

CREATE INDEX IF NOT EXISTS idx_lookups_category ON lookups(category);
CREATE INDEX IF NOT EXISTS idx_lookups_code ON lookups(code);
CREATE INDEX IF NOT EXISTS idx_lookups_active ON lookups(is_active) WHERE is_active = TRUE;
