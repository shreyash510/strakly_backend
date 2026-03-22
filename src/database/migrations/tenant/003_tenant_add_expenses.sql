-- Migration: 004_tenant_add_expenses
-- Description: Create expense tracking tables (expense_categories, expenses)

-- ============================================
-- 1. Expense Categories Table
-- ============================================
CREATE TABLE IF NOT EXISTS expense_categories (
  id SERIAL PRIMARY KEY,
  name VARCHAR(100) NOT NULL,
  code VARCHAR(50) UNIQUE NOT NULL,
  icon VARCHAR(50),
  color VARCHAR(20),
  sort_order INTEGER NOT NULL DEFAULT 0,
  is_system BOOLEAN NOT NULL DEFAULT FALSE,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

-- ============================================
-- 2. Expenses Table
-- ============================================
CREATE TABLE IF NOT EXISTS expenses (
  id SERIAL PRIMARY KEY,
  category_id INTEGER REFERENCES expense_categories(id),
  amount DECIMAL(10,2) NOT NULL DEFAULT 0,
  currency VARCHAR(10) NOT NULL DEFAULT 'USD',
  description TEXT,
  expense_date DATE NOT NULL DEFAULT CURRENT_DATE,
  receipt_url TEXT,
  payment_status VARCHAR(20) NOT NULL DEFAULT 'paid',
  payment_method VARCHAR(50),
  payment_ref VARCHAR(255),
  is_recurring BOOLEAN NOT NULL DEFAULT FALSE,
  recurring_day INTEGER,
  recurring_frequency VARCHAR(20),
  paid_by_id INTEGER,
  approved_by_id INTEGER,
  notes TEXT,
  is_deleted BOOLEAN NOT NULL DEFAULT FALSE,
  deleted_at TIMESTAMP,
  deleted_by INTEGER,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

-- ============================================
-- 3. Indexes
-- ============================================

-- expense_categories indexes
CREATE INDEX IF NOT EXISTS idx_expense_categories_code ON expense_categories(code);
CREATE INDEX IF NOT EXISTS idx_expense_categories_is_active ON expense_categories(is_active);

-- expenses indexes
CREATE INDEX IF NOT EXISTS idx_expenses_category_id ON expenses(category_id);
CREATE INDEX IF NOT EXISTS idx_expenses_expense_date ON expenses(expense_date);
CREATE INDEX IF NOT EXISTS idx_expenses_payment_status ON expenses(payment_status);
CREATE INDEX IF NOT EXISTS idx_expenses_is_recurring ON expenses(is_recurring);
CREATE INDEX IF NOT EXISTS idx_expenses_is_deleted ON expenses(is_deleted) WHERE is_deleted = FALSE;
CREATE INDEX IF NOT EXISTS idx_expenses_paid_by_id ON expenses(paid_by_id);

-- ============================================
-- 4. Seed Default Categories
-- ============================================
INSERT INTO expense_categories (name, code, icon, color, sort_order, is_system) VALUES
  ('Rent',            'rent',        'BuildingIcon',   '#3B82F6',  1, true),
  ('Utilities',       'utilities',   'ZapIcon',        '#F59E0B',  2, true),
  ('Equipment',       'equipment',   'DumbbellIcon',   '#8B5CF6',  3, true),
  ('Marketing',       'marketing',   'MegaphoneIcon',  '#EC4899',  4, true),
  ('Maintenance',     'maintenance', 'WrenchIcon',     '#6366F1',  5, true),
  ('Supplies',        'supplies',    'PackageIcon',    '#14B8A6',  6, true),
  ('Insurance',       'insurance',   'ShieldIcon',     '#EF4444',  7, true),
  ('Internet & Phone','internet',    'WifiIcon',       '#06B6D4',  8, true),
  ('Cleaning',        'cleaning',    'SparklesIcon',   '#10B981',  9, true),
  ('Other',           'other',       'CircleIcon',     '#6B7280', 10, true)
ON CONFLICT (code) DO NOTHING;
