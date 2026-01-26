-- Add email_verified column to users table
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "email_verified" BOOLEAN DEFAULT false;

-- Create email_verifications table
CREATE TABLE IF NOT EXISTS "email_verifications" (
    "id" SERIAL PRIMARY KEY,
    "email" VARCHAR(255) NOT NULL,
    "otp" VARCHAR(10) NOT NULL,
    "expires_at" TIMESTAMP NOT NULL,
    "is_used" BOOLEAN DEFAULT false,
    "attempts" INTEGER DEFAULT 0,
    "user_type" VARCHAR(50) NOT NULL,
    "user_id" INTEGER NOT NULL,
    "gym_id" INTEGER,
    "created_at" TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Create indexes for email_verifications table
CREATE INDEX IF NOT EXISTS "email_verifications_email_otp_idx" ON "email_verifications"("email", "otp");
CREATE INDEX IF NOT EXISTS "email_verifications_expires_at_idx" ON "email_verifications"("expires_at");
CREATE INDEX IF NOT EXISTS "email_verifications_user_id_idx" ON "email_verifications"("user_id");
