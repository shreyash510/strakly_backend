-- Add auth_type column to users table
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "auth_type" VARCHAR(255) NOT NULL DEFAULT 'email';

-- Backfill: users with googleId are google auth users
UPDATE "users" SET "auth_type" = 'google' WHERE "google_id" IS NOT NULL AND "auth_type" = 'email';
