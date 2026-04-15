-- Migration: 005_tenant_add_employee_salary_category
-- Description: Add Employee Salary as a system expense category

INSERT INTO expense_categories (name, code, icon, color, sort_order, is_system)
VALUES ('Employee Salary', 'employee_salary', 'WalletIcon', '#F97316', 0, true)
ON CONFLICT (code) DO NOTHING;
