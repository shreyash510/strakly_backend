-- Add cashier role support to tenant schema.
-- The role column is VARCHAR(50) with no CHECK constraint, so no schema change is needed.
-- This migration backfills default cashier permissions for any existing cashier users
-- that may have been created without permissions (null manager_permissions).

UPDATE users
SET manager_permissions = '{
  "clients":       {"create": true,  "read": true,  "update": false, "delete": false},
  "attendance":    {"create": true,  "read": true,  "update": false, "delete": false},
  "classes":       {"create": false, "read": true,  "update": false, "delete": false},
  "appointments":  {"create": false, "read": true,  "update": false, "delete": false},
  "guestVisits":   {"create": true,  "read": true,  "update": false, "delete": false},
  "requests":      {"create": false, "read": false, "update": false, "delete": false},
  "programs":      {"create": false, "read": false, "update": false, "delete": false},
  "announcements": {"create": false, "read": true,  "update": false, "delete": false},
  "trainers":      {"create": false, "read": false, "update": false, "delete": false},
  "salary":        {"create": false, "read": false, "update": false, "delete": false},
  "facilities":    {"create": false, "read": false, "update": false, "delete": false},
  "amenities":     {"create": false, "read": true,  "update": false, "delete": false},
  "equipment":     {"create": false, "read": false, "update": false, "delete": false},
  "leads":         {"create": false, "read": false, "update": false, "delete": false},
  "referrals":     {"create": false, "read": false, "update": false, "delete": false},
  "subscriptions": {"create": true,  "read": true,  "update": false, "delete": false},
  "plans":         {"create": false, "read": true,  "update": false, "delete": false},
  "offers":        {"create": false, "read": true,  "update": false, "delete": false},
  "products":      {"create": false, "read": true,  "update": false, "delete": false},
  "productSales":  {"create": true,  "read": true,  "update": false, "delete": false},
  "financialReports": {"read": false},
  "expenses":      {"create": false, "read": false, "update": false, "delete": false},
  "settings":      {"read": false},
  "reports":       {"read": false},
  "support":       {"create": false, "read": false, "update": false, "delete": false}
}'::jsonb
WHERE role = 'cashier'
  AND (manager_permissions IS NULL)
  AND (is_deleted = FALSE OR is_deleted IS NULL);
