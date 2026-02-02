import { Module } from '@nestjs/common';
import { MigrationManager } from './migration-manager';

/**
 * MigrationModule provides file-based database migrations.
 *
 * Features:
 * - Automatic main schema migrations on startup
 * - Tenant schema migrations via MigrationManager.runTenantMigrations()
 * - MD5 hash tracking to detect modified migrations
 * - Support for .sql and .ts migration files
 *
 * Usage:
 * - Import this module in AppModule
 * - Main migrations run automatically on startup
 * - For new tenants, inject MigrationManager and call runTenantMigrations(gymId)
 *
 * Migration Files:
 * - src/database/migrations/main/   - Public schema migrations
 * - src/database/migrations/tenant/ - Tenant schema template (applied per tenant)
 *
 * Naming Convention:
 * - Format: 001_description.sql or 001_description.ts
 * - Version: 3-digit number (001, 002, etc.)
 * - Name: lowercase with underscores (snake_case)
 */
@Module({
  providers: [MigrationManager],
  exports: [MigrationManager],
})
export class MigrationModule {}
