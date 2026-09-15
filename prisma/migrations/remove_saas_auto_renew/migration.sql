-- Remove the SaaS subscription auto-renew feature.
--
-- The nightly auto-renewal job extended `end_date` by the plan duration without
-- taking any payment, so paid subscriptions renewed themselves for free and the
-- midnight expiry job never found anything to expire. The feature has been
-- removed from the code; this drops the now-unused column.
--
-- NOTE: this does NOT touch the tenant-level `memberships.auto_renew` column,
-- which is a separate (inert) gym-member feature.

ALTER TABLE "saas_gym_subscriptions" DROP COLUMN IF EXISTS "auto_renew";
