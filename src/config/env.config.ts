import { z } from 'zod';

/**
 * Environment variables schema with Zod validation
 * This validates all environment variables at startup and provides type-safe access
 */
const envSchema = z.object({
  // Environment
  ENVIRONMENT: z.enum(['dev', 'prod', 'test']).default('dev'),
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),

  // Server
  PORT: z.coerce.number().int().positive().default(3000),
  FRONTEND_URL: z.string().url().optional(),

  // Database - one of these must be set based on environment
  DATABASE_URL: z.string().min(10).optional(),
  DATABASE_URL_DEV: z.string().min(10).optional(),
  DATABASE_URL_PROD: z.string().min(10).optional(),
  DIRECT_URL: z.string().min(10).optional(),

  // Auth
  JWT_SECRET: z.string().min(16, 'JWT_SECRET must be at least 16 characters'),
  JWT_EXPIRES_IN: z.string().default('7d'),

  // Google OAuth
  GOOGLE_CLIENT_ID: z.string().optional(),
  GOOGLE_CLIENT_SECRET: z.string().optional(),

  // DigitalOcean Spaces (S3-compatible storage)
  DO_SPACES_KEY: z.string().optional(),
  DO_SPACES_SECRET: z.string().optional(),
  DO_SPACES_ENDPOINT: z.string().optional(),
  DO_SPACES_BUCKET: z.string().optional(),
  DO_SPACES_REGION: z.string().optional(),
  DO_SPACES_CDN_URL: z.string().optional(),

  // ZeptoMail (Email service)
  ZEPTOMAIL_API_URL: z.string().url().optional(),
  ZEPTOMAIL_API_KEY: z.string().optional(),
  ZEPTOMAIL_FROM_EMAIL: z.string().email().optional(),
  ZEPTOMAIL_FROM_NAME: z.string().optional(),

  // OpenAI
  OPENAI_API_KEY: z.string().optional(),
});

export type EnvConfig = z.infer<typeof envSchema>;

/**
 * Parse and validate environment variables
 * Logs errors and exits if validation fails
 */
function validateEnv(): EnvConfig {
  const parsed = envSchema.safeParse(process.env);

  if (!parsed.success) {
    console.error('❌ Invalid environment variables:');
    const formatted = parsed.error.format();

    // Log each error field
    Object.entries(formatted).forEach(([key, value]) => {
      if (key !== '_errors' && typeof value === 'object' && '_errors' in value) {
        const errors = (value as { _errors: string[] })._errors;
        if (errors.length > 0) {
          console.error(`  ${key}: ${errors.join(', ')}`);
        }
      }
    });

    // In production, exit immediately
    if (process.env.NODE_ENV === 'production' || process.env.ENVIRONMENT === 'prod') {
      process.exit(1);
    }

    // In development, log warning but continue (for flexibility)
    console.warn('⚠️  Continuing with invalid env in development mode...');
  }

  return parsed.success ? parsed.data : (process.env as unknown as EnvConfig);
}

/**
 * Validated environment configuration
 * Import this wherever you need type-safe env access
 */
export const env = validateEnv();

/**
 * Get the active database URL based on environment
 */
export function getDatabaseUrl(): string {
  if (env.DATABASE_URL) {
    return env.DATABASE_URL;
  }

  if (env.ENVIRONMENT === 'prod' && env.DATABASE_URL_PROD) {
    return env.DATABASE_URL_PROD;
  }

  if (env.DATABASE_URL_DEV) {
    return env.DATABASE_URL_DEV;
  }

  throw new Error('No database URL configured. Set DATABASE_URL, DATABASE_URL_DEV, or DATABASE_URL_PROD');
}
