-- Backfill manager_permissions for existing managers who have NULL permissions.
-- Grants full access to all 21 modules so existing managers are not locked out
-- by the deny-by-default guard change.

UPDATE users
SET manager_permissions = '{
  "clients": {"create": true, "read": true, "update": true, "delete": true},
  "requests": {"create": true, "read": true, "update": true, "delete": true},
  "trainers": {"create": true, "read": true, "update": true, "delete": true},
  "support": {"create": true, "read": true, "update": true, "delete": true},
  "classes": {"create": true, "read": true, "update": true, "delete": true},
  "salary": {"create": true, "read": true, "update": true, "delete": true},
  "announcements": {"create": true, "read": true, "update": true, "delete": true},
  "amenities": {"create": true, "read": true, "update": true, "delete": true},
  "attendance": {"create": true, "read": true, "update": true, "delete": true},
  "referrals": {"create": true, "read": true, "update": true, "delete": true},
  "appointments": {"create": true, "read": true, "update": true, "delete": true},
  "equipment": {"create": true, "read": true, "update": true, "delete": true},
  "guestVisits": {"create": true, "read": true, "update": true, "delete": true},
  "leads": {"create": true, "read": true, "update": true, "delete": true},
  "facilities": {"create": true, "read": true, "update": true, "delete": true},
  "offers": {"create": true, "read": true, "update": true, "delete": true},
  "subscriptions": {"create": true, "read": true, "update": true, "delete": true},
  "products": {"create": true, "read": true, "update": true, "delete": true},
  "productSales": {"create": true, "read": true, "update": true, "delete": true},
  "programs": {"create": true, "read": true, "update": true, "delete": true},
  "plans": {"create": true, "read": true, "update": true, "delete": true}
}'::jsonb
WHERE role = 'manager'
  AND (manager_permissions IS NULL)
  AND (is_deleted = FALSE OR is_deleted IS NULL);
