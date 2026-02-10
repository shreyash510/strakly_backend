import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { Pool, PoolClient } from 'pg';

@Injectable()
export class TenantService implements OnModuleInit {
  private readonly logger = new Logger(TenantService.name);
  private pool: Pool;

  constructor() {
    // Use DIRECT_URL for tenant operations because PgBouncer (in DATABASE_URL)
    // doesn't preserve session state (like SET search_path) between queries
    const databaseUrl = process.env.DIRECT_URL || process.env.DATABASE_URL;
    if (!databaseUrl) {
      throw new Error('DATABASE_URL not configured');
    }
    this.pool = new Pool({ connectionString: databaseUrl });
  }

  async onModuleInit() {
    this.logger.log('TenantService initialized');
    // Run migrations to ensure all tenant schemas have required columns
    await this.migrateAllTenantSchemas();
  }

  /**
   * Run migrations on all tenant schemas to add missing columns
   */
  async migrateAllTenantSchemas(): Promise<void> {
    const client = await this.pool.connect();
    try {
      // Get all gyms from the database
      const gymsResult = await client.query(`
        SELECT id, tenant_schema_name FROM public.gyms
      `);

      // Get all existing tenant schemas
      const schemasResult = await client.query(`
        SELECT schema_name FROM information_schema.schemata
        WHERE schema_name LIKE 'tenant_%'
      `);
      const existingSchemas = new Set(
        schemasResult.rows.map((r: Record<string, string>) => r.schema_name),
      );

      this.logger.log(
        `Found ${gymsResult.rows.length} gyms, ${existingSchemas.size} existing tenant schemas`,
      );

      // Create missing tenant schemas for gyms that don't have one
      for (const gym of gymsResult.rows) {
        const schemaName = `tenant_${gym.id}`;
        if (!existingSchemas.has(schemaName)) {
          this.logger.log(
            `Creating missing tenant schema: ${schemaName} for gym ${gym.id}`,
          );
          try {
            await client.query(
              `CREATE SCHEMA IF NOT EXISTS "${schemaName}"`,
            );
            // Update the gym record with the tenant schema name
            if (!gym.tenant_schema_name) {
              await client.query(
                `UPDATE public.gyms SET tenant_schema_name = $1 WHERE id = $2`,
                [schemaName, gym.id],
              );
            }
            existingSchemas.add(schemaName);
          } catch (error) {
            this.logger.error(
              `Failed to create schema ${schemaName}:`,
              error instanceof Error ? error.message : String(error),
            );
          }
        }
      }

      // Migrate all tenant schemas (existing + newly created)
      for (const schemaName of existingSchemas) {
        try {
          await this.migrateTenantSchema(client, schemaName);
        } catch (error) {
          this.logger.error(
            `Failed to migrate schema ${schemaName}:`,
            error instanceof Error ? error.message : String(error),
          );
        }
      }

      this.logger.log('Tenant schema migrations completed');
    } finally {
      client.release();
    }
  }

  /**
   * Apply migrations to a single tenant schema
   */
  private async migrateTenantSchema(
    client: PoolClient,
    schemaName: string,
  ): Promise<void> {
    this.logger.log(`Migrating schema: ${schemaName}`);

    // Ensure all core tables exist (CREATE TABLE IF NOT EXISTS — safe for existing schemas)
    try {
      await this.createTenantTables(client, schemaName);
    } catch (error) {
      this.logger.error(
        `Error ensuring core tables for ${schemaName}:`,
        error instanceof Error ? error.message : String(error),
      );
    }

    // Add role column if it doesn't exist (using information_schema for compatibility)
    try {
      const roleExists = await client.query(`
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = $1 AND table_name = 'users' AND column_name = 'role'
      `, [schemaName]);

      if (roleExists.rows.length === 0) {
        await client.query(`
          ALTER TABLE "${schemaName}".users
          ADD COLUMN role VARCHAR(50) NOT NULL DEFAULT 'client'
        `);
        this.logger.log(`Added 'role' column to ${schemaName}.users`);
      }
    } catch (error) {
      this.logger.error(
        `Error adding role column to ${schemaName}:`,
        error instanceof Error ? error.message : String(error),
      );
    }

    // Add branch_id columns to all tenant tables
    await this.addBranchIdColumns(client, schemaName);

    // Create facilities and amenities tables if they don't exist
    await this.createFacilitiesAndAmenitiesTables(client, schemaName);

    // Create membership_facilities and membership_amenities junction tables
    await this.createMembershipFacilityTables(client, schemaName);

    // Create workout_plans and workout_assignments tables
    await this.createWorkoutTables(client, schemaName);

    // Create notifications table
    await this.createNotificationsTable(client, schemaName);

    // Drop FK constraint on notifications.user_id so admin users (from public.users) can have persistent notifications
    await this.dropNotificationsUserFk(client, schemaName);

    // Create user_branch_xref table for multi-branch assignments
    await this.createUserBranchXrefTable(client, schemaName);

    // Add status_id column for lookup-based status
    await this.addStatusIdColumn(client, schemaName);

    // Add soft delete columns to key tables
    await this.addSoftDeleteColumns(client, schemaName);

    // Migrate date columns from VARCHAR to DATE type
    await this.migrateDateColumns(client, schemaName);

    // Add status CHECK constraints
    await this.addStatusConstraints(client, schemaName);

    // Add performance indexes for common query patterns
    await this.addPerformanceIndexes(client, schemaName);

    // Create payments table for centralized payment tracking
    await this.createPaymentsTable(client, schemaName);

    // Create history tables for audit trail
    await this.createHistoryTables(client, schemaName);

    // Create activity logs table
    await this.createActivityLogsTable(client, schemaName);

    // Create announcements table
    await this.createAnnouncementsTable(client, schemaName);

    // Add missing FK indexes on reference columns
    await this.addMissingForeignKeyIndexes(client, schemaName);

    // Add safe FK constraints (within-schema only)
    await this.addForeignKeyConstraints(client, schemaName);

    // Add CHECK constraints on payments polymorphic columns
    await this.addPaymentConstraints(client, schemaName);

    // Create core table indexes (after all tables are guaranteed to exist)
    try {
      await this.createTenantIndexes(client, schemaName);
    } catch (error) {
      this.logger.error(
        `Error creating tenant indexes for ${schemaName}:`,
        error instanceof Error ? error.message : String(error),
      );
    }

    // Seed default plans if none exist
    try {
      const plansResult = await client.query(
        `SELECT COUNT(*) as count FROM "${schemaName}".plans`,
      );
      if (parseInt(plansResult.rows[0].count) === 0) {
        await this.seedDefaultPlans(client, schemaName);
      }
    } catch (error) {
      this.logger.error(`Error seeding plans for ${schemaName}:`, error.message);
    }
  }

  /**
   * Add branch_id columns to existing tenant tables (migration for multi-branch support)
   */
  private async addBranchIdColumns(
    client: PoolClient,
    schemaName: string,
  ): Promise<void> {
    const tablesToMigrate = [
      'users',
      'plans',
      'offers',
      'memberships',
      'membership_history',
      'attendance',
      'attendance_history',
      'body_metrics',
      'body_metrics_history',
      'trainer_client_xref',
      'plan_offer_xref',
      'staff_salaries',
    ];

    for (const table of tablesToMigrate) {
      try {
        const colExists = await client.query(`
          SELECT 1 FROM information_schema.columns
          WHERE table_schema = $1 AND table_name = $2 AND column_name = 'branch_id'
        `, [schemaName, table]);

        if (colExists.rows.length === 0) {
          await client.query(`
            ALTER TABLE "${schemaName}"."${table}"
            ADD COLUMN branch_id INTEGER
          `);
          this.logger.log(`Added 'branch_id' column to ${schemaName}.${table}`);
        }
      } catch (error) {
        this.logger.error(
          `Error adding branch_id to ${schemaName}.${table}:`,
          error instanceof Error ? error.message : String(error),
        );
      }
    }

    // Create branch_id indexes for all tables
    const indexQueries = [
      `CREATE INDEX IF NOT EXISTS "idx_${schemaName}_users_branch" ON "${schemaName}"."users"(branch_id)`,
      `CREATE INDEX IF NOT EXISTS "idx_${schemaName}_plans_branch" ON "${schemaName}"."plans"(branch_id)`,
      `CREATE INDEX IF NOT EXISTS "idx_${schemaName}_offers_branch" ON "${schemaName}"."offers"(branch_id)`,
      `CREATE INDEX IF NOT EXISTS "idx_${schemaName}_memberships_branch" ON "${schemaName}"."memberships"(branch_id)`,
      `CREATE INDEX IF NOT EXISTS "idx_${schemaName}_membership_history_branch" ON "${schemaName}"."membership_history"(branch_id)`,
      `CREATE INDEX IF NOT EXISTS "idx_${schemaName}_attendance_branch" ON "${schemaName}"."attendance"(branch_id)`,
      `CREATE INDEX IF NOT EXISTS "idx_${schemaName}_attendance_history_branch" ON "${schemaName}"."attendance_history"(branch_id)`,
      `CREATE INDEX IF NOT EXISTS "idx_${schemaName}_body_metrics_branch" ON "${schemaName}"."body_metrics"(branch_id)`,
      `CREATE INDEX IF NOT EXISTS "idx_${schemaName}_body_metrics_history_branch" ON "${schemaName}"."body_metrics_history"(branch_id)`,
      `CREATE INDEX IF NOT EXISTS "idx_${schemaName}_trainer_client_xref_branch" ON "${schemaName}"."trainer_client_xref"(branch_id)`,
      `CREATE INDEX IF NOT EXISTS "idx_${schemaName}_plan_offer_xref_branch" ON "${schemaName}"."plan_offer_xref"(branch_id)`,
      `CREATE INDEX IF NOT EXISTS "idx_${schemaName}_staff_salaries_branch" ON "${schemaName}"."staff_salaries"(branch_id)`,
    ];

    for (const query of indexQueries) {
      try {
        await client.query(query);
      } catch (error) {
        this.logger.error(`Error creating index for ${schemaName}:`, error.message);
      }
    }
    this.logger.log(`Created branch_id indexes for ${schemaName}`);
  }

  /**
   * Create facilities and amenities tables if they don't exist (migration for existing tenants)
   */
  private async createFacilitiesAndAmenitiesTables(
    client: PoolClient,
    schemaName: string,
  ): Promise<void> {
    // Create facilities table
    try {
      await client.query(`
        CREATE TABLE IF NOT EXISTS "${schemaName}"."facilities" (
          id SERIAL PRIMARY KEY,
          branch_id INTEGER,
          name VARCHAR(100) NOT NULL,
          code VARCHAR(20) NOT NULL,
          description TEXT,
          icon VARCHAR(50),
          is_active BOOLEAN DEFAULT TRUE,
          display_order INTEGER DEFAULT 0,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          UNIQUE(branch_id, code)
        )
      `);
      await client.query(
        `CREATE INDEX IF NOT EXISTS "idx_${schemaName}_facilities_branch" ON "${schemaName}"."facilities"(branch_id)`,
      );
      await client.query(
        `CREATE INDEX IF NOT EXISTS "idx_${schemaName}_facilities_code" ON "${schemaName}"."facilities"(code)`,
      );
      await client.query(
        `CREATE INDEX IF NOT EXISTS "idx_${schemaName}_facilities_active" ON "${schemaName}"."facilities"(is_active)`,
      );
      this.logger.log(`Ensured 'facilities' table exists in ${schemaName}`);
    } catch (error) {
      this.logger.error(
        `Error creating facilities table for ${schemaName}:`,
        error.message,
      );
    }

    // Create amenities table
    try {
      await client.query(`
        CREATE TABLE IF NOT EXISTS "${schemaName}"."amenities" (
          id SERIAL PRIMARY KEY,
          branch_id INTEGER,
          name VARCHAR(100) NOT NULL,
          code VARCHAR(20) NOT NULL,
          description TEXT,
          icon VARCHAR(50),
          is_active BOOLEAN DEFAULT TRUE,
          display_order INTEGER DEFAULT 0,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          UNIQUE(branch_id, code)
        )
      `);
      await client.query(
        `CREATE INDEX IF NOT EXISTS "idx_${schemaName}_amenities_branch" ON "${schemaName}"."amenities"(branch_id)`,
      );
      await client.query(
        `CREATE INDEX IF NOT EXISTS "idx_${schemaName}_amenities_code" ON "${schemaName}"."amenities"(code)`,
      );
      await client.query(
        `CREATE INDEX IF NOT EXISTS "idx_${schemaName}_amenities_active" ON "${schemaName}"."amenities"(is_active)`,
      );
      this.logger.log(`Ensured 'amenities' table exists in ${schemaName}`);
    } catch (error) {
      this.logger.error(
        `Error creating amenities table for ${schemaName}:`,
        error.message,
      );
    }
  }

  /**
   * Create membership_facilities and membership_amenities junction tables (migration for existing tenants)
   */
  private async createMembershipFacilityTables(
    client: PoolClient,
    schemaName: string,
  ): Promise<void> {
    // Create membership_facilities table
    try {
      await client.query(`
        CREATE TABLE IF NOT EXISTS "${schemaName}"."membership_facilities" (
          id SERIAL PRIMARY KEY,
          membership_id INTEGER NOT NULL,
          facility_id INTEGER NOT NULL,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          UNIQUE(membership_id, facility_id)
        )
      `);
      await client.query(
        `CREATE INDEX IF NOT EXISTS "idx_${schemaName}_membership_facilities_membership" ON "${schemaName}"."membership_facilities"(membership_id)`,
      );
      await client.query(
        `CREATE INDEX IF NOT EXISTS "idx_${schemaName}_membership_facilities_facility" ON "${schemaName}"."membership_facilities"(facility_id)`,
      );
      this.logger.log(
        `Ensured 'membership_facilities' table exists in ${schemaName}`,
      );
    } catch (error) {
      this.logger.error(
        `Error creating membership_facilities table for ${schemaName}:`,
        error.message,
      );
    }

    // Create membership_amenities table
    try {
      await client.query(`
        CREATE TABLE IF NOT EXISTS "${schemaName}"."membership_amenities" (
          id SERIAL PRIMARY KEY,
          membership_id INTEGER NOT NULL,
          amenity_id INTEGER NOT NULL,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          UNIQUE(membership_id, amenity_id)
        )
      `);
      await client.query(
        `CREATE INDEX IF NOT EXISTS "idx_${schemaName}_membership_amenities_membership" ON "${schemaName}"."membership_amenities"(membership_id)`,
      );
      await client.query(
        `CREATE INDEX IF NOT EXISTS "idx_${schemaName}_membership_amenities_amenity" ON "${schemaName}"."membership_amenities"(amenity_id)`,
      );
      this.logger.log(
        `Ensured 'membership_amenities' table exists in ${schemaName}`,
      );
    } catch (error) {
      this.logger.error(
        `Error creating membership_amenities table for ${schemaName}:`,
        error.message,
      );
    }
  }

  /**
   * Create workout_plans and workout_assignments tables (migration for existing tenants)
   */
  private async createWorkoutTables(
    client: PoolClient,
    schemaName: string,
  ): Promise<void> {
    // Create workout_plans table
    try {
      await client.query(`
        CREATE TABLE IF NOT EXISTS "${schemaName}"."workout_plans" (
          id SERIAL PRIMARY KEY,
          branch_id INTEGER,
          title VARCHAR(255) NOT NULL,
          type VARCHAR(50) NOT NULL,
          description TEXT,
          category VARCHAR(100) NOT NULL,
          difficulty VARCHAR(50) DEFAULT 'beginner',
          duration INTEGER DEFAULT 7,
          sessions_per_week INTEGER DEFAULT 3,
          estimated_session_duration INTEGER DEFAULT 45,
          exercises JSONB DEFAULT '[]',
          status VARCHAR(50) DEFAULT 'draft',
          created_by INTEGER NOT NULL,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
      `);
      await client.query(
        `CREATE INDEX IF NOT EXISTS "idx_${schemaName}_workout_plans_branch" ON "${schemaName}"."workout_plans"(branch_id)`,
      );
      await client.query(
        `CREATE INDEX IF NOT EXISTS "idx_${schemaName}_workout_plans_status" ON "${schemaName}"."workout_plans"(status)`,
      );
      await client.query(
        `CREATE INDEX IF NOT EXISTS "idx_${schemaName}_workout_plans_type" ON "${schemaName}"."workout_plans"(type)`,
      );
      await client.query(
        `CREATE INDEX IF NOT EXISTS "idx_${schemaName}_workout_plans_category" ON "${schemaName}"."workout_plans"(category)`,
      );
      await client.query(
        `CREATE INDEX IF NOT EXISTS "idx_${schemaName}_workout_plans_created_by" ON "${schemaName}"."workout_plans"(created_by)`,
      );
      this.logger.log(`Ensured 'workout_plans' table exists in ${schemaName}`);
    } catch (error) {
      this.logger.error(
        `Error creating workout_plans table for ${schemaName}:`,
        error.message,
      );
    }

    // Create workout_assignments table
    try {
      await client.query(`
        CREATE TABLE IF NOT EXISTS "${schemaName}"."workout_assignments" (
          id SERIAL PRIMARY KEY,
          branch_id INTEGER,
          workout_plan_id INTEGER NOT NULL,
          user_id INTEGER NOT NULL,
          assigned_by INTEGER NOT NULL,
          assigned_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          status VARCHAR(50) DEFAULT 'active',
          progress_percentage INTEGER DEFAULT 0,
          notes TEXT,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
      `);
      await client.query(
        `CREATE INDEX IF NOT EXISTS "idx_${schemaName}_workout_assignments_branch" ON "${schemaName}"."workout_assignments"(branch_id)`,
      );
      await client.query(
        `CREATE INDEX IF NOT EXISTS "idx_${schemaName}_workout_assignments_workout" ON "${schemaName}"."workout_assignments"(workout_plan_id)`,
      );
      await client.query(
        `CREATE INDEX IF NOT EXISTS "idx_${schemaName}_workout_assignments_user" ON "${schemaName}"."workout_assignments"(user_id)`,
      );
      await client.query(
        `CREATE INDEX IF NOT EXISTS "idx_${schemaName}_workout_assignments_status" ON "${schemaName}"."workout_assignments"(status)`,
      );
      this.logger.log(
        `Ensured 'workout_assignments' table exists in ${schemaName}`,
      );
    } catch (error) {
      this.logger.error(
        `Error creating workout_assignments table for ${schemaName}:`,
        error.message,
      );
    }
  }

  /**
   * Create notifications table for a tenant schema (migration for existing schemas)
   */
  private async createNotificationsTable(
    client: PoolClient,
    schemaName: string,
  ): Promise<void> {
    try {
      await client.query(`
        CREATE TABLE IF NOT EXISTS "${schemaName}"."notifications" (
          id SERIAL PRIMARY KEY,
          branch_id INTEGER,
          user_id INTEGER NOT NULL,
          type VARCHAR(50) NOT NULL,
          title VARCHAR(255) NOT NULL,
          message TEXT NOT NULL,
          data JSONB,
          is_read BOOLEAN DEFAULT FALSE,
          read_at TIMESTAMP,
          action_url VARCHAR(500),
          priority VARCHAR(20) DEFAULT 'normal',
          expires_at TIMESTAMP,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          created_by INTEGER
        )
      `);
      await client.query(
        `CREATE INDEX IF NOT EXISTS "idx_${schemaName}_notifications_user" ON "${schemaName}"."notifications"(user_id)`,
      );
      await client.query(
        `CREATE INDEX IF NOT EXISTS "idx_${schemaName}_notifications_unread" ON "${schemaName}"."notifications"(user_id, is_read) WHERE is_read = FALSE`,
      );
      await client.query(
        `CREATE INDEX IF NOT EXISTS "idx_${schemaName}_notifications_type" ON "${schemaName}"."notifications"(type)`,
      );
      await client.query(
        `CREATE INDEX IF NOT EXISTS "idx_${schemaName}_notifications_created" ON "${schemaName}"."notifications"(created_at DESC)`,
      );
      await client.query(
        `CREATE INDEX IF NOT EXISTS "idx_${schemaName}_notifications_branch" ON "${schemaName}"."notifications"(branch_id)`,
      );
      this.logger.log(`Ensured 'notifications' table exists in ${schemaName}`);
    } catch (error) {
      this.logger.error(
        `Error creating notifications table for ${schemaName}:`,
        error.message,
      );
    }
  }

  /**
   * Drop FK constraint on notifications.user_id if it exists.
   * This allows admin users (who live in public.users, not tenant.users)
   * to have persistent notifications in the tenant schema.
   */
  private async dropNotificationsUserFk(
    client: PoolClient,
    schemaName: string,
  ): Promise<void> {
    try {
      const result = await client.query(`
        SELECT constraint_name FROM information_schema.table_constraints
        WHERE table_schema = $1
          AND table_name = 'notifications'
          AND constraint_type = 'FOREIGN KEY'
      `, [schemaName]);

      for (const row of result.rows) {
        await client.query(
          `ALTER TABLE "${schemaName}"."notifications" DROP CONSTRAINT "${row.constraint_name}"`,
        );
        this.logger.log(`Dropped FK constraint '${row.constraint_name}' from ${schemaName}.notifications`);
      }
    } catch (error) {
      this.logger.error(
        `Error dropping notifications FK for ${schemaName}:`,
        error.message,
      );
    }
  }

  /**
   * Create user_branch_xref table for multi-branch assignments (for branch_admin)
   */
  private async createUserBranchXrefTable(
    client: PoolClient,
    schemaName: string,
  ): Promise<void> {
    try {
      await client.query(`
        CREATE TABLE IF NOT EXISTS "${schemaName}"."user_branch_xref" (
          id SERIAL PRIMARY KEY,
          user_id INTEGER NOT NULL,
          branch_id INTEGER NOT NULL,
          is_primary BOOLEAN DEFAULT FALSE,
          is_active BOOLEAN DEFAULT TRUE,
          assigned_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          UNIQUE(user_id, branch_id)
        )
      `);
      await client.query(
        `CREATE INDEX IF NOT EXISTS "idx_${schemaName}_user_branch_xref_user" ON "${schemaName}"."user_branch_xref"(user_id)`,
      );
      await client.query(
        `CREATE INDEX IF NOT EXISTS "idx_${schemaName}_user_branch_xref_branch" ON "${schemaName}"."user_branch_xref"(branch_id)`,
      );
      await client.query(
        `CREATE INDEX IF NOT EXISTS "idx_${schemaName}_user_branch_xref_active" ON "${schemaName}"."user_branch_xref"(is_active) WHERE is_active = TRUE`,
      );
      this.logger.log(`Ensured 'user_branch_xref' table exists in ${schemaName}`);
    } catch (error) {
      this.logger.error(
        `Error creating user_branch_xref table for ${schemaName}:`,
        error.message,
      );
    }
  }

  /**
   * Add status_id column to users table for lookup-based status (migration for existing tenants)
   */
  private async addStatusIdColumn(
    client: PoolClient,
    schemaName: string,
  ): Promise<void> {
    try {
      const colExists = await client.query(`
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = $1 AND table_name = 'users' AND column_name = 'status_id'
      `, [schemaName]);

      if (colExists.rows.length === 0) {
        await client.query(`
          ALTER TABLE "${schemaName}"."users"
          ADD COLUMN status_id INTEGER
        `);
        this.logger.log(`Added 'status_id' column to ${schemaName}.users`);
      }

      await client.query(
        `CREATE INDEX IF NOT EXISTS "idx_${schemaName}_users_status_id" ON "${schemaName}"."users"(status_id)`,
      );
    } catch (error) {
      this.logger.error(
        `Error adding status_id column to ${schemaName}:`,
        error instanceof Error ? error.message : String(error),
      );
    }
  }

  /**
   * Add soft delete columns to tenant tables (users, plans, memberships, offers, attendance, staff_salaries, announcements)
   */
  private async addSoftDeleteColumns(
    client: PoolClient,
    schemaName: string,
  ): Promise<void> {
    const tablesToMigrate = [
      'users',
      'plans',
      'memberships',
      'offers',
      'attendance',
      'attendance_history',
      'staff_salaries',
      'announcements',
      'workout_plans',
      'workout_assignments',
      'notifications',
    ];

    for (const table of tablesToMigrate) {
      try {
        const softDeleteCols = [
          { name: 'is_deleted', definition: 'BOOLEAN DEFAULT FALSE' },
          { name: 'deleted_at', definition: 'TIMESTAMP' },
          { name: 'deleted_by', definition: 'INTEGER' },
        ];

        for (const col of softDeleteCols) {
          const colExists = await client.query(`
            SELECT 1 FROM information_schema.columns
            WHERE table_schema = $1 AND table_name = $2 AND column_name = $3
          `, [schemaName, table, col.name]);

          if (colExists.rows.length === 0) {
            await client.query(`
              ALTER TABLE "${schemaName}"."${table}"
              ADD COLUMN ${col.name} ${col.definition}
            `);
            this.logger.log(`Added '${col.name}' column to ${schemaName}.${table}`);
          }
        }

        // Create partial index for efficient filtering of non-deleted records
        await client.query(`
          CREATE INDEX IF NOT EXISTS "idx_${schemaName}_${table}_not_deleted"
          ON "${schemaName}"."${table}"(is_deleted) WHERE is_deleted = FALSE
        `);
      } catch (error) {
        this.logger.error(
          `Error adding soft delete columns to ${schemaName}.${table}:`,
          error instanceof Error ? error.message : String(error),
        );
      }
    }
  }

  /**
   * Migrate date columns from VARCHAR to DATE type
   * Adds new DATE column alongside existing VARCHAR for backward compatibility
   */
  private async migrateDateColumns(
    client: PoolClient,
    schemaName: string,
  ): Promise<void> {
    try {
      const dateTables = ['attendance', 'attendance_history'];

      for (const table of dateTables) {
        const colExists = await client.query(`
          SELECT 1 FROM information_schema.columns
          WHERE table_schema = $1 AND table_name = $2 AND column_name = 'attendance_date'
        `, [schemaName, table]);

        if (colExists.rows.length === 0) {
          await client.query(`
            ALTER TABLE "${schemaName}"."${table}"
            ADD COLUMN attendance_date DATE
          `);
          this.logger.log(`Added 'attendance_date' column to ${schemaName}.${table}`);
        }

        // Migrate existing data from VARCHAR date to DATE attendance_date
        await client.query(`
          UPDATE "${schemaName}"."${table}"
          SET attendance_date = date::DATE
          WHERE attendance_date IS NULL AND date IS NOT NULL
        `);

        // Add index on attendance_date
        await client.query(`
          CREATE INDEX IF NOT EXISTS "idx_${schemaName}_${table === 'attendance' ? 'attendance_date' : 'attendance_history_date'}"
          ON "${schemaName}"."${table}"(attendance_date)
        `);
      }

      this.logger.log(`Migrated date columns for ${schemaName}`);
    } catch (error) {
      this.logger.error(
        `Error migrating date columns in ${schemaName}:`,
        error instanceof Error ? error.message : String(error),
      );
    }
  }

  /**
   * Add CHECK constraints for status fields to enforce valid values
   */
  private async addStatusConstraints(
    client: PoolClient,
    schemaName: string,
  ): Promise<void> {
    try {
      // Add CHECK constraint for users.status
      await client.query(`
        DO $$
        BEGIN
          IF NOT EXISTS (
            SELECT 1 FROM pg_constraint
            WHERE conname = 'chk_${schemaName.replace(/_/g, '')}_users_status'
          ) THEN
            ALTER TABLE "${schemaName}"."users"
            ADD CONSTRAINT "chk_${schemaName.replace(/_/g, '')}_users_status"
            CHECK (status IN ('onboarding', 'confirm', 'active', 'expired', 'inactive', 'rejected', 'archive'));
          END IF;
        END $$;
      `);

      // Add CHECK constraint for memberships.status
      await client.query(`
        DO $$
        BEGIN
          IF NOT EXISTS (
            SELECT 1 FROM pg_constraint
            WHERE conname = 'chk_${schemaName.replace(/_/g, '')}_memberships_status'
          ) THEN
            ALTER TABLE "${schemaName}"."memberships"
            ADD CONSTRAINT "chk_${schemaName.replace(/_/g, '')}_memberships_status"
            CHECK (status IN ('pending', 'active', 'expired', 'cancelled', 'suspended'));
          END IF;
        END $$;
      `);

      this.logger.log(`Added status CHECK constraints for ${schemaName}`);
    } catch (error) {
      this.logger.error(
        `Error adding status constraints in ${schemaName}:`,
        error.message,
      );
    }
  }

  /**
   * Add performance indexes for common query patterns
   */
  private async addPerformanceIndexes(
    client: PoolClient,
    schemaName: string,
  ): Promise<void> {
    const indexes = [
      // Memberships composite indexes
      `CREATE INDEX IF NOT EXISTS "idx_${schemaName}_memberships_branch_status_end"
       ON "${schemaName}"."memberships"(branch_id, status, end_date)`,

      `CREATE INDEX IF NOT EXISTS "idx_${schemaName}_memberships_user_active"
       ON "${schemaName}"."memberships"(user_id, status) WHERE status = 'active'`,

      // Attendance composite indexes
      `CREATE INDEX IF NOT EXISTS "idx_${schemaName}_attendance_branch_date_composite"
       ON "${schemaName}"."attendance"(branch_id, date)`,

      // Staff salaries composite indexes
      `CREATE INDEX IF NOT EXISTS "idx_${schemaName}_staff_salaries_branch_status_composite"
       ON "${schemaName}"."staff_salaries"(branch_id, payment_status)`,

      `CREATE INDEX IF NOT EXISTS "idx_${schemaName}_staff_salaries_period_status"
       ON "${schemaName}"."staff_salaries"(year, month, payment_status)`,

      // Users composite indexes
      `CREATE INDEX IF NOT EXISTS "idx_${schemaName}_users_branch_role_active"
       ON "${schemaName}"."users"(branch_id, role, status) WHERE is_deleted = FALSE OR is_deleted IS NULL`,
    ];

    for (const indexQuery of indexes) {
      try {
        await client.query(indexQuery);
      } catch (error) {
        this.logger.error(
          `Error creating performance index in ${schemaName}:`,
          error.message,
        );
      }
    }
    this.logger.log(`Created performance indexes for ${schemaName}`);
  }

  /**
   * Create payments table for centralized payment tracking
   */
  private async createPaymentsTable(
    client: PoolClient,
    schemaName: string,
  ): Promise<void> {
    try {
      await client.query(`
        CREATE TABLE IF NOT EXISTS "${schemaName}"."payments" (
          id SERIAL PRIMARY KEY,
          branch_id INTEGER,

          -- Payment source (what is being paid for)
          payment_type VARCHAR(50) NOT NULL,
          reference_id INTEGER NOT NULL,
          reference_table VARCHAR(50) NOT NULL,

          -- Payer info
          payer_type VARCHAR(20) NOT NULL,
          payer_id INTEGER NOT NULL,
          payer_name VARCHAR(255),

          -- Payee info (optional, for salaries)
          payee_type VARCHAR(20),
          payee_id INTEGER,
          payee_name VARCHAR(255),

          -- Amount details
          amount DECIMAL(10, 2) NOT NULL,
          currency VARCHAR(10) DEFAULT 'INR',
          tax_amount DECIMAL(10, 2) DEFAULT 0,
          discount_amount DECIMAL(10, 2) DEFAULT 0,
          net_amount DECIMAL(10, 2) NOT NULL,

          -- Payment details
          payment_method VARCHAR(50) NOT NULL,
          payment_ref VARCHAR(255),
          payment_gateway VARCHAR(50),
          payment_gateway_ref VARCHAR(255),

          -- Status
          status VARCHAR(50) DEFAULT 'pending',
          failure_reason TEXT,

          -- Audit
          processed_at TIMESTAMP,
          processed_by INTEGER,
          notes TEXT,
          metadata JSONB,

          -- Timestamps
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
      `);

      // Create indexes
      await client.query(
        `CREATE INDEX IF NOT EXISTS "idx_${schemaName}_payments_branch" ON "${schemaName}"."payments"(branch_id)`,
      );
      await client.query(
        `CREATE INDEX IF NOT EXISTS "idx_${schemaName}_payments_type" ON "${schemaName}"."payments"(payment_type)`,
      );
      await client.query(
        `CREATE INDEX IF NOT EXISTS "idx_${schemaName}_payments_ref" ON "${schemaName}"."payments"(reference_table, reference_id)`,
      );
      await client.query(
        `CREATE INDEX IF NOT EXISTS "idx_${schemaName}_payments_status" ON "${schemaName}"."payments"(status)`,
      );
      await client.query(
        `CREATE INDEX IF NOT EXISTS "idx_${schemaName}_payments_payer" ON "${schemaName}"."payments"(payer_type, payer_id)`,
      );
      await client.query(
        `CREATE INDEX IF NOT EXISTS "idx_${schemaName}_payments_created" ON "${schemaName}"."payments"(created_at DESC)`,
      );

      this.logger.log(`Ensured 'payments' table exists in ${schemaName}`);
    } catch (error) {
      this.logger.error(
        `Error creating payments table for ${schemaName}:`,
        error.message,
      );
    }
  }

  /**
   * Create history tables for audit trail (user_history, plan_history, salary_history)
   */
  private async createHistoryTables(
    client: PoolClient,
    schemaName: string,
  ): Promise<void> {
    // User history table
    try {
      await client.query(`
        CREATE TABLE IF NOT EXISTS "${schemaName}"."user_history" (
          id SERIAL PRIMARY KEY,
          user_id INTEGER NOT NULL,
          change_type VARCHAR(50) NOT NULL,
          old_values JSONB,
          new_values JSONB,
          changed_fields TEXT[],
          changed_by INTEGER,
          changed_by_type VARCHAR(20),
          change_reason TEXT,
          ip_address VARCHAR(50),
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
      `);
      await client.query(
        `CREATE INDEX IF NOT EXISTS "idx_${schemaName}_user_history_user" ON "${schemaName}"."user_history"(user_id)`,
      );
      await client.query(
        `CREATE INDEX IF NOT EXISTS "idx_${schemaName}_user_history_type" ON "${schemaName}"."user_history"(change_type)`,
      );
      await client.query(
        `CREATE INDEX IF NOT EXISTS "idx_${schemaName}_user_history_created" ON "${schemaName}"."user_history"(created_at DESC)`,
      );
      this.logger.log(`Ensured 'user_history' table exists in ${schemaName}`);
    } catch (error) {
      this.logger.error(
        `Error creating user_history table for ${schemaName}:`,
        error.message,
      );
    }

    // Plan history table
    try {
      await client.query(`
        CREATE TABLE IF NOT EXISTS "${schemaName}"."plan_history" (
          id SERIAL PRIMARY KEY,
          plan_id INTEGER NOT NULL,
          change_type VARCHAR(50) NOT NULL,
          old_price DECIMAL(10, 2),
          new_price DECIMAL(10, 2),
          old_features JSONB,
          new_features JSONB,
          old_values JSONB,
          new_values JSONB,
          changed_by INTEGER,
          change_reason TEXT,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
      `);
      await client.query(
        `CREATE INDEX IF NOT EXISTS "idx_${schemaName}_plan_history_plan" ON "${schemaName}"."plan_history"(plan_id)`,
      );
      await client.query(
        `CREATE INDEX IF NOT EXISTS "idx_${schemaName}_plan_history_created" ON "${schemaName}"."plan_history"(created_at DESC)`,
      );
      this.logger.log(`Ensured 'plan_history' table exists in ${schemaName}`);
    } catch (error) {
      this.logger.error(
        `Error creating plan_history table for ${schemaName}:`,
        error.message,
      );
    }

    // Salary history table
    try {
      await client.query(`
        CREATE TABLE IF NOT EXISTS "${schemaName}"."salary_history" (
          id SERIAL PRIMARY KEY,
          salary_id INTEGER NOT NULL,
          staff_id INTEGER NOT NULL,
          change_type VARCHAR(50) NOT NULL,
          old_values JSONB,
          new_values JSONB,
          payment_method VARCHAR(50),
          payment_ref VARCHAR(255),
          changed_by INTEGER,
          change_reason TEXT,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
      `);
      await client.query(
        `CREATE INDEX IF NOT EXISTS "idx_${schemaName}_salary_history_salary" ON "${schemaName}"."salary_history"(salary_id)`,
      );
      await client.query(
        `CREATE INDEX IF NOT EXISTS "idx_${schemaName}_salary_history_staff" ON "${schemaName}"."salary_history"(staff_id)`,
      );
      await client.query(
        `CREATE INDEX IF NOT EXISTS "idx_${schemaName}_salary_history_created" ON "${schemaName}"."salary_history"(created_at DESC)`,
      );
      this.logger.log(`Ensured 'salary_history' table exists in ${schemaName}`);
    } catch (error) {
      this.logger.error(
        `Error creating salary_history table for ${schemaName}:`,
        error.message,
      );
    }
  }

  /**
   * Create activity logs table for user action audit trail
   */
  private async createActivityLogsTable(
    client: PoolClient,
    schemaName: string,
  ): Promise<void> {
    try {
      await client.query(`
        CREATE TABLE IF NOT EXISTS "${schemaName}"."activity_logs" (
          id SERIAL PRIMARY KEY,
          branch_id INTEGER,

          -- Actor (who performed the action)
          actor_id INTEGER NOT NULL,
          actor_type VARCHAR(20) NOT NULL,
          actor_name VARCHAR(255),

          -- Action
          action VARCHAR(100) NOT NULL,
          action_category VARCHAR(50),

          -- Target (what was affected)
          target_type VARCHAR(50),
          target_id INTEGER,
          target_name VARCHAR(255),

          -- Details
          description TEXT,
          old_values JSONB,
          new_values JSONB,
          metadata JSONB,

          -- Request context
          ip_address VARCHAR(50),
          user_agent TEXT,
          request_id VARCHAR(100),

          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
      `);

      await client.query(
        `CREATE INDEX IF NOT EXISTS "idx_${schemaName}_activity_logs_actor" ON "${schemaName}"."activity_logs"(actor_id, actor_type)`,
      );
      await client.query(
        `CREATE INDEX IF NOT EXISTS "idx_${schemaName}_activity_logs_action" ON "${schemaName}"."activity_logs"(action)`,
      );
      await client.query(
        `CREATE INDEX IF NOT EXISTS "idx_${schemaName}_activity_logs_category" ON "${schemaName}"."activity_logs"(action_category)`,
      );
      await client.query(
        `CREATE INDEX IF NOT EXISTS "idx_${schemaName}_activity_logs_target" ON "${schemaName}"."activity_logs"(target_type, target_id)`,
      );
      await client.query(
        `CREATE INDEX IF NOT EXISTS "idx_${schemaName}_activity_logs_created" ON "${schemaName}"."activity_logs"(created_at DESC)`,
      );
      await client.query(
        `CREATE INDEX IF NOT EXISTS "idx_${schemaName}_activity_logs_branch_created" ON "${schemaName}"."activity_logs"(branch_id, created_at DESC)`,
      );

      this.logger.log(`Ensured 'activity_logs' table exists in ${schemaName}`);
    } catch (error) {
      this.logger.error(
        `Error creating activity_logs table for ${schemaName}:`,
        error.message,
      );
    }
  }

  /**
   * Create announcements table for gym-wide announcements
   */
  private async createAnnouncementsTable(
    client: PoolClient,
    schemaName: string,
  ): Promise<void> {
    try {
      await client.query(`
        CREATE TABLE IF NOT EXISTS "${schemaName}"."announcements" (
          id SERIAL PRIMARY KEY,
          branch_id INTEGER,

          title VARCHAR(255) NOT NULL,
          content TEXT NOT NULL,
          type VARCHAR(50) DEFAULT 'general',
          priority VARCHAR(20) DEFAULT 'normal',

          -- Targeting
          target_audience VARCHAR(50) DEFAULT 'all',
          target_user_ids INTEGER[],

          -- Display settings
          start_date TIMESTAMP DEFAULT NOW(),
          end_date TIMESTAMP,
          is_pinned BOOLEAN DEFAULT FALSE,
          display_on_dashboard BOOLEAN DEFAULT TRUE,
          display_on_mobile BOOLEAN DEFAULT TRUE,

          -- Attachments
          attachments JSONB,

          -- Audit
          created_by INTEGER NOT NULL,
          is_active BOOLEAN DEFAULT TRUE,
          is_deleted BOOLEAN DEFAULT FALSE,
          deleted_at TIMESTAMP,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
      `);

      await client.query(
        `CREATE INDEX IF NOT EXISTS "idx_${schemaName}_announcements_branch" ON "${schemaName}"."announcements"(branch_id)`,
      );
      await client.query(
        `CREATE INDEX IF NOT EXISTS "idx_${schemaName}_announcements_active" ON "${schemaName}"."announcements"(is_active, start_date, end_date)`,
      );
      await client.query(
        `CREATE INDEX IF NOT EXISTS "idx_${schemaName}_announcements_pinned" ON "${schemaName}"."announcements"(is_pinned, created_at DESC)`,
      );
      await client.query(
        `CREATE INDEX IF NOT EXISTS "idx_${schemaName}_announcements_type" ON "${schemaName}"."announcements"(type)`,
      );

      this.logger.log(`Ensured 'announcements' table exists in ${schemaName}`);
    } catch (error) {
      this.logger.error(
        `Error creating announcements table for ${schemaName}:`,
        error.message,
      );
    }
  }

  /**
   * Get the tenant schema name for a gym
   */
  getTenantSchemaName(gymId: number): string {
    return `tenant_${gymId}`;
  }

  /**
   * Create a new tenant schema with all required tables
   */
  async createTenantSchema(gymId: number): Promise<void> {
    const schemaName = this.getTenantSchemaName(gymId);
    const client = await this.pool.connect();

    try {
      await client.query('BEGIN');

      // Create the schema
      await client.query(`CREATE SCHEMA IF NOT EXISTS "${schemaName}"`);

      // Create tenant tables
      await this.createTenantTables(client, schemaName);

      // Seed default plans
      await this.seedDefaultPlans(client, schemaName);

      await client.query('COMMIT');
      this.logger.log(`Created tenant schema: ${schemaName}`);
    } catch (error) {
      await client.query('ROLLBACK');
      this.logger.error(`Failed to create tenant schema ${schemaName}:`, error);
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Create all tenant-specific tables in the schema
   * Note: Staff (manager, trainer) and Clients are stored in tenant schema
   * Only Admin (gym owner) is in public.users
   */
  private async createTenantTables(
    client: PoolClient,
    schemaName: string,
  ): Promise<void> {
    // Users table (STAFF: manager, trainer + CLIENTS: members)
    await client.query(`
      CREATE TABLE IF NOT EXISTS "${schemaName}"."users" (
        id SERIAL PRIMARY KEY,
        branch_id INTEGER,
        name VARCHAR(255) NOT NULL,
        email VARCHAR(255) UNIQUE NOT NULL,
        password_hash VARCHAR(255) NOT NULL,
        phone VARCHAR(50),
        avatar TEXT,
        bio TEXT,
        role VARCHAR(50) NOT NULL DEFAULT 'client',
        date_of_birth TIMESTAMP,
        gender VARCHAR(20),
        address TEXT,
        city VARCHAR(100),
        state VARCHAR(100),
        zip_code VARCHAR(20),
        emergency_contact_name VARCHAR(255),
        emergency_contact_phone VARCHAR(50),
        status VARCHAR(50) DEFAULT 'active',
        status_id INTEGER,
        email_verified BOOLEAN DEFAULT false,
        attendance_code VARCHAR(20) UNIQUE,
        join_date TIMESTAMP,
        last_login_at TIMESTAMP,
        is_deleted BOOLEAN DEFAULT FALSE,
        deleted_at TIMESTAMP,
        deleted_by INTEGER,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Plans table (gym-specific membership plans, branch-specific)
    await client.query(`
      CREATE TABLE IF NOT EXISTS "${schemaName}"."plans" (
        id SERIAL PRIMARY KEY,
        branch_id INTEGER,
        code VARCHAR(100) NOT NULL,
        name VARCHAR(255) NOT NULL,
        description TEXT,
        duration_value INTEGER NOT NULL,
        duration_type VARCHAR(50) NOT NULL,
        price DECIMAL(10, 2) NOT NULL,
        currency VARCHAR(10) DEFAULT 'INR',
        features JSONB,
        display_order INTEGER DEFAULT 0,
        is_featured BOOLEAN DEFAULT FALSE,
        is_active BOOLEAN DEFAULT TRUE,
        is_deleted BOOLEAN DEFAULT FALSE,
        deleted_at TIMESTAMP,
        deleted_by INTEGER,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(branch_id, code)
      )
    `);

    // Offers table (branch-specific)
    await client.query(`
      CREATE TABLE IF NOT EXISTS "${schemaName}"."offers" (
        id SERIAL PRIMARY KEY,
        branch_id INTEGER,
        code VARCHAR(100) NOT NULL,
        name VARCHAR(255) NOT NULL,
        description TEXT,
        discount_type VARCHAR(50) NOT NULL,
        discount_value DECIMAL(10, 2) NOT NULL,
        valid_from TIMESTAMP NOT NULL,
        valid_to TIMESTAMP NOT NULL,
        max_usage_count INTEGER,
        used_count INTEGER DEFAULT 0,
        max_usage_per_user INTEGER,
        min_purchase_amount DECIMAL(10, 2),
        applicable_to_all BOOLEAN DEFAULT TRUE,
        is_active BOOLEAN DEFAULT TRUE,
        is_deleted BOOLEAN DEFAULT FALSE,
        deleted_at TIMESTAMP,
        deleted_by INTEGER,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(branch_id, code)
      )
    `);

    // Plan-Offer cross reference
    await client.query(`
      CREATE TABLE IF NOT EXISTS "${schemaName}"."plan_offer_xref" (
        id SERIAL PRIMARY KEY,
        branch_id INTEGER,
        plan_id INTEGER NOT NULL REFERENCES "${schemaName}"."plans"(id) ON DELETE CASCADE,
        offer_id INTEGER NOT NULL REFERENCES "${schemaName}"."offers"(id) ON DELETE CASCADE,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(plan_id, offer_id)
      )
    `);

    // Memberships table (branch-specific)
    await client.query(`
      CREATE TABLE IF NOT EXISTS "${schemaName}"."memberships" (
        id SERIAL PRIMARY KEY,
        branch_id INTEGER,
        user_id INTEGER NOT NULL REFERENCES "${schemaName}"."users"(id) ON DELETE RESTRICT,
        plan_id INTEGER NOT NULL REFERENCES "${schemaName}"."plans"(id) ON DELETE RESTRICT,
        offer_id INTEGER REFERENCES "${schemaName}"."offers"(id),
        start_date TIMESTAMP NOT NULL,
        end_date TIMESTAMP NOT NULL,
        status VARCHAR(50) DEFAULT 'pending',
        original_amount DECIMAL(10, 2) NOT NULL,
        discount_amount DECIMAL(10, 2) DEFAULT 0,
        final_amount DECIMAL(10, 2) NOT NULL,
        currency VARCHAR(10) DEFAULT 'INR',
        payment_status VARCHAR(50) DEFAULT 'pending',
        payment_method VARCHAR(50),
        payment_ref VARCHAR(255),
        paid_at TIMESTAMP,
        cancelled_at TIMESTAMP,
        cancel_reason TEXT,
        notes TEXT,
        created_by INTEGER, -- public.users.id (staff who created)
        is_active BOOLEAN DEFAULT TRUE,
        is_deleted BOOLEAN DEFAULT FALSE,
        deleted_at TIMESTAMP,
        deleted_by INTEGER,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Membership history table
    await client.query(`
      CREATE TABLE IF NOT EXISTS "${schemaName}"."membership_history" (
        id SERIAL PRIMARY KEY,
        branch_id INTEGER,
        original_id INTEGER NOT NULL,
        user_id INTEGER NOT NULL,
        plan_id INTEGER NOT NULL,
        offer_id INTEGER,
        start_date TIMESTAMP NOT NULL,
        end_date TIMESTAMP NOT NULL,
        status VARCHAR(50) NOT NULL,
        original_amount DECIMAL(10, 2) NOT NULL,
        discount_amount DECIMAL(10, 2) DEFAULT 0,
        final_amount DECIMAL(10, 2) NOT NULL,
        currency VARCHAR(10) DEFAULT 'INR',
        payment_status VARCHAR(50) NOT NULL,
        payment_method VARCHAR(50),
        payment_ref VARCHAR(255),
        paid_at TIMESTAMP,
        cancelled_at TIMESTAMP,
        cancel_reason TEXT,
        notes TEXT,
        archived_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        archive_reason VARCHAR(100),
        original_created_at TIMESTAMP NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Attendance table (active check-ins, branch-specific)
    // marked_by references public.users.id (staff)
    await client.query(`
      CREATE TABLE IF NOT EXISTS "${schemaName}"."attendance" (
        id SERIAL PRIMARY KEY,
        branch_id INTEGER,
        user_id INTEGER NOT NULL REFERENCES "${schemaName}"."users"(id) ON DELETE CASCADE,
        membership_id INTEGER REFERENCES "${schemaName}"."memberships"(id),
        check_in_time TIMESTAMP NOT NULL,
        check_out_time TIMESTAMP,
        date VARCHAR(20) NOT NULL,
        marked_by INTEGER NOT NULL, -- public.users.id (staff who marked)
        check_in_method VARCHAR(50) DEFAULT 'code',
        status VARCHAR(50) DEFAULT 'present',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Attendance history table
    await client.query(`
      CREATE TABLE IF NOT EXISTS "${schemaName}"."attendance_history" (
        id SERIAL PRIMARY KEY,
        branch_id INTEGER,
        user_id INTEGER NOT NULL,
        membership_id INTEGER,
        check_in_time TIMESTAMP NOT NULL,
        check_out_time TIMESTAMP NOT NULL,
        date VARCHAR(20) NOT NULL,
        duration INTEGER,
        marked_by INTEGER NOT NULL,
        checked_out_by INTEGER,
        check_in_method VARCHAR(50) DEFAULT 'code',
        status VARCHAR(50) DEFAULT 'checked_out',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Body metrics table
    await client.query(`
      CREATE TABLE IF NOT EXISTS "${schemaName}"."body_metrics" (
        id SERIAL PRIMARY KEY,
        branch_id INTEGER,
        user_id INTEGER UNIQUE NOT NULL REFERENCES "${schemaName}"."users"(id) ON DELETE CASCADE,
        height DECIMAL(5, 2),
        weight DECIMAL(5, 2),
        bmi DECIMAL(4, 2),
        body_fat DECIMAL(4, 2),
        muscle_mass DECIMAL(5, 2),
        bone_mass DECIMAL(4, 2),
        water_percentage DECIMAL(4, 2),
        chest DECIMAL(5, 2),
        waist DECIMAL(5, 2),
        hips DECIMAL(5, 2),
        biceps DECIMAL(5, 2),
        thighs DECIMAL(5, 2),
        calves DECIMAL(5, 2),
        shoulders DECIMAL(5, 2),
        neck DECIMAL(5, 2),
        resting_heart_rate INTEGER,
        blood_pressure_sys INTEGER,
        blood_pressure_dia INTEGER,
        target_weight DECIMAL(5, 2),
        target_body_fat DECIMAL(4, 2),
        last_measured_at TIMESTAMP,
        measured_by INTEGER, -- public.users.id (staff)
        notes TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Body metrics history table
    await client.query(`
      CREATE TABLE IF NOT EXISTS "${schemaName}"."body_metrics_history" (
        id SERIAL PRIMARY KEY,
        branch_id INTEGER,
        user_id INTEGER NOT NULL,
        measured_at TIMESTAMP NOT NULL,
        height DECIMAL(5, 2),
        weight DECIMAL(5, 2),
        bmi DECIMAL(4, 2),
        body_fat DECIMAL(4, 2),
        muscle_mass DECIMAL(5, 2),
        bone_mass DECIMAL(4, 2),
        water_percentage DECIMAL(4, 2),
        chest DECIMAL(5, 2),
        waist DECIMAL(5, 2),
        hips DECIMAL(5, 2),
        biceps DECIMAL(5, 2),
        thighs DECIMAL(5, 2),
        calves DECIMAL(5, 2),
        shoulders DECIMAL(5, 2),
        neck DECIMAL(5, 2),
        resting_heart_rate INTEGER,
        blood_pressure_sys INTEGER,
        blood_pressure_dia INTEGER,
        measured_by INTEGER, -- public.users.id (staff)
        notes TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Trainer-Client cross reference
    // trainer_id references public.users.id
    await client.query(`
      CREATE TABLE IF NOT EXISTS "${schemaName}"."trainer_client_xref" (
        id SERIAL PRIMARY KEY,
        branch_id INTEGER,
        trainer_id INTEGER NOT NULL, -- public.users.id (trainer)
        client_id INTEGER NOT NULL REFERENCES "${schemaName}"."users"(id) ON DELETE CASCADE,
        assigned_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        is_active BOOLEAN DEFAULT TRUE,
        notes TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(trainer_id, client_id)
      )
    `);

    // Staff Salaries (for trainers and managers in this tenant, branch-specific)
    await client.query(`
      CREATE TABLE IF NOT EXISTS "${schemaName}"."staff_salaries" (
        id SERIAL PRIMARY KEY,
        branch_id INTEGER,
        staff_id INTEGER NOT NULL REFERENCES "${schemaName}"."users"(id) ON DELETE CASCADE,
        month INTEGER NOT NULL,
        year INTEGER NOT NULL,
        base_salary DECIMAL(10, 2) NOT NULL,
        bonus DECIMAL(10, 2) DEFAULT 0,
        deductions DECIMAL(10, 2) DEFAULT 0,
        net_amount DECIMAL(10, 2) NOT NULL,
        currency VARCHAR(10) DEFAULT 'INR',
        is_recurring BOOLEAN DEFAULT FALSE,
        payment_status VARCHAR(20) DEFAULT 'pending',
        payment_method VARCHAR(50),
        payment_ref VARCHAR(100),
        paid_at TIMESTAMP,
        paid_by_id INTEGER, -- public.users.id (admin who paid)
        notes TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(staff_id, month, year, branch_id)
      )
    `);

    // Facilities table (branch-specific)
    await client.query(`
      CREATE TABLE IF NOT EXISTS "${schemaName}"."facilities" (
        id SERIAL PRIMARY KEY,
        branch_id INTEGER,
        name VARCHAR(100) NOT NULL,
        code VARCHAR(20) NOT NULL,
        description TEXT,
        icon VARCHAR(50),
        is_active BOOLEAN DEFAULT TRUE,
        display_order INTEGER DEFAULT 0,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(branch_id, code)
      )
    `);

    // Amenities table (branch-specific)
    await client.query(`
      CREATE TABLE IF NOT EXISTS "${schemaName}"."amenities" (
        id SERIAL PRIMARY KEY,
        branch_id INTEGER,
        name VARCHAR(100) NOT NULL,
        code VARCHAR(20) NOT NULL,
        description TEXT,
        icon VARCHAR(50),
        is_active BOOLEAN DEFAULT TRUE,
        display_order INTEGER DEFAULT 0,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(branch_id, code)
      )
    `);

    // Membership-Facility association (which facilities a membership includes)
    await client.query(`
      CREATE TABLE IF NOT EXISTS "${schemaName}"."membership_facilities" (
        id SERIAL PRIMARY KEY,
        membership_id INTEGER NOT NULL REFERENCES "${schemaName}"."memberships"(id) ON DELETE CASCADE,
        facility_id INTEGER NOT NULL REFERENCES "${schemaName}"."facilities"(id) ON DELETE CASCADE,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(membership_id, facility_id)
      )
    `);

    // Membership-Amenity association (which amenities a membership includes)
    await client.query(`
      CREATE TABLE IF NOT EXISTS "${schemaName}"."membership_amenities" (
        id SERIAL PRIMARY KEY,
        membership_id INTEGER NOT NULL REFERENCES "${schemaName}"."memberships"(id) ON DELETE CASCADE,
        amenity_id INTEGER NOT NULL REFERENCES "${schemaName}"."amenities"(id) ON DELETE CASCADE,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(membership_id, amenity_id)
      )
    `);

    // Workout Plans table (trainer-created workout programs)
    await client.query(`
      CREATE TABLE IF NOT EXISTS "${schemaName}"."workout_plans" (
        id SERIAL PRIMARY KEY,
        branch_id INTEGER,
        title VARCHAR(255) NOT NULL,
        type VARCHAR(50) NOT NULL,
        description TEXT,
        category VARCHAR(100) NOT NULL,
        difficulty VARCHAR(50) DEFAULT 'beginner',
        duration INTEGER DEFAULT 7,
        sessions_per_week INTEGER DEFAULT 3,
        estimated_session_duration INTEGER DEFAULT 45,
        exercises JSONB DEFAULT '[]',
        status VARCHAR(50) DEFAULT 'draft',
        created_by INTEGER NOT NULL,
        is_deleted BOOLEAN DEFAULT FALSE,
        deleted_at TIMESTAMP,
        deleted_by INTEGER,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Workout Assignments table (assign workout plans to clients)
    await client.query(`
      CREATE TABLE IF NOT EXISTS "${schemaName}"."workout_assignments" (
        id SERIAL PRIMARY KEY,
        branch_id INTEGER,
        workout_plan_id INTEGER NOT NULL REFERENCES "${schemaName}"."workout_plans"(id) ON DELETE CASCADE,
        user_id INTEGER NOT NULL REFERENCES "${schemaName}"."users"(id) ON DELETE CASCADE,
        assigned_by INTEGER NOT NULL,
        assigned_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        status VARCHAR(50) DEFAULT 'active',
        progress_percentage INTEGER DEFAULT 0,
        notes TEXT,
        is_deleted BOOLEAN DEFAULT FALSE,
        deleted_at TIMESTAMP,
        deleted_by INTEGER,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Notifications table (in-app notifications for all users)
    await client.query(`
      CREATE TABLE IF NOT EXISTS "${schemaName}"."notifications" (
        id SERIAL PRIMARY KEY,
        branch_id INTEGER,
        user_id INTEGER NOT NULL,
        type VARCHAR(50) NOT NULL,
        title VARCHAR(255) NOT NULL,
        message TEXT NOT NULL,
        data JSONB,
        is_read BOOLEAN DEFAULT FALSE,
        read_at TIMESTAMP,
        action_url VARCHAR(500),
        priority VARCHAR(20) DEFAULT 'normal',
        expires_at TIMESTAMP,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        created_by INTEGER,
        is_deleted BOOLEAN DEFAULT FALSE,
        deleted_at TIMESTAMP,
        deleted_by INTEGER
      )
    `);

    // User-Branch cross reference table (for branch_admin with multiple branches)
    await client.query(`
      CREATE TABLE IF NOT EXISTS "${schemaName}"."user_branch_xref" (
        id SERIAL PRIMARY KEY,
        user_id INTEGER NOT NULL REFERENCES "${schemaName}"."users"(id) ON DELETE CASCADE,
        branch_id INTEGER NOT NULL,
        is_primary BOOLEAN DEFAULT FALSE,
        is_active BOOLEAN DEFAULT TRUE,
        assigned_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(user_id, branch_id)
      )
    `);

    // Create indexes for better query performance
    await this.createTenantIndexes(client, schemaName);
  }

  /**
   * Create indexes for tenant tables
   */
  private async createTenantIndexes(
    client: PoolClient,
    schemaName: string,
  ): Promise<void> {
    // Users indexes
    await client.query(
      `CREATE INDEX IF NOT EXISTS "idx_${schemaName}_users_email" ON "${schemaName}"."users"(email)`,
    );
    await client.query(
      `CREATE INDEX IF NOT EXISTS "idx_${schemaName}_users_role" ON "${schemaName}"."users"(role)`,
    );
    await client.query(
      `CREATE INDEX IF NOT EXISTS "idx_${schemaName}_users_status" ON "${schemaName}"."users"(status)`,
    );
    await client.query(
      `CREATE INDEX IF NOT EXISTS "idx_${schemaName}_users_status_id" ON "${schemaName}"."users"(status_id)`,
    );
    await client.query(
      `CREATE INDEX IF NOT EXISTS "idx_${schemaName}_users_attendance_code" ON "${schemaName}"."users"(attendance_code)`,
    );
    await client.query(
      `CREATE INDEX IF NOT EXISTS "idx_${schemaName}_users_branch" ON "${schemaName}"."users"(branch_id)`,
    );

    // Plans indexes
    await client.query(
      `CREATE INDEX IF NOT EXISTS "idx_${schemaName}_plans_branch" ON "${schemaName}"."plans"(branch_id)`,
    );

    // Offers indexes
    await client.query(
      `CREATE INDEX IF NOT EXISTS "idx_${schemaName}_offers_branch" ON "${schemaName}"."offers"(branch_id)`,
    );

    // Memberships indexes
    await client.query(
      `CREATE INDEX IF NOT EXISTS "idx_${schemaName}_memberships_user" ON "${schemaName}"."memberships"(user_id)`,
    );
    await client.query(
      `CREATE INDEX IF NOT EXISTS "idx_${schemaName}_memberships_status" ON "${schemaName}"."memberships"(status)`,
    );
    await client.query(
      `CREATE INDEX IF NOT EXISTS "idx_${schemaName}_memberships_dates" ON "${schemaName}"."memberships"(start_date, end_date)`,
    );
    await client.query(
      `CREATE INDEX IF NOT EXISTS "idx_${schemaName}_memberships_branch" ON "${schemaName}"."memberships"(branch_id)`,
    );

    // Attendance indexes
    await client.query(
      `CREATE INDEX IF NOT EXISTS "idx_${schemaName}_attendance_user" ON "${schemaName}"."attendance"(user_id)`,
    );
    await client.query(
      `CREATE INDEX IF NOT EXISTS "idx_${schemaName}_attendance_date" ON "${schemaName}"."attendance"(date)`,
    );
    await client.query(
      `CREATE INDEX IF NOT EXISTS "idx_${schemaName}_attendance_marked_by" ON "${schemaName}"."attendance"(marked_by)`,
    );
    await client.query(
      `CREATE INDEX IF NOT EXISTS "idx_${schemaName}_attendance_branch" ON "${schemaName}"."attendance"(branch_id)`,
    );

    // Attendance history indexes
    await client.query(
      `CREATE INDEX IF NOT EXISTS "idx_${schemaName}_attendance_history_user" ON "${schemaName}"."attendance_history"(user_id)`,
    );
    await client.query(
      `CREATE INDEX IF NOT EXISTS "idx_${schemaName}_attendance_history_date" ON "${schemaName}"."attendance_history"(date)`,
    );
    await client.query(
      `CREATE INDEX IF NOT EXISTS "idx_${schemaName}_attendance_history_branch" ON "${schemaName}"."attendance_history"(branch_id)`,
    );

    // Membership history indexes
    await client.query(
      `CREATE INDEX IF NOT EXISTS "idx_${schemaName}_membership_history_branch" ON "${schemaName}"."membership_history"(branch_id)`,
    );

    // Body metrics indexes
    await client.query(
      `CREATE INDEX IF NOT EXISTS "idx_${schemaName}_body_metrics_branch" ON "${schemaName}"."body_metrics"(branch_id)`,
    );
    await client.query(
      `CREATE INDEX IF NOT EXISTS "idx_${schemaName}_body_metrics_history_branch" ON "${schemaName}"."body_metrics_history"(branch_id)`,
    );

    // Trainer-client indexes
    await client.query(
      `CREATE INDEX IF NOT EXISTS "idx_${schemaName}_trainer_client_trainer" ON "${schemaName}"."trainer_client_xref"(trainer_id)`,
    );
    await client.query(
      `CREATE INDEX IF NOT EXISTS "idx_${schemaName}_trainer_client_client" ON "${schemaName}"."trainer_client_xref"(client_id)`,
    );
    await client.query(
      `CREATE INDEX IF NOT EXISTS "idx_${schemaName}_trainer_client_branch" ON "${schemaName}"."trainer_client_xref"(branch_id)`,
    );

    // Plan-offer indexes
    await client.query(
      `CREATE INDEX IF NOT EXISTS "idx_${schemaName}_plan_offer_xref_branch" ON "${schemaName}"."plan_offer_xref"(branch_id)`,
    );

    // Staff salaries indexes
    await client.query(
      `CREATE INDEX IF NOT EXISTS "idx_${schemaName}_staff_salaries_staff" ON "${schemaName}"."staff_salaries"(staff_id)`,
    );
    await client.query(
      `CREATE INDEX IF NOT EXISTS "idx_${schemaName}_staff_salaries_status" ON "${schemaName}"."staff_salaries"(payment_status)`,
    );
    await client.query(
      `CREATE INDEX IF NOT EXISTS "idx_${schemaName}_staff_salaries_period" ON "${schemaName}"."staff_salaries"(year, month)`,
    );
    await client.query(
      `CREATE INDEX IF NOT EXISTS "idx_${schemaName}_staff_salaries_branch" ON "${schemaName}"."staff_salaries"(branch_id)`,
    );

    // Facilities indexes
    await client.query(
      `CREATE INDEX IF NOT EXISTS "idx_${schemaName}_facilities_branch" ON "${schemaName}"."facilities"(branch_id)`,
    );
    await client.query(
      `CREATE INDEX IF NOT EXISTS "idx_${schemaName}_facilities_code" ON "${schemaName}"."facilities"(code)`,
    );
    await client.query(
      `CREATE INDEX IF NOT EXISTS "idx_${schemaName}_facilities_active" ON "${schemaName}"."facilities"(is_active)`,
    );

    // Amenities indexes
    await client.query(
      `CREATE INDEX IF NOT EXISTS "idx_${schemaName}_amenities_branch" ON "${schemaName}"."amenities"(branch_id)`,
    );
    await client.query(
      `CREATE INDEX IF NOT EXISTS "idx_${schemaName}_amenities_code" ON "${schemaName}"."amenities"(code)`,
    );
    await client.query(
      `CREATE INDEX IF NOT EXISTS "idx_${schemaName}_amenities_active" ON "${schemaName}"."amenities"(is_active)`,
    );

    // Membership-Facility indexes
    await client.query(
      `CREATE INDEX IF NOT EXISTS "idx_${schemaName}_membership_facilities_membership" ON "${schemaName}"."membership_facilities"(membership_id)`,
    );
    await client.query(
      `CREATE INDEX IF NOT EXISTS "idx_${schemaName}_membership_facilities_facility" ON "${schemaName}"."membership_facilities"(facility_id)`,
    );

    // Membership-Amenity indexes
    await client.query(
      `CREATE INDEX IF NOT EXISTS "idx_${schemaName}_membership_amenities_membership" ON "${schemaName}"."membership_amenities"(membership_id)`,
    );
    await client.query(
      `CREATE INDEX IF NOT EXISTS "idx_${schemaName}_membership_amenities_amenity" ON "${schemaName}"."membership_amenities"(amenity_id)`,
    );

    // Workout Plans indexes
    await client.query(
      `CREATE INDEX IF NOT EXISTS "idx_${schemaName}_workout_plans_branch" ON "${schemaName}"."workout_plans"(branch_id)`,
    );
    await client.query(
      `CREATE INDEX IF NOT EXISTS "idx_${schemaName}_workout_plans_status" ON "${schemaName}"."workout_plans"(status)`,
    );
    await client.query(
      `CREATE INDEX IF NOT EXISTS "idx_${schemaName}_workout_plans_type" ON "${schemaName}"."workout_plans"(type)`,
    );
    await client.query(
      `CREATE INDEX IF NOT EXISTS "idx_${schemaName}_workout_plans_category" ON "${schemaName}"."workout_plans"(category)`,
    );
    await client.query(
      `CREATE INDEX IF NOT EXISTS "idx_${schemaName}_workout_plans_created_by" ON "${schemaName}"."workout_plans"(created_by)`,
    );

    // Workout Assignments indexes
    await client.query(
      `CREATE INDEX IF NOT EXISTS "idx_${schemaName}_workout_assignments_branch" ON "${schemaName}"."workout_assignments"(branch_id)`,
    );
    await client.query(
      `CREATE INDEX IF NOT EXISTS "idx_${schemaName}_workout_assignments_workout" ON "${schemaName}"."workout_assignments"(workout_plan_id)`,
    );
    await client.query(
      `CREATE INDEX IF NOT EXISTS "idx_${schemaName}_workout_assignments_user" ON "${schemaName}"."workout_assignments"(user_id)`,
    );
    await client.query(
      `CREATE INDEX IF NOT EXISTS "idx_${schemaName}_workout_assignments_status" ON "${schemaName}"."workout_assignments"(status)`,
    );

    // Notifications indexes
    await client.query(
      `CREATE INDEX IF NOT EXISTS "idx_${schemaName}_notifications_user" ON "${schemaName}"."notifications"(user_id)`,
    );
    await client.query(
      `CREATE INDEX IF NOT EXISTS "idx_${schemaName}_notifications_unread" ON "${schemaName}"."notifications"(user_id, is_read) WHERE is_read = FALSE`,
    );
    await client.query(
      `CREATE INDEX IF NOT EXISTS "idx_${schemaName}_notifications_type" ON "${schemaName}"."notifications"(type)`,
    );
    await client.query(
      `CREATE INDEX IF NOT EXISTS "idx_${schemaName}_notifications_created" ON "${schemaName}"."notifications"(created_at DESC)`,
    );
    await client.query(
      `CREATE INDEX IF NOT EXISTS "idx_${schemaName}_notifications_branch" ON "${schemaName}"."notifications"(branch_id)`,
    );

    // User-Branch xref indexes (for branch_admin with multiple branches)
    await client.query(
      `CREATE INDEX IF NOT EXISTS "idx_${schemaName}_user_branch_xref_user" ON "${schemaName}"."user_branch_xref"(user_id)`,
    );
    await client.query(
      `CREATE INDEX IF NOT EXISTS "idx_${schemaName}_user_branch_xref_branch" ON "${schemaName}"."user_branch_xref"(branch_id)`,
    );
    await client.query(
      `CREATE INDEX IF NOT EXISTS "idx_${schemaName}_user_branch_xref_active" ON "${schemaName}"."user_branch_xref"(is_active) WHERE is_active = TRUE`,
    );

    // FK column indexes (added for Issue 4 — missing indexes on reference columns)
    await client.query(
      `CREATE INDEX IF NOT EXISTS "idx_${schemaName}_memberships_plan" ON "${schemaName}"."memberships"(plan_id)`,
    );
    await client.query(
      `CREATE INDEX IF NOT EXISTS "idx_${schemaName}_memberships_offer" ON "${schemaName}"."memberships"(offer_id)`,
    );
    await client.query(
      `CREATE INDEX IF NOT EXISTS "idx_${schemaName}_memberships_created_by" ON "${schemaName}"."memberships"(created_by)`,
    );
    await client.query(
      `CREATE INDEX IF NOT EXISTS "idx_${schemaName}_attendance_membership" ON "${schemaName}"."attendance"(membership_id)`,
    );
    await client.query(
      `CREATE INDEX IF NOT EXISTS "idx_${schemaName}_attendance_history_membership" ON "${schemaName}"."attendance_history"(membership_id)`,
    );
    await client.query(
      `CREATE INDEX IF NOT EXISTS "idx_${schemaName}_attendance_history_marked_by" ON "${schemaName}"."attendance_history"(marked_by)`,
    );
    await client.query(
      `CREATE INDEX IF NOT EXISTS "idx_${schemaName}_attendance_history_checked_out_by" ON "${schemaName}"."attendance_history"(checked_out_by)`,
    );
    await client.query(
      `CREATE INDEX IF NOT EXISTS "idx_${schemaName}_body_metrics_history_user" ON "${schemaName}"."body_metrics_history"(user_id)`,
    );
    await client.query(
      `CREATE INDEX IF NOT EXISTS "idx_${schemaName}_staff_salaries_paid_by" ON "${schemaName}"."staff_salaries"(paid_by_id)`,
    );
    await client.query(
      `CREATE INDEX IF NOT EXISTS "idx_${schemaName}_notifications_created_by" ON "${schemaName}"."notifications"(created_by)`,
    );
    await client.query(
      `CREATE INDEX IF NOT EXISTS "idx_${schemaName}_announcements_created_by" ON "${schemaName}"."announcements"(created_by)`,
    );
    await client.query(
      `CREATE INDEX IF NOT EXISTS "idx_${schemaName}_payments_processed_by" ON "${schemaName}"."payments"(processed_by)`,
    );
    await client.query(
      `CREATE INDEX IF NOT EXISTS "idx_${schemaName}_workout_assignments_assigned_by" ON "${schemaName}"."workout_assignments"(assigned_by)`,
    );
  }

  /**
   * Add indexes on FK columns that were missing (migration for existing schemas)
   */
  private async addMissingForeignKeyIndexes(
    client: PoolClient,
    schemaName: string,
  ): Promise<void> {
    const indexes = [
      `CREATE INDEX IF NOT EXISTS "idx_${schemaName}_memberships_plan" ON "${schemaName}"."memberships"(plan_id)`,
      `CREATE INDEX IF NOT EXISTS "idx_${schemaName}_memberships_offer" ON "${schemaName}"."memberships"(offer_id)`,
      `CREATE INDEX IF NOT EXISTS "idx_${schemaName}_memberships_created_by" ON "${schemaName}"."memberships"(created_by)`,
      `CREATE INDEX IF NOT EXISTS "idx_${schemaName}_attendance_membership" ON "${schemaName}"."attendance"(membership_id)`,
      `CREATE INDEX IF NOT EXISTS "idx_${schemaName}_attendance_history_membership" ON "${schemaName}"."attendance_history"(membership_id)`,
      `CREATE INDEX IF NOT EXISTS "idx_${schemaName}_attendance_history_marked_by" ON "${schemaName}"."attendance_history"(marked_by)`,
      `CREATE INDEX IF NOT EXISTS "idx_${schemaName}_attendance_history_checked_out_by" ON "${schemaName}"."attendance_history"(checked_out_by)`,
      `CREATE INDEX IF NOT EXISTS "idx_${schemaName}_body_metrics_history_user" ON "${schemaName}"."body_metrics_history"(user_id)`,
      `CREATE INDEX IF NOT EXISTS "idx_${schemaName}_staff_salaries_paid_by" ON "${schemaName}"."staff_salaries"(paid_by_id)`,
      `CREATE INDEX IF NOT EXISTS "idx_${schemaName}_notifications_created_by" ON "${schemaName}"."notifications"(created_by)`,
      `CREATE INDEX IF NOT EXISTS "idx_${schemaName}_announcements_created_by" ON "${schemaName}"."announcements"(created_by)`,
      `CREATE INDEX IF NOT EXISTS "idx_${schemaName}_payments_processed_by" ON "${schemaName}"."payments"(processed_by)`,
      `CREATE INDEX IF NOT EXISTS "idx_${schemaName}_workout_assignments_assigned_by" ON "${schemaName}"."workout_assignments"(assigned_by)`,
    ];

    for (const indexQuery of indexes) {
      try {
        await client.query(indexQuery);
      } catch (error) {
        const msg = error instanceof Error ? error.message : String(error);
        this.logger.error(`Error creating FK index in ${schemaName}: ${msg}`);
      }
    }
    this.logger.log(`Ensured FK indexes exist in ${schemaName}`);
  }

  /**
   * Add safe FK constraints (within-schema references only).
   *
   * NOTE: Most "missing" FK constraints reference public.users (cross-schema),
   * which we intentionally skip because:
   * - Cross-schema FKs create tight coupling between tenant and public schemas
   * - History/audit tables must survive parent record deletion
   * - deleted_by columns: the deleter might themselves be removed later
   * - Polymorphic columns (payer_type+payer_id) can't have standard FKs
   */
  private async addForeignKeyConstraints(
    client: PoolClient,
    schemaName: string,
  ): Promise<void> {
    try {
      // user_branch_xref.user_id → users(id) — safe within-schema FK
      await client.query(`
        DO $$
        BEGIN
          IF NOT EXISTS (
            SELECT 1 FROM pg_constraint
            WHERE conname = 'fk_${schemaName}_user_branch_xref_user'
          ) THEN
            ALTER TABLE "${schemaName}"."user_branch_xref"
            ADD CONSTRAINT "fk_${schemaName}_user_branch_xref_user"
            FOREIGN KEY (user_id) REFERENCES "${schemaName}"."users"(id) ON DELETE CASCADE;
          END IF;
        END $$
      `);
      this.logger.log(`Ensured FK constraints exist in ${schemaName}`);
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      this.logger.error(`Error adding FK constraints in ${schemaName}: ${msg}`);
    }
  }

  /**
   * Add CHECK constraints on payments table polymorphic columns.
   * Limits valid values for reference_table, payer_type, and payee_type
   * to prevent invalid string references.
   */
  private async addPaymentConstraints(
    client: PoolClient,
    schemaName: string,
  ): Promise<void> {
    const schemaClean = schemaName.replace(/[^a-zA-Z0-9_]/g, '');
    const constraints = [
      {
        name: `chk_${schemaClean}_payments_reference_table`,
        sql: `ALTER TABLE "${schemaName}"."payments"
              ADD CONSTRAINT "chk_${schemaClean}_payments_reference_table"
              CHECK (reference_table IN ('memberships', 'staff_salaries', 'plans', 'offers'))`,
      },
      {
        name: `chk_${schemaClean}_payments_payer_type`,
        sql: `ALTER TABLE "${schemaName}"."payments"
              ADD CONSTRAINT "chk_${schemaClean}_payments_payer_type"
              CHECK (payer_type IN ('client', 'gym', 'staff', 'admin'))`,
      },
      {
        name: `chk_${schemaClean}_payments_payee_type`,
        sql: `ALTER TABLE "${schemaName}"."payments"
              ADD CONSTRAINT "chk_${schemaClean}_payments_payee_type"
              CHECK (payee_type IS NULL OR payee_type IN ('client', 'gym', 'staff', 'admin'))`,
      },
    ];

    for (const constraint of constraints) {
      try {
        // Check if constraint already exists
        const existing = await client.query(
          `SELECT 1 FROM pg_constraint WHERE conname = $1`,
          [constraint.name],
        );
        if (existing.rows.length === 0) {
          await client.query(constraint.sql);
        }
      } catch (error) {
        const msg = error instanceof Error ? error.message : String(error);
        this.logger.error(`Error adding payment constraint ${constraint.name}: ${msg}`);
      }
    }
    this.logger.log(`Ensured payment CHECK constraints exist in ${schemaName}`);
  }

  /**
   * Seed default membership plans for a new tenant
   */
  private async seedDefaultPlans(
    client: PoolClient,
    schemaName: string,
  ): Promise<void> {
    const defaultPlans = [
      {
        code: 'monthly',
        name: 'Monthly Plan',
        description: 'Perfect for getting started with your fitness journey',
        duration_value: 30,
        duration_type: 'days',
        price: 999,
        features: JSON.stringify([
          'Full gym access',
          'Basic equipment usage',
          'Locker room access',
          'Fitness assessment',
        ]),
        display_order: 1,
        is_featured: false,
      },
      {
        code: 'quarterly',
        name: 'Quarterly Plan',
        description:
          'Our most popular plan with great value for committed members',
        duration_value: 90,
        duration_type: 'days',
        price: 2499,
        features: JSON.stringify([
          'Full gym access',
          'All equipment usage',
          'Locker room access',
          'Fitness assessment',
          '1 Personal training session',
          'Diet consultation',
        ]),
        display_order: 2,
        is_featured: true,
      },
      {
        code: 'annual',
        name: 'Annual Plan',
        description: 'Best value for long-term fitness commitment',
        duration_value: 365,
        duration_type: 'days',
        price: 7999,
        features: JSON.stringify([
          'Full gym access',
          'All equipment usage',
          'Locker room access',
          'Monthly fitness assessment',
          '4 Personal training sessions',
          'Diet consultation',
          'Priority booking',
          'Guest passes (2/month)',
        ]),
        display_order: 3,
        is_featured: false,
      },
    ];

    for (const plan of defaultPlans) {
      // Check if plan already exists (with NULL branch_id)
      const existing = await client.query(
        `SELECT id FROM "${schemaName}"."plans" WHERE code = $1 AND branch_id IS NULL`,
        [plan.code],
      );

      if (existing.rows.length === 0) {
        await client.query(
          `
          INSERT INTO "${schemaName}"."plans"
          (code, name, description, duration_value, duration_type, price, features, display_order, is_featured, is_active)
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, true)
        `,
          [
            plan.code,
            plan.name,
            plan.description,
            plan.duration_value,
            plan.duration_type,
            plan.price,
            plan.features,
            plan.display_order,
            plan.is_featured,
          ],
        );
      }
    }

    this.logger.log(`Seeded default plans for ${schemaName}`);
  }

  /**
   * Drop a tenant schema (use with caution!)
   */
  async dropTenantSchema(gymId: number): Promise<void> {
    const schemaName = this.getTenantSchemaName(gymId);
    const client = await this.pool.connect();

    try {
      await client.query(`DROP SCHEMA IF EXISTS "${schemaName}" CASCADE`);
      this.logger.log(`Dropped tenant schema: ${schemaName}`);
    } finally {
      client.release();
    }
  }

  /**
   * Check if a tenant schema exists
   */
  async tenantSchemaExists(gymId: number): Promise<boolean> {
    const schemaName = this.getTenantSchemaName(gymId);
    const result = await this.pool.query(
      `SELECT schema_name FROM information_schema.schemata WHERE schema_name = $1`,
      [schemaName],
    );
    return result.rows.length > 0;
  }

  /**
   * Execute a query in a specific tenant schema
   */
  async executeInTenant<T>(
    gymId: number,
    callback: (client: PoolClient, schemaName: string) => Promise<T>,
  ): Promise<T> {
    const schemaName = this.getTenantSchemaName(gymId);
    const client = await this.pool.connect();

    try {
      // Set the search path to the tenant schema
      await client.query(`SET search_path TO "${schemaName}", public`);
      return await callback(client, schemaName);
    } finally {
      // Reset search path
      await client.query(`SET search_path TO public`);
      client.release();
    }
  }

  /**
   * Get a raw pool connection for advanced operations
   */
  getPool(): Pool {
    return this.pool;
  }
}
