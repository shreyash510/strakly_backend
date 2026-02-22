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

    // Phase 1: Add competitor enhancement columns and tables
    await this.addPhase1Columns(client, schemaName);
    await this.createPhase1Tables(client, schemaName);
    await this.seedCancellationReasons(client, schemaName);

    // Phase 2: Lead CRM, Referrals, Documents, Progress Photos, Member Goals
    try {
      await this.createPhase2Tables(client, schemaName);
    } catch (error) {
      this.logger.error(`Error creating Phase 2 tables for ${schemaName}:`, error instanceof Error ? error.message : String(error));
    }
    await this.seedLeadSources(client, schemaName);
    await this.addPhase2GapColumns(client, schemaName);

    // Phase 3: Class Scheduling, Appointments, Guest Visits
    try {
      await this.createPhase3Tables(client, schemaName);
    } catch (error) {
      this.logger.error(`Error creating Phase 3 tables for ${schemaName}:`, error instanceof Error ? error.message : String(error));
    }

    // Phase 4: POS / Retail, Campaigns, Equipment
    try {
      await this.createPhase4Tables(client, schemaName);
    } catch (error) {
      this.logger.error(`Error creating Phase 4 tables for ${schemaName}:`, error instanceof Error ? error.message : String(error));
    }
    await this.seedProductCategories(client, schemaName);
    await this.seedCampaignTemplates(client, schemaName);

    // Phase 5: Custom Fields, Surveys, Engagement, Gamification, Loyalty, Wearables, Currencies
    try {
      await this.createPhase5Tables(client, schemaName);
    } catch (error) {
      this.logger.error(`Error creating Phase 5 tables for ${schemaName}:`, error instanceof Error ? error.message : String(error));
    }
    await this.seedDefaultCurrencies(client, schemaName);
    await this.seedDefaultLoyaltyTiers(client, schemaName);

    // Add created_by column to achievements if missing (for schemas created before fix)
    try {
      const createdByExists = await client.query(`
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = $1 AND table_name = 'achievements' AND column_name = 'created_by'
      `, [schemaName]);
      if (createdByExists.rows.length === 0) {
        await client.query(`ALTER TABLE "${schemaName}"."achievements" ADD COLUMN created_by INTEGER`);
        this.logger.log(`Added 'created_by' column to ${schemaName}.achievements`);
      }
    } catch (error) {
      this.logger.error(
        `Error adding created_by to ${schemaName}.achievements:`,
        error instanceof Error ? error.message : String(error),
      );
    }

    await this.seedDefaultAchievements(client, schemaName);

    // Add unlocked_sidebar_items column to users table
    try {
      const colExists = await client.query(`
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = $1 AND table_name = 'users' AND column_name = 'unlocked_sidebar_items'
      `, [schemaName]);
      if (colExists.rows.length === 0) {
        await client.query(`ALTER TABLE "${schemaName}"."users" ADD COLUMN unlocked_sidebar_items JSONB`);
        this.logger.log(`Added 'unlocked_sidebar_items' column to ${schemaName}.users`);
      }
    } catch (error) {
      this.logger.error(
        `Error adding unlocked_sidebar_items to ${schemaName}.users:`,
        error instanceof Error ? error.message : String(error),
      );
    }

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
      // Create the schema (outside transaction — DDL is auto-committed in PG anyway)
      await client.query(`CREATE SCHEMA IF NOT EXISTS "${schemaName}"`);

      // Run full migration which creates all tables, columns, indexes, and Phase 1-5 tables.
      // All operations are idempotent (IF NOT EXISTS / information_schema checks).
      // NOTE: No wrapping transaction — migrateTenantSchema tolerates individual step failures
      // (some steps have their own try-catch). A wrapping transaction would cause PostgreSQL to
      // abort ALL subsequent steps if any single step fails ("current transaction is aborted").
      await this.migrateTenantSchema(client, schemaName);

      // Seed default plans (idempotent — checks for existing rows before inserting)
      await this.seedDefaultPlans(client, schemaName);

      this.logger.log(`Created tenant schema: ${schemaName}`);
    } catch (error) {
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
        referred_by INTEGER,
        referral_code VARCHAR(20) UNIQUE,
        lead_source VARCHAR(50),
        occupation VARCHAR(100),
        blood_group VARCHAR(10),
        medical_conditions TEXT,
        fitness_goal VARCHAR(50),
        preferred_time_slot VARCHAR(20),
        nationality VARCHAR(50),
        id_type VARCHAR(30),
        id_number VARCHAR(50),
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
        max_freeze_days INTEGER DEFAULT 0,
        includes_pt_sessions INTEGER DEFAULT 0,
        access_hours VARCHAR(50) DEFAULT 'all_day',
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
        cancellation_reason_code VARCHAR(50),
        notes TEXT,
        created_by INTEGER, -- public.users.id (staff who created)
        is_active BOOLEAN DEFAULT TRUE,
        auto_renew BOOLEAN DEFAULT FALSE,
        freeze_start_date TIMESTAMP,
        freeze_end_date TIMESTAMP,
        freeze_reason TEXT,
        total_freeze_days INTEGER DEFAULT 0,
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
        attendance_date DATE,
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
        attendance_date DATE,
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

    // Member notes table
    await client.query(`
      CREATE TABLE IF NOT EXISTS "${schemaName}"."member_notes" (
        id SERIAL PRIMARY KEY,
        branch_id INTEGER,
        user_id INTEGER NOT NULL REFERENCES "${schemaName}"."users"(id) ON DELETE CASCADE,
        note_type VARCHAR(30) NOT NULL DEFAULT 'general',
        content TEXT NOT NULL,
        is_pinned BOOLEAN DEFAULT FALSE,
        visibility VARCHAR(20) DEFAULT 'all',
        created_by INTEGER NOT NULL,
        is_deleted BOOLEAN DEFAULT FALSE,
        deleted_at TIMESTAMP,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Membership freezes table
    await client.query(`
      CREATE TABLE IF NOT EXISTS "${schemaName}"."membership_freezes" (
        id SERIAL PRIMARY KEY,
        branch_id INTEGER,
        membership_id INTEGER NOT NULL REFERENCES "${schemaName}"."memberships"(id) ON DELETE CASCADE,
        start_date TIMESTAMP NOT NULL,
        end_date TIMESTAMP NOT NULL,
        reason TEXT,
        approved_by INTEGER,
        status VARCHAR(20) DEFAULT 'active',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Cancellation reasons lookup table
    await client.query(`
      CREATE TABLE IF NOT EXISTS "${schemaName}"."cancellation_reasons" (
        id SERIAL PRIMARY KEY,
        code VARCHAR(50) NOT NULL UNIQUE,
        label VARCHAR(100) NOT NULL,
        display_order INTEGER DEFAULT 0,
        is_active BOOLEAN DEFAULT TRUE,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
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

    // Create payments table
    await this.createPaymentsTable(client, schemaName);

    // Create activity logs table
    await this.createActivityLogsTable(client, schemaName);

    // Create announcements table
    await this.createAnnouncementsTable(client, schemaName);

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
   * Phase 1: Add new columns to existing tenant tables (users, memberships, plans)
   */
  private async addPhase1Columns(
    client: PoolClient,
    schemaName: string,
  ): Promise<void> {
    const columnMigrations = [
      // Users table — 11 new columns
      { table: 'users', name: 'referred_by', definition: 'INTEGER' },
      { table: 'users', name: 'referral_code', definition: 'VARCHAR(20)' },
      { table: 'users', name: 'lead_source', definition: 'VARCHAR(50)' },
      { table: 'users', name: 'occupation', definition: 'VARCHAR(100)' },
      { table: 'users', name: 'blood_group', definition: 'VARCHAR(10)' },
      { table: 'users', name: 'medical_conditions', definition: 'TEXT' },
      { table: 'users', name: 'fitness_goal', definition: 'VARCHAR(50)' },
      { table: 'users', name: 'preferred_time_slot', definition: 'VARCHAR(20)' },
      { table: 'users', name: 'nationality', definition: 'VARCHAR(50)' },
      { table: 'users', name: 'id_type', definition: 'VARCHAR(30)' },
      { table: 'users', name: 'id_number', definition: 'VARCHAR(50)' },
      // Memberships table — 6 new columns
      { table: 'memberships', name: 'auto_renew', definition: 'BOOLEAN DEFAULT FALSE' },
      { table: 'memberships', name: 'freeze_start_date', definition: 'TIMESTAMP' },
      { table: 'memberships', name: 'freeze_end_date', definition: 'TIMESTAMP' },
      { table: 'memberships', name: 'freeze_reason', definition: 'TEXT' },
      { table: 'memberships', name: 'total_freeze_days', definition: 'INTEGER DEFAULT 0' },
      { table: 'memberships', name: 'cancellation_reason_code', definition: 'VARCHAR(50)' },
      // Plans table — 3 new columns
      { table: 'plans', name: 'max_freeze_days', definition: 'INTEGER DEFAULT 0' },
      { table: 'plans', name: 'includes_pt_sessions', definition: 'INTEGER DEFAULT 0' },
      { table: 'plans', name: 'access_hours', definition: "VARCHAR(50) DEFAULT 'all_day'" },
    ];

    for (const col of columnMigrations) {
      try {
        const colExists = await client.query(`
          SELECT 1 FROM information_schema.columns
          WHERE table_schema = $1 AND table_name = $2 AND column_name = $3
        `, [schemaName, col.table, col.name]);

        if (colExists.rows.length === 0) {
          await client.query(`
            ALTER TABLE "${schemaName}"."${col.table}"
            ADD COLUMN ${col.name} ${col.definition}
          `);
          this.logger.log(`Added '${col.name}' to ${schemaName}.${col.table}`);
        }
      } catch (error) {
        this.logger.error(
          `Error adding ${col.name} to ${schemaName}.${col.table}:`,
          error instanceof Error ? error.message : String(error),
        );
      }
    }

    // Add unique index on referral_code
    try {
      await client.query(`
        CREATE UNIQUE INDEX IF NOT EXISTS "idx_${schemaName}_users_referral_code"
        ON "${schemaName}"."users"(referral_code) WHERE referral_code IS NOT NULL
      `);
      await client.query(`
        CREATE INDEX IF NOT EXISTS "idx_${schemaName}_users_lead_source"
        ON "${schemaName}"."users"(lead_source) WHERE lead_source IS NOT NULL
      `);
      await client.query(`
        CREATE INDEX IF NOT EXISTS "idx_${schemaName}_users_fitness_goal"
        ON "${schemaName}"."users"(fitness_goal) WHERE fitness_goal IS NOT NULL
      `);
      await client.query(`
        CREATE INDEX IF NOT EXISTS "idx_${schemaName}_users_referred_by"
        ON "${schemaName}"."users"(referred_by) WHERE referred_by IS NOT NULL
      `);
    } catch (error) {
      this.logger.error(
        `Error creating phase1 indexes for ${schemaName}:`,
        error instanceof Error ? error.message : String(error),
      );
    }
  }

  /**
   * Phase 2 Gaps: Add new columns to existing Phase 2 tables
   * (leads.stage_entered_at, signed_documents.signature_data/pdf_url)
   */
  private async addPhase2GapColumns(
    client: PoolClient,
    schemaName: string,
  ): Promise<void> {
    const columnMigrations = [
      // Leads — stage timing
      { table: 'leads', name: 'stage_entered_at', definition: 'TIMESTAMP DEFAULT CURRENT_TIMESTAMP' },
      // Signed Documents — signature drawing + PDF
      { table: 'signed_documents', name: 'signature_data', definition: 'TEXT' },
      { table: 'signed_documents', name: 'pdf_url', definition: 'TEXT' },
      // Progress Photos — missing columns
      { table: 'progress_photos', name: 'file_size', definition: 'INTEGER' },
      { table: 'progress_photos', name: 'updated_at', definition: 'TIMESTAMP DEFAULT CURRENT_TIMESTAMP' },
      // Services — buffer time between appointments
      { table: 'services', name: 'buffer_minutes', definition: 'INTEGER DEFAULT 0' },
    ];

    for (const col of columnMigrations) {
      try {
        const colExists = await client.query(`
          SELECT 1 FROM information_schema.columns
          WHERE table_schema = $1 AND table_name = $2 AND column_name = $3
        `, [schemaName, col.table, col.name]);

        if (colExists.rows.length === 0) {
          await client.query(`
            ALTER TABLE "${schemaName}"."${col.table}"
            ADD COLUMN ${col.name} ${col.definition}
          `);
          this.logger.log(`Added '${col.name}' to ${schemaName}.${col.table}`);
        }
      } catch (error) {
        this.logger.error(
          `Error adding ${col.name} to ${schemaName}.${col.table}:`,
          error instanceof Error ? error.message : String(error),
        );
      }
    }
  }

  /**
   * Phase 1: Create new tables (member_notes, membership_freezes, cancellation_reasons)
   */
  private async createPhase1Tables(
    client: PoolClient,
    schemaName: string,
  ): Promise<void> {
    try {
      await client.query(`
        CREATE TABLE IF NOT EXISTS "${schemaName}"."member_notes" (
          id SERIAL PRIMARY KEY,
          branch_id INTEGER,
          user_id INTEGER NOT NULL REFERENCES "${schemaName}"."users"(id) ON DELETE CASCADE,
          note_type VARCHAR(30) NOT NULL DEFAULT 'general',
          content TEXT NOT NULL,
          is_pinned BOOLEAN DEFAULT FALSE,
          visibility VARCHAR(20) DEFAULT 'all',
          created_by INTEGER NOT NULL,
          is_deleted BOOLEAN DEFAULT FALSE,
          deleted_at TIMESTAMP,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
      `);

      await client.query(`
        CREATE TABLE IF NOT EXISTS "${schemaName}"."membership_freezes" (
          id SERIAL PRIMARY KEY,
          branch_id INTEGER,
          membership_id INTEGER NOT NULL REFERENCES "${schemaName}"."memberships"(id) ON DELETE CASCADE,
          start_date TIMESTAMP NOT NULL,
          end_date TIMESTAMP NOT NULL,
          reason TEXT,
          approved_by INTEGER,
          status VARCHAR(20) DEFAULT 'active',
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
      `);

      await client.query(`
        CREATE TABLE IF NOT EXISTS "${schemaName}"."cancellation_reasons" (
          id SERIAL PRIMARY KEY,
          code VARCHAR(50) NOT NULL UNIQUE,
          label VARCHAR(100) NOT NULL,
          display_order INTEGER DEFAULT 0,
          is_active BOOLEAN DEFAULT TRUE,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
      `);

      // Indexes for new tables
      await client.query(`
        CREATE INDEX IF NOT EXISTS "idx_${schemaName}_member_notes_user_id"
        ON "${schemaName}"."member_notes"(user_id) WHERE is_deleted = FALSE
      `);
      await client.query(`
        CREATE INDEX IF NOT EXISTS "idx_${schemaName}_membership_freezes_membership_id"
        ON "${schemaName}"."membership_freezes"(membership_id)
      `);
    } catch (error) {
      this.logger.error(
        `Error creating phase1 tables for ${schemaName}:`,
        error instanceof Error ? error.message : String(error),
      );
    }
  }

  /**
   * Seed default cancellation reasons
   */
  private async seedCancellationReasons(
    client: PoolClient,
    schemaName: string,
  ): Promise<void> {
    const reasons = [
      { code: 'cost', label: 'Too Expensive', display_order: 1 },
      { code: 'relocation', label: 'Relocating / Moving', display_order: 2 },
      { code: 'injury', label: 'Injury / Health Issue', display_order: 3 },
      { code: 'dissatisfied', label: 'Dissatisfied with Service', display_order: 4 },
      { code: 'schedule_conflict', label: 'Schedule Conflict', display_order: 5 },
      { code: 'switching_gym', label: 'Switching to Another Gym', display_order: 6 },
      { code: 'personal', label: 'Personal Reasons', display_order: 7 },
      { code: 'other', label: 'Other', display_order: 8 },
    ];

    for (const reason of reasons) {
      try {
        const existing = await client.query(
          `SELECT id FROM "${schemaName}"."cancellation_reasons" WHERE code = $1`,
          [reason.code],
        );

        if (existing.rows.length === 0) {
          await client.query(
            `INSERT INTO "${schemaName}"."cancellation_reasons" (code, label, display_order)
             VALUES ($1, $2, $3)`,
            [reason.code, reason.label, reason.display_order],
          );
        }
      } catch (error) {
        // Table might not exist yet on first run — ignore
      }
    }
  }

  /* ============================================================ */
  /* Phase 2: Lead CRM, Referrals, Documents, Photos, Goals       */
  /* ============================================================ */

  private async createPhase2Tables(
    client: PoolClient,
    schemaName: string,
  ): Promise<void> {
    // Lead Sources (lookup)
    await client.query(`
      CREATE TABLE IF NOT EXISTS "${schemaName}"."lead_sources" (
        id SERIAL PRIMARY KEY,
        code VARCHAR(50) NOT NULL UNIQUE,
        name VARCHAR(100) NOT NULL,
        is_active BOOLEAN DEFAULT TRUE,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Leads
    await client.query(`
      CREATE TABLE IF NOT EXISTS "${schemaName}"."leads" (
        id SERIAL PRIMARY KEY,
        branch_id INTEGER,
        name VARCHAR(100) NOT NULL,
        email VARCHAR(255),
        phone VARCHAR(30),
        lead_source VARCHAR(50),
        pipeline_stage VARCHAR(30) NOT NULL DEFAULT 'new',
        assigned_to INTEGER,
        score VARCHAR(10) DEFAULT 'warm',
        inquiry_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        expected_close_date DATE,
        deal_value NUMERIC(10,2),
        win_loss_reason TEXT,
        notes TEXT,
        converted_user_id INTEGER,
        is_deleted BOOLEAN DEFAULT FALSE,
        deleted_at TIMESTAMP,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Lead Activities
    await client.query(`
      CREATE TABLE IF NOT EXISTS "${schemaName}"."lead_activities" (
        id SERIAL PRIMARY KEY,
        lead_id INTEGER NOT NULL REFERENCES "${schemaName}"."leads"(id) ON DELETE CASCADE,
        type VARCHAR(30) NOT NULL,
        notes TEXT,
        scheduled_at TIMESTAMP,
        completed_at TIMESTAMP,
        performed_by INTEGER NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Referrals
    await client.query(`
      CREATE TABLE IF NOT EXISTS "${schemaName}"."referrals" (
        id SERIAL PRIMARY KEY,
        branch_id INTEGER,
        referrer_id INTEGER NOT NULL,
        referred_id INTEGER,
        referral_code VARCHAR(20) NOT NULL,
        status VARCHAR(20) NOT NULL DEFAULT 'pending',
        reward_type VARCHAR(20),
        reward_amount NUMERIC(10,2),
        converted_at TIMESTAMP,
        rewarded_at TIMESTAMP,
        notes TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Document Templates
    await client.query(`
      CREATE TABLE IF NOT EXISTS "${schemaName}"."document_templates" (
        id SERIAL PRIMARY KEY,
        branch_id INTEGER,
        name VARCHAR(200) NOT NULL,
        type VARCHAR(30) NOT NULL DEFAULT 'waiver',
        content TEXT NOT NULL,
        version INTEGER NOT NULL DEFAULT 1,
        is_active BOOLEAN DEFAULT TRUE,
        created_by INTEGER NOT NULL,
        is_deleted BOOLEAN DEFAULT FALSE,
        deleted_at TIMESTAMP,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Signed Documents
    await client.query(`
      CREATE TABLE IF NOT EXISTS "${schemaName}"."signed_documents" (
        id SERIAL PRIMARY KEY,
        branch_id INTEGER,
        template_id INTEGER NOT NULL REFERENCES "${schemaName}"."document_templates"(id),
        user_id INTEGER NOT NULL,
        signer_name VARCHAR(200) NOT NULL,
        agreed BOOLEAN NOT NULL DEFAULT TRUE,
        signed_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        ip_address VARCHAR(45),
        user_agent TEXT,
        version_signed INTEGER NOT NULL DEFAULT 1,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Progress Photos
    await client.query(`
      CREATE TABLE IF NOT EXISTS "${schemaName}"."progress_photos" (
        id SERIAL PRIMARY KEY,
        user_id INTEGER NOT NULL,
        photo_url TEXT NOT NULL,
        thumbnail_url TEXT,
        category VARCHAR(20) NOT NULL DEFAULT 'other',
        taken_at DATE DEFAULT CURRENT_DATE,
        notes TEXT,
        body_metrics_id INTEGER,
        uploaded_by INTEGER NOT NULL,
        visibility VARCHAR(20) DEFAULT 'all',
        file_size INTEGER,
        is_deleted BOOLEAN DEFAULT FALSE,
        deleted_at TIMESTAMP,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Member Goals
    await client.query(`
      CREATE TABLE IF NOT EXISTS "${schemaName}"."member_goals" (
        id SERIAL PRIMARY KEY,
        branch_id INTEGER,
        user_id INTEGER NOT NULL,
        goal_type VARCHAR(30) NOT NULL DEFAULT 'general_fitness',
        title VARCHAR(200) NOT NULL,
        description TEXT,
        target_value NUMERIC(10,2),
        current_value NUMERIC(10,2) DEFAULT 0,
        unit VARCHAR(20),
        start_date DATE DEFAULT CURRENT_DATE,
        target_date DATE,
        status VARCHAR(20) NOT NULL DEFAULT 'active',
        achieved_at TIMESTAMP,
        assigned_by INTEGER,
        is_deleted BOOLEAN DEFAULT FALSE,
        deleted_at TIMESTAMP,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Lead Stage History
    await client.query(`
      CREATE TABLE IF NOT EXISTS "${schemaName}"."lead_stage_history" (
        id SERIAL PRIMARY KEY,
        lead_id INTEGER NOT NULL REFERENCES "${schemaName}"."leads"(id) ON DELETE CASCADE,
        from_stage VARCHAR(30),
        to_stage VARCHAR(30) NOT NULL,
        changed_by INTEGER,
        changed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Goal Milestones
    await client.query(`
      CREATE TABLE IF NOT EXISTS "${schemaName}"."goal_milestones" (
        id SERIAL PRIMARY KEY,
        goal_id INTEGER NOT NULL REFERENCES "${schemaName}"."member_goals"(id) ON DELETE CASCADE,
        title VARCHAR(200) NOT NULL,
        target_value NUMERIC(10,2),
        current_value NUMERIC(10,2) DEFAULT 0,
        unit VARCHAR(20),
        order_index INTEGER DEFAULT 0,
        is_completed BOOLEAN DEFAULT FALSE,
        completed_at TIMESTAMP,
        target_date DATE,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Indexes
    try {
      await client.query(`CREATE INDEX IF NOT EXISTS "idx_${schemaName}_leads_stage" ON "${schemaName}"."leads"(pipeline_stage) WHERE is_deleted = FALSE`);
      await client.query(`CREATE INDEX IF NOT EXISTS "idx_${schemaName}_leads_branch" ON "${schemaName}"."leads"(branch_id) WHERE is_deleted = FALSE`);
      await client.query(`CREATE INDEX IF NOT EXISTS "idx_${schemaName}_leads_source" ON "${schemaName}"."leads"(lead_source) WHERE is_deleted = FALSE`);
      await client.query(`CREATE INDEX IF NOT EXISTS "idx_${schemaName}_leads_assigned" ON "${schemaName}"."leads"(assigned_to) WHERE is_deleted = FALSE`);
      await client.query(`CREATE INDEX IF NOT EXISTS "idx_${schemaName}_lead_activities_lead" ON "${schemaName}"."lead_activities"(lead_id)`);
      await client.query(`CREATE INDEX IF NOT EXISTS "idx_${schemaName}_lead_stage_history_lead" ON "${schemaName}"."lead_stage_history"(lead_id)`);
      await client.query(`CREATE INDEX IF NOT EXISTS "idx_${schemaName}_referrals_referrer" ON "${schemaName}"."referrals"(referrer_id)`);
      await client.query(`CREATE INDEX IF NOT EXISTS "idx_${schemaName}_referrals_referred" ON "${schemaName}"."referrals"(referred_id)`);
      await client.query(`CREATE INDEX IF NOT EXISTS "idx_${schemaName}_signed_docs_user" ON "${schemaName}"."signed_documents"(user_id)`);
      await client.query(`CREATE INDEX IF NOT EXISTS "idx_${schemaName}_progress_photos_user" ON "${schemaName}"."progress_photos"(user_id) WHERE is_deleted = FALSE`);
      await client.query(`CREATE INDEX IF NOT EXISTS "idx_${schemaName}_member_goals_user" ON "${schemaName}"."member_goals"(user_id) WHERE is_deleted = FALSE`);
      await client.query(`CREATE INDEX IF NOT EXISTS "idx_${schemaName}_goal_milestones_goal" ON "${schemaName}"."goal_milestones"(goal_id)`);
    } catch {
      // Indexes may already exist
    }
  }

  private async seedLeadSources(
    client: PoolClient,
    schemaName: string,
  ): Promise<void> {
    const sources = [
      { code: 'walk_in', name: 'Walk-in' },
      { code: 'website', name: 'Website' },
      { code: 'social_media', name: 'Social Media' },
      { code: 'referral', name: 'Referral' },
      { code: 'ad_campaign', name: 'Ad Campaign' },
      { code: 'google', name: 'Google' },
      { code: 'instagram', name: 'Instagram' },
      { code: 'other', name: 'Other' },
    ];

    for (const source of sources) {
      try {
        const existing = await client.query(
          `SELECT id FROM "${schemaName}"."lead_sources" WHERE code = $1`,
          [source.code],
        );
        if (existing.rows.length === 0) {
          await client.query(
            `INSERT INTO "${schemaName}"."lead_sources" (code, name) VALUES ($1, $2)`,
            [source.code, source.name],
          );
        }
      } catch {
        // Table might not exist yet
      }
    }
  }

  /**
   * Phase 3: Create Class Scheduling, Appointment/PT Booking, and Guest Visit tables
   */
  private async createPhase3Tables(
    client: PoolClient,
    schemaName: string,
  ): Promise<void> {
    // ─── Class Scheduling ───

    await client.query(`
      CREATE TABLE IF NOT EXISTS "${schemaName}"."class_types" (
        id SERIAL PRIMARY KEY,
        branch_id INTEGER,
        name VARCHAR(100) NOT NULL,
        description TEXT,
        category VARCHAR(50),
        default_duration INTEGER NOT NULL DEFAULT 60,
        default_capacity INTEGER NOT NULL DEFAULT 20,
        color VARCHAR(20),
        icon VARCHAR(50),
        is_active BOOLEAN DEFAULT TRUE,
        is_deleted BOOLEAN DEFAULT FALSE,
        deleted_at TIMESTAMP,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS "${schemaName}"."class_schedules" (
        id SERIAL PRIMARY KEY,
        class_type_id INTEGER NOT NULL REFERENCES "${schemaName}"."class_types"(id) ON DELETE CASCADE,
        branch_id INTEGER,
        instructor_id INTEGER,
        room VARCHAR(100),
        day_of_week INTEGER NOT NULL,
        start_time VARCHAR(10) NOT NULL,
        end_time VARCHAR(10) NOT NULL,
        capacity INTEGER NOT NULL DEFAULT 20,
        is_recurring BOOLEAN DEFAULT TRUE,
        start_date DATE,
        end_date DATE,
        is_active BOOLEAN DEFAULT TRUE,
        is_deleted BOOLEAN DEFAULT FALSE,
        deleted_at TIMESTAMP,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS "${schemaName}"."class_sessions" (
        id SERIAL PRIMARY KEY,
        schedule_id INTEGER NOT NULL REFERENCES "${schemaName}"."class_schedules"(id) ON DELETE CASCADE,
        branch_id INTEGER,
        date DATE NOT NULL,
        instructor_id INTEGER,
        status VARCHAR(20) NOT NULL DEFAULT 'scheduled',
        actual_capacity INTEGER,
        notes TEXT,
        cancelled_reason TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS "${schemaName}"."class_bookings" (
        id SERIAL PRIMARY KEY,
        session_id INTEGER NOT NULL REFERENCES "${schemaName}"."class_sessions"(id) ON DELETE CASCADE,
        user_id INTEGER NOT NULL,
        status VARCHAR(20) NOT NULL DEFAULT 'booked',
        booked_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        cancelled_at TIMESTAMP,
        cancel_reason TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // ─── Appointment / PT Booking ───

    await client.query(`
      CREATE TABLE IF NOT EXISTS "${schemaName}"."services" (
        id SERIAL PRIMARY KEY,
        branch_id INTEGER,
        name VARCHAR(200) NOT NULL,
        description TEXT,
        duration_minutes INTEGER NOT NULL DEFAULT 60,
        price NUMERIC(10,2) NOT NULL DEFAULT 0,
        currency VARCHAR(10) DEFAULT 'INR',
        max_participants INTEGER DEFAULT 1,
        category VARCHAR(50),
        buffer_minutes INTEGER DEFAULT 0,
        is_active BOOLEAN DEFAULT TRUE,
        is_deleted BOOLEAN DEFAULT FALSE,
        deleted_at TIMESTAMP,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS "${schemaName}"."trainer_availability" (
        id SERIAL PRIMARY KEY,
        trainer_id INTEGER NOT NULL,
        branch_id INTEGER,
        day_of_week INTEGER NOT NULL,
        start_time VARCHAR(10) NOT NULL,
        end_time VARCHAR(10) NOT NULL,
        is_available BOOLEAN DEFAULT TRUE,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS "${schemaName}"."appointments" (
        id SERIAL PRIMARY KEY,
        service_id INTEGER REFERENCES "${schemaName}"."services"(id),
        trainer_id INTEGER NOT NULL,
        user_id INTEGER NOT NULL,
        branch_id INTEGER,
        start_time TIMESTAMP NOT NULL,
        end_time TIMESTAMP NOT NULL,
        status VARCHAR(20) NOT NULL DEFAULT 'booked',
        notes TEXT,
        cancelled_reason TEXT,
        cancelled_at TIMESTAMP,
        created_by INTEGER,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS "${schemaName}"."session_packages" (
        id SERIAL PRIMARY KEY,
        user_id INTEGER NOT NULL,
        service_id INTEGER REFERENCES "${schemaName}"."services"(id),
        branch_id INTEGER,
        total_sessions INTEGER NOT NULL,
        used_sessions INTEGER NOT NULL DEFAULT 0,
        remaining_sessions INTEGER NOT NULL,
        purchased_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        expires_at TIMESTAMP,
        status VARCHAR(20) NOT NULL DEFAULT 'active',
        payment_id INTEGER,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // ─── Guest / Day Pass ───

    await client.query(`
      CREATE TABLE IF NOT EXISTS "${schemaName}"."guest_visits" (
        id SERIAL PRIMARY KEY,
        branch_id INTEGER,
        guest_name VARCHAR(200) NOT NULL,
        guest_phone VARCHAR(30),
        guest_email VARCHAR(255),
        brought_by INTEGER,
        visit_date DATE NOT NULL DEFAULT CURRENT_DATE,
        day_pass_amount NUMERIC(10,2) DEFAULT 0,
        payment_method VARCHAR(30),
        converted_to_member BOOLEAN DEFAULT FALSE,
        notes TEXT,
        checked_in_by INTEGER,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // ─── Indexes ───
    try {
      // Class types
      await client.query(`CREATE INDEX IF NOT EXISTS "idx_${schemaName}_class_types_branch" ON "${schemaName}"."class_types"(branch_id) WHERE is_deleted = FALSE`);
      // Class schedules
      await client.query(`CREATE INDEX IF NOT EXISTS "idx_${schemaName}_class_schedules_type" ON "${schemaName}"."class_schedules"(class_type_id)`);
      await client.query(`CREATE INDEX IF NOT EXISTS "idx_${schemaName}_class_schedules_branch" ON "${schemaName}"."class_schedules"(branch_id)`);
      await client.query(`CREATE INDEX IF NOT EXISTS "idx_${schemaName}_class_schedules_instructor" ON "${schemaName}"."class_schedules"(instructor_id)`);
      await client.query(`CREATE INDEX IF NOT EXISTS "idx_${schemaName}_class_schedules_day" ON "${schemaName}"."class_schedules"(day_of_week)`);
      // Class sessions
      await client.query(`CREATE UNIQUE INDEX IF NOT EXISTS "idx_${schemaName}_class_sessions_schedule_date" ON "${schemaName}"."class_sessions"(schedule_id, date)`);
      await client.query(`CREATE INDEX IF NOT EXISTS "idx_${schemaName}_class_sessions_date" ON "${schemaName}"."class_sessions"(date)`);
      await client.query(`CREATE INDEX IF NOT EXISTS "idx_${schemaName}_class_sessions_status" ON "${schemaName}"."class_sessions"(status)`);
      await client.query(`CREATE INDEX IF NOT EXISTS "idx_${schemaName}_class_sessions_branch" ON "${schemaName}"."class_sessions"(branch_id)`);
      // Class bookings
      await client.query(`CREATE INDEX IF NOT EXISTS "idx_${schemaName}_class_bookings_session" ON "${schemaName}"."class_bookings"(session_id)`);
      await client.query(`CREATE INDEX IF NOT EXISTS "idx_${schemaName}_class_bookings_user" ON "${schemaName}"."class_bookings"(user_id)`);
      await client.query(`CREATE INDEX IF NOT EXISTS "idx_${schemaName}_class_bookings_status" ON "${schemaName}"."class_bookings"(status)`);
      // Services
      await client.query(`CREATE INDEX IF NOT EXISTS "idx_${schemaName}_services_branch" ON "${schemaName}"."services"(branch_id) WHERE is_deleted = FALSE`);
      // Trainer availability
      await client.query(`CREATE INDEX IF NOT EXISTS "idx_${schemaName}_trainer_avail_trainer" ON "${schemaName}"."trainer_availability"(trainer_id)`);
      await client.query(`CREATE INDEX IF NOT EXISTS "idx_${schemaName}_trainer_avail_day" ON "${schemaName}"."trainer_availability"(day_of_week)`);
      // Appointments
      await client.query(`CREATE INDEX IF NOT EXISTS "idx_${schemaName}_appointments_trainer" ON "${schemaName}"."appointments"(trainer_id)`);
      await client.query(`CREATE INDEX IF NOT EXISTS "idx_${schemaName}_appointments_user" ON "${schemaName}"."appointments"(user_id)`);
      await client.query(`CREATE INDEX IF NOT EXISTS "idx_${schemaName}_appointments_branch" ON "${schemaName}"."appointments"(branch_id)`);
      await client.query(`CREATE INDEX IF NOT EXISTS "idx_${schemaName}_appointments_status" ON "${schemaName}"."appointments"(status)`);
      await client.query(`CREATE INDEX IF NOT EXISTS "idx_${schemaName}_appointments_time" ON "${schemaName}"."appointments"(start_time, end_time)`);
      await client.query(`CREATE INDEX IF NOT EXISTS "idx_${schemaName}_appointments_service" ON "${schemaName}"."appointments"(service_id) WHERE service_id IS NOT NULL`);
      // Session packages
      await client.query(`CREATE INDEX IF NOT EXISTS "idx_${schemaName}_session_pkgs_user" ON "${schemaName}"."session_packages"(user_id)`);
      await client.query(`CREATE INDEX IF NOT EXISTS "idx_${schemaName}_session_pkgs_status" ON "${schemaName}"."session_packages"(status)`);
      await client.query(`CREATE INDEX IF NOT EXISTS "idx_${schemaName}_session_pkgs_service" ON "${schemaName}"."session_packages"(service_id) WHERE service_id IS NOT NULL`);
      // Guest visits
      await client.query(`CREATE INDEX IF NOT EXISTS "idx_${schemaName}_guest_visits_branch" ON "${schemaName}"."guest_visits"(branch_id)`);
      await client.query(`CREATE INDEX IF NOT EXISTS "idx_${schemaName}_guest_visits_date" ON "${schemaName}"."guest_visits"(visit_date)`);
      await client.query(`CREATE INDEX IF NOT EXISTS "idx_${schemaName}_guest_visits_brought_by" ON "${schemaName}"."guest_visits"(brought_by) WHERE brought_by IS NOT NULL`);
      await client.query(`CREATE INDEX IF NOT EXISTS "idx_${schemaName}_guest_visits_checked_in" ON "${schemaName}"."guest_visits"(checked_in_by) WHERE checked_in_by IS NOT NULL`);
    } catch {
      // Indexes may already exist
    }
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Phase 4: POS / Retail, Campaigns, Equipment
  // ─────────────────────────────────────────────────────────────────────────

  private async createPhase4Tables(
    client: PoolClient,
    schemaName: string,
  ): Promise<void> {
    // ─── Equipment Tracking ───

    await client.query(`
      CREATE TABLE IF NOT EXISTS "${schemaName}"."equipment" (
        id SERIAL PRIMARY KEY,
        branch_id INTEGER,
        name VARCHAR(200) NOT NULL,
        brand VARCHAR(100),
        model VARCHAR(100),
        serial_number VARCHAR(100),
        purchase_date DATE,
        purchase_cost DECIMAL(10, 2),
        warranty_expiry DATE,
        status VARCHAR(30) NOT NULL DEFAULT 'operational',
        location VARCHAR(200),
        notes TEXT,
        is_deleted BOOLEAN DEFAULT FALSE,
        deleted_at TIMESTAMP,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS "${schemaName}"."equipment_maintenance" (
        id SERIAL PRIMARY KEY,
        equipment_id INTEGER NOT NULL REFERENCES "${schemaName}"."equipment"(id) ON DELETE CASCADE,
        branch_id INTEGER,
        type VARCHAR(30) NOT NULL DEFAULT 'preventive',
        description TEXT NOT NULL,
        scheduled_date DATE NOT NULL,
        completed_date DATE,
        performed_by INTEGER,
        cost DECIMAL(10, 2),
        notes TEXT,
        status VARCHAR(30) NOT NULL DEFAULT 'scheduled',
        is_deleted BOOLEAN DEFAULT FALSE,
        deleted_at TIMESTAMP,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // ─── POS / Retail / Inventory ───

    await client.query(`
      CREATE TABLE IF NOT EXISTS "${schemaName}"."product_categories" (
        id SERIAL PRIMARY KEY,
        branch_id INTEGER,
        name VARCHAR(200) NOT NULL,
        description TEXT,
        display_order INTEGER DEFAULT 0,
        is_deleted BOOLEAN DEFAULT FALSE,
        deleted_at TIMESTAMP,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS "${schemaName}"."products" (
        id SERIAL PRIMARY KEY,
        branch_id INTEGER,
        category_id INTEGER REFERENCES "${schemaName}"."product_categories"(id) ON DELETE SET NULL,
        name VARCHAR(200) NOT NULL,
        sku VARCHAR(50),
        barcode VARCHAR(100),
        description TEXT,
        price DECIMAL(10, 2) NOT NULL,
        cost_price DECIMAL(10, 2),
        tax_rate DECIMAL(5, 2) DEFAULT 0,
        stock_quantity INTEGER NOT NULL DEFAULT 0,
        low_stock_threshold INTEGER DEFAULT 5,
        is_active BOOLEAN DEFAULT TRUE,
        is_deleted BOOLEAN DEFAULT FALSE,
        deleted_at TIMESTAMP,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS "${schemaName}"."product_sales" (
        id SERIAL PRIMARY KEY,
        branch_id INTEGER,
        product_id INTEGER NOT NULL REFERENCES "${schemaName}"."products"(id) ON DELETE RESTRICT,
        user_id INTEGER,
        quantity INTEGER NOT NULL DEFAULT 1,
        unit_price DECIMAL(10, 2) NOT NULL,
        tax_amount DECIMAL(10, 2) DEFAULT 0,
        total_amount DECIMAL(10, 2) NOT NULL,
        payment_method VARCHAR(50) NOT NULL,
        payment_id INTEGER,
        sold_by INTEGER NOT NULL,
        sold_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        notes TEXT,
        is_deleted BOOLEAN DEFAULT FALSE,
        deleted_at TIMESTAMP,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // ─── Email / SMS Campaign System ───

    await client.query(`
      CREATE TABLE IF NOT EXISTS "${schemaName}"."campaign_templates" (
        id SERIAL PRIMARY KEY,
        branch_id INTEGER,
        name VARCHAR(200) NOT NULL,
        type VARCHAR(10) NOT NULL DEFAULT 'email',
        subject VARCHAR(500),
        content TEXT NOT NULL,
        merge_fields JSONB,
        is_deleted BOOLEAN DEFAULT FALSE,
        deleted_at TIMESTAMP,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS "${schemaName}"."campaigns" (
        id SERIAL PRIMARY KEY,
        branch_id INTEGER,
        template_id INTEGER REFERENCES "${schemaName}"."campaign_templates"(id) ON DELETE SET NULL,
        name VARCHAR(200) NOT NULL,
        type VARCHAR(10) NOT NULL DEFAULT 'email',
        subject VARCHAR(500),
        content TEXT,
        audience_filter JSONB,
        scheduled_at TIMESTAMP,
        sent_at TIMESTAMP,
        status VARCHAR(30) NOT NULL DEFAULT 'draft',
        total_recipients INTEGER DEFAULT 0,
        total_sent INTEGER DEFAULT 0,
        total_opened INTEGER DEFAULT 0,
        total_clicked INTEGER DEFAULT 0,
        total_bounced INTEGER DEFAULT 0,
        total_unsubscribed INTEGER DEFAULT 0,
        created_by INTEGER NOT NULL,
        is_deleted BOOLEAN DEFAULT FALSE,
        deleted_at TIMESTAMP,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS "${schemaName}"."campaign_recipients" (
        id SERIAL PRIMARY KEY,
        campaign_id INTEGER NOT NULL REFERENCES "${schemaName}"."campaigns"(id) ON DELETE CASCADE,
        user_id INTEGER NOT NULL,
        email VARCHAR(255),
        phone VARCHAR(30),
        status VARCHAR(30) NOT NULL DEFAULT 'pending',
        sent_at TIMESTAMP,
        delivered_at TIMESTAMP,
        opened_at TIMESTAMP,
        clicked_at TIMESTAMP,
        bounced_at TIMESTAMP,
        error_message TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // ─── Phase 4 Indexes ───
    try {
      // Equipment
      await client.query(`CREATE INDEX IF NOT EXISTS "idx_${schemaName}_equipment_branch" ON "${schemaName}"."equipment"(branch_id) WHERE is_deleted = FALSE`);
      await client.query(`CREATE INDEX IF NOT EXISTS "idx_${schemaName}_equipment_status" ON "${schemaName}"."equipment"(status) WHERE is_deleted = FALSE`);
      await client.query(`CREATE INDEX IF NOT EXISTS "idx_${schemaName}_equipment_serial" ON "${schemaName}"."equipment"(serial_number) WHERE is_deleted = FALSE`);
      // Equipment maintenance
      await client.query(`CREATE INDEX IF NOT EXISTS "idx_${schemaName}_equip_maint_equipment" ON "${schemaName}"."equipment_maintenance"(equipment_id) WHERE is_deleted = FALSE`);
      await client.query(`CREATE INDEX IF NOT EXISTS "idx_${schemaName}_equip_maint_scheduled" ON "${schemaName}"."equipment_maintenance"(scheduled_date) WHERE is_deleted = FALSE AND status = 'scheduled'`);
      await client.query(`CREATE INDEX IF NOT EXISTS "idx_${schemaName}_equip_maint_branch" ON "${schemaName}"."equipment_maintenance"(branch_id) WHERE is_deleted = FALSE`);
      // Product categories
      await client.query(`CREATE INDEX IF NOT EXISTS "idx_${schemaName}_product_categories_branch" ON "${schemaName}"."product_categories"(branch_id) WHERE is_deleted = FALSE`);
      // Products
      await client.query(`CREATE INDEX IF NOT EXISTS "idx_${schemaName}_products_branch" ON "${schemaName}"."products"(branch_id) WHERE is_deleted = FALSE`);
      await client.query(`CREATE INDEX IF NOT EXISTS "idx_${schemaName}_products_category" ON "${schemaName}"."products"(category_id) WHERE is_deleted = FALSE`);
      await client.query(`CREATE INDEX IF NOT EXISTS "idx_${schemaName}_products_sku" ON "${schemaName}"."products"(sku) WHERE is_deleted = FALSE`);
      await client.query(`CREATE INDEX IF NOT EXISTS "idx_${schemaName}_products_barcode" ON "${schemaName}"."products"(barcode) WHERE is_deleted = FALSE`);
      await client.query(`CREATE INDEX IF NOT EXISTS "idx_${schemaName}_products_active" ON "${schemaName}"."products"(is_active) WHERE is_deleted = FALSE`);
      await client.query(`CREATE INDEX IF NOT EXISTS "idx_${schemaName}_products_low_stock" ON "${schemaName}"."products"(stock_quantity, low_stock_threshold) WHERE is_deleted = FALSE AND is_active = TRUE`);
      // Product sales
      await client.query(`CREATE INDEX IF NOT EXISTS "idx_${schemaName}_product_sales_branch" ON "${schemaName}"."product_sales"(branch_id) WHERE is_deleted = FALSE`);
      await client.query(`CREATE INDEX IF NOT EXISTS "idx_${schemaName}_product_sales_product" ON "${schemaName}"."product_sales"(product_id) WHERE is_deleted = FALSE`);
      await client.query(`CREATE INDEX IF NOT EXISTS "idx_${schemaName}_product_sales_user" ON "${schemaName}"."product_sales"(user_id) WHERE is_deleted = FALSE`);
      await client.query(`CREATE INDEX IF NOT EXISTS "idx_${schemaName}_product_sales_sold_at" ON "${schemaName}"."product_sales"(sold_at) WHERE is_deleted = FALSE`);
      // Campaign templates
      await client.query(`CREATE INDEX IF NOT EXISTS "idx_${schemaName}_campaign_templates_branch" ON "${schemaName}"."campaign_templates"(branch_id) WHERE is_deleted = FALSE`);
      await client.query(`CREATE INDEX IF NOT EXISTS "idx_${schemaName}_campaign_templates_type" ON "${schemaName}"."campaign_templates"(type) WHERE is_deleted = FALSE`);
      // Campaigns
      await client.query(`CREATE INDEX IF NOT EXISTS "idx_${schemaName}_campaigns_branch" ON "${schemaName}"."campaigns"(branch_id) WHERE is_deleted = FALSE`);
      await client.query(`CREATE INDEX IF NOT EXISTS "idx_${schemaName}_campaigns_status" ON "${schemaName}"."campaigns"(status) WHERE is_deleted = FALSE`);
      await client.query(`CREATE INDEX IF NOT EXISTS "idx_${schemaName}_campaigns_scheduled" ON "${schemaName}"."campaigns"(scheduled_at) WHERE is_deleted = FALSE AND status = 'scheduled'`);
      // Campaign recipients
      await client.query(`CREATE INDEX IF NOT EXISTS "idx_${schemaName}_campaign_recipients_campaign" ON "${schemaName}"."campaign_recipients"(campaign_id)`);
      await client.query(`CREATE INDEX IF NOT EXISTS "idx_${schemaName}_campaign_recipients_user" ON "${schemaName}"."campaign_recipients"(user_id)`);
      await client.query(`CREATE INDEX IF NOT EXISTS "idx_${schemaName}_campaign_recipients_status" ON "${schemaName}"."campaign_recipients"(campaign_id, status)`);
    } catch {
      // Indexes may already exist
    }
  }

  private async seedProductCategories(
    client: PoolClient,
    schemaName: string,
  ): Promise<void> {
    try {
      const existing = await client.query(
        `SELECT COUNT(*) as count FROM "${schemaName}"."product_categories" WHERE is_deleted = FALSE`,
      );
      if (parseInt(existing.rows[0].count) > 0) return;

      const categories = [
        { name: 'Supplements', description: 'Protein, pre-workout, vitamins', display_order: 1 },
        { name: 'Beverages', description: 'Water, energy drinks, shakes', display_order: 2 },
        { name: 'Apparel', description: 'T-shirts, shorts, gym wear', display_order: 3 },
        { name: 'Accessories', description: 'Gloves, bands, bottles', display_order: 4 },
        { name: 'Snacks', description: 'Protein bars, healthy snacks', display_order: 5 },
      ];

      for (const cat of categories) {
        await client.query(
          `INSERT INTO "${schemaName}"."product_categories" (name, description, display_order) VALUES ($1, $2, $3)`,
          [cat.name, cat.description, cat.display_order],
        );
      }
      this.logger.log(`Seeded product categories for ${schemaName}`);
    } catch (error) {
      this.logger.error(
        `Error seeding product categories for ${schemaName}:`,
        error instanceof Error ? error.message : String(error),
      );
    }
  }

  private async seedCampaignTemplates(
    client: PoolClient,
    schemaName: string,
  ): Promise<void> {
    try {
      const existing = await client.query(
        `SELECT COUNT(*) as count FROM "${schemaName}"."campaign_templates" WHERE is_deleted = FALSE`,
      );
      if (parseInt(existing.rows[0].count) > 0) return;

      const templates = [
        {
          name: 'Welcome New Member',
          type: 'email',
          subject: 'Welcome to {{gym_name}}!',
          content: '<h1>Welcome {{name}}!</h1><p>We are thrilled to have you join {{gym_name}}. Your fitness journey starts now!</p>',
          merge_fields: JSON.stringify({ '{{name}}': 'Member name', '{{email}}': 'Member email', '{{gym_name}}': 'Gym name' }),
        },
        {
          name: 'Membership Expiry Reminder',
          type: 'email',
          subject: 'Your membership at {{gym_name}} is expiring soon',
          content: '<h1>Hi {{name}}</h1><p>Your membership is expiring soon. Renew now to keep your fitness journey going!</p>',
          merge_fields: JSON.stringify({ '{{name}}': 'Member name', '{{gym_name}}': 'Gym name' }),
        },
        {
          name: 'Special Offer',
          type: 'email',
          subject: 'Exclusive Offer from {{gym_name}}',
          content: '<h1>Hi {{name}}</h1><p>We have a special offer just for you at {{gym_name}}!</p>',
          merge_fields: JSON.stringify({ '{{name}}': 'Member name', '{{gym_name}}': 'Gym name' }),
        },
      ];

      for (const tmpl of templates) {
        await client.query(
          `INSERT INTO "${schemaName}"."campaign_templates" (name, type, subject, content, merge_fields) VALUES ($1, $2, $3, $4, $5)`,
          [tmpl.name, tmpl.type, tmpl.subject, tmpl.content, tmpl.merge_fields],
        );
      }
      this.logger.log(`Seeded campaign templates for ${schemaName}`);
    } catch (error) {
      this.logger.error(
        `Error seeding campaign templates for ${schemaName}:`,
        error instanceof Error ? error.message : String(error),
      );
    }
  }

  // ═══════════════════════════════════════════════════════════════════
  //  PHASE 5: Custom Fields, Surveys, Engagement, Gamification,
  //           Loyalty, Wearables, Currencies
  // ═══════════════════════════════════════════════════════════════════

  private async createPhase5Tables(
    client: PoolClient,
    schemaName: string,
  ): Promise<void> {
    // ─── 1. Custom Fields System ───

    await client.query(`
      CREATE TABLE IF NOT EXISTS "${schemaName}"."custom_fields" (
        id SERIAL PRIMARY KEY,
        branch_id INTEGER,
        entity_type VARCHAR(30) NOT NULL DEFAULT 'user',
        name VARCHAR(100) NOT NULL,
        label VARCHAR(200) NOT NULL,
        field_type VARCHAR(30) NOT NULL,
        options JSONB,
        default_value TEXT,
        is_required BOOLEAN DEFAULT FALSE,
        is_active BOOLEAN DEFAULT TRUE,
        visibility VARCHAR(20) DEFAULT 'all',
        display_order INTEGER DEFAULT 0,
        validation_rules JSONB,
        is_deleted BOOLEAN DEFAULT FALSE,
        deleted_at TIMESTAMP,
        created_by INTEGER NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS "${schemaName}"."custom_field_values" (
        id SERIAL PRIMARY KEY,
        custom_field_id INTEGER NOT NULL REFERENCES "${schemaName}"."custom_fields"(id) ON DELETE CASCADE,
        entity_id INTEGER NOT NULL,
        value TEXT,
        file_url TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(custom_field_id, entity_id)
      )
    `);

    // ─── 2. NPS & Member Surveys ───

    await client.query(`
      CREATE TABLE IF NOT EXISTS "${schemaName}"."surveys" (
        id SERIAL PRIMARY KEY,
        branch_id INTEGER,
        title VARCHAR(200) NOT NULL,
        description TEXT,
        type VARCHAR(30) NOT NULL DEFAULT 'custom',
        status VARCHAR(20) NOT NULL DEFAULT 'draft',
        is_anonymous BOOLEAN DEFAULT FALSE,
        trigger_type VARCHAR(30),
        trigger_config JSONB,
        start_date TIMESTAMP,
        end_date TIMESTAMP,
        created_by INTEGER NOT NULL,
        is_deleted BOOLEAN DEFAULT FALSE,
        deleted_at TIMESTAMP,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS "${schemaName}"."survey_questions" (
        id SERIAL PRIMARY KEY,
        survey_id INTEGER NOT NULL REFERENCES "${schemaName}"."surveys"(id) ON DELETE CASCADE,
        question_text TEXT NOT NULL,
        question_type VARCHAR(30) NOT NULL,
        options JSONB,
        is_required BOOLEAN DEFAULT TRUE,
        display_order INTEGER DEFAULT 0,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS "${schemaName}"."survey_responses" (
        id SERIAL PRIMARY KEY,
        survey_id INTEGER NOT NULL REFERENCES "${schemaName}"."surveys"(id) ON DELETE CASCADE,
        user_id INTEGER,
        submitted_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS "${schemaName}"."survey_answers" (
        id SERIAL PRIMARY KEY,
        response_id INTEGER NOT NULL REFERENCES "${schemaName}"."survey_responses"(id) ON DELETE CASCADE,
        question_id INTEGER NOT NULL REFERENCES "${schemaName}"."survey_questions"(id) ON DELETE CASCADE,
        answer_text TEXT,
        answer_numeric NUMERIC(5,2),
        answer_choices JSONB,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // ─── 3. Engagement Scoring & Churn Prediction ───

    await client.query(`
      CREATE TABLE IF NOT EXISTS "${schemaName}"."engagement_scores" (
        id SERIAL PRIMARY KEY,
        branch_id INTEGER,
        user_id INTEGER NOT NULL,
        overall_score NUMERIC(5,2) NOT NULL DEFAULT 0,
        risk_level VARCHAR(10) NOT NULL DEFAULT 'low',
        visit_frequency_score NUMERIC(5,2) DEFAULT 0,
        visit_recency_score NUMERIC(5,2) DEFAULT 0,
        attendance_trend_score NUMERIC(5,2) DEFAULT 0,
        payment_reliability_score NUMERIC(5,2) DEFAULT 0,
        membership_tenure_score NUMERIC(5,2) DEFAULT 0,
        engagement_depth_score NUMERIC(5,2) DEFAULT 0,
        factors JSONB NOT NULL DEFAULT '{}',
        is_current BOOLEAN DEFAULT TRUE,
        calculated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS "${schemaName}"."churn_alerts" (
        id SERIAL PRIMARY KEY,
        branch_id INTEGER,
        user_id INTEGER NOT NULL,
        risk_level VARCHAR(10) NOT NULL,
        previous_risk_level VARCHAR(10),
        alert_type VARCHAR(30) NOT NULL,
        message TEXT NOT NULL,
        factors JSONB,
        is_acknowledged BOOLEAN DEFAULT FALSE,
        acknowledged_by INTEGER,
        acknowledged_at TIMESTAMP,
        action_taken TEXT,
        is_deleted BOOLEAN DEFAULT FALSE,
        deleted_at TIMESTAMP,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // ─── 4. Challenges & Gamification ───

    await client.query(`
      CREATE TABLE IF NOT EXISTS "${schemaName}"."challenges" (
        id SERIAL PRIMARY KEY,
        branch_id INTEGER,
        title VARCHAR(200) NOT NULL,
        description TEXT,
        type VARCHAR(30) NOT NULL,
        metric VARCHAR(50),
        goal_value NUMERIC(10,2),
        goal_direction VARCHAR(10) DEFAULT 'increase',
        start_date DATE NOT NULL,
        end_date DATE NOT NULL,
        max_participants INTEGER,
        points_reward INTEGER DEFAULT 0,
        badge_name VARCHAR(100),
        badge_icon VARCHAR(100),
        status VARCHAR(20) NOT NULL DEFAULT 'draft',
        rules JSONB,
        created_by INTEGER NOT NULL,
        is_deleted BOOLEAN DEFAULT FALSE,
        deleted_at TIMESTAMP,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS "${schemaName}"."challenge_participants" (
        id SERIAL PRIMARY KEY,
        challenge_id INTEGER NOT NULL REFERENCES "${schemaName}"."challenges"(id) ON DELETE CASCADE,
        user_id INTEGER NOT NULL,
        start_value NUMERIC(10,2),
        current_value NUMERIC(10,2),
        progress_pct NUMERIC(5,2) DEFAULT 0,
        rank INTEGER,
        points_earned INTEGER DEFAULT 0,
        status VARCHAR(20) NOT NULL DEFAULT 'active',
        completed_at TIMESTAMP,
        joined_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(challenge_id, user_id)
      )
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS "${schemaName}"."achievements" (
        id SERIAL PRIMARY KEY,
        branch_id INTEGER,
        name VARCHAR(100) NOT NULL,
        description TEXT,
        icon VARCHAR(100),
        category VARCHAR(30) NOT NULL,
        criteria JSONB NOT NULL,
        points_value INTEGER DEFAULT 0,
        is_active BOOLEAN DEFAULT TRUE,
        is_deleted BOOLEAN DEFAULT FALSE,
        deleted_at TIMESTAMP,
        created_by INTEGER,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS "${schemaName}"."user_achievements" (
        id SERIAL PRIMARY KEY,
        user_id INTEGER NOT NULL,
        achievement_id INTEGER NOT NULL REFERENCES "${schemaName}"."achievements"(id) ON DELETE CASCADE,
        earned_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        challenge_id INTEGER REFERENCES "${schemaName}"."challenges"(id) ON DELETE SET NULL,
        points_earned INTEGER DEFAULT 0,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(user_id, achievement_id)
      )
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS "${schemaName}"."streaks" (
        id SERIAL PRIMARY KEY,
        user_id INTEGER NOT NULL,
        streak_type VARCHAR(30) NOT NULL,
        current_count INTEGER NOT NULL DEFAULT 0,
        longest_count INTEGER NOT NULL DEFAULT 0,
        last_activity_date DATE,
        streak_start_date DATE,
        is_active BOOLEAN DEFAULT TRUE,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(user_id, streak_type)
      )
    `);

    // ─── 5. Loyalty / Rewards Program ───

    await client.query(`
      CREATE TABLE IF NOT EXISTS "${schemaName}"."loyalty_config" (
        id SERIAL PRIMARY KEY,
        branch_id INTEGER,
        is_enabled BOOLEAN DEFAULT TRUE,
        points_per_visit INTEGER DEFAULT 10,
        points_per_referral INTEGER DEFAULT 100,
        points_per_purchase_unit NUMERIC(5,2) DEFAULT 1,
        points_per_class_booking INTEGER DEFAULT 5,
        point_expiry_days INTEGER DEFAULT 365,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS "${schemaName}"."loyalty_tiers" (
        id SERIAL PRIMARY KEY,
        branch_id INTEGER,
        name VARCHAR(50) NOT NULL,
        min_points INTEGER NOT NULL DEFAULT 0,
        multiplier NUMERIC(3,2) DEFAULT 1.00,
        benefits JSONB,
        icon VARCHAR(100),
        color VARCHAR(20),
        display_order INTEGER DEFAULT 0,
        is_active BOOLEAN DEFAULT TRUE,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS "${schemaName}"."loyalty_points" (
        id SERIAL PRIMARY KEY,
        user_id INTEGER NOT NULL UNIQUE,
        total_earned INTEGER NOT NULL DEFAULT 0,
        total_redeemed INTEGER NOT NULL DEFAULT 0,
        current_balance INTEGER NOT NULL DEFAULT 0,
        tier_id INTEGER REFERENCES "${schemaName}"."loyalty_tiers"(id) ON DELETE SET NULL,
        tier_updated_at TIMESTAMP,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS "${schemaName}"."loyalty_transactions" (
        id SERIAL PRIMARY KEY,
        user_id INTEGER NOT NULL,
        type VARCHAR(10) NOT NULL,
        points INTEGER NOT NULL,
        balance_after INTEGER NOT NULL,
        source VARCHAR(30) NOT NULL,
        reference_type VARCHAR(30),
        reference_id INTEGER,
        description TEXT,
        expires_at TIMESTAMP,
        created_by INTEGER,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS "${schemaName}"."loyalty_rewards" (
        id SERIAL PRIMARY KEY,
        branch_id INTEGER,
        name VARCHAR(200) NOT NULL,
        description TEXT,
        points_cost INTEGER NOT NULL,
        reward_type VARCHAR(30) NOT NULL,
        reward_value JSONB,
        stock INTEGER,
        max_per_user INTEGER,
        is_active BOOLEAN DEFAULT TRUE,
        is_deleted BOOLEAN DEFAULT FALSE,
        deleted_at TIMESTAMP,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // ─── 6. Wearable Integration ───

    await client.query(`
      CREATE TABLE IF NOT EXISTS "${schemaName}"."wearable_connections" (
        id SERIAL PRIMARY KEY,
        user_id INTEGER NOT NULL,
        provider VARCHAR(30) NOT NULL,
        access_token TEXT,
        refresh_token TEXT,
        token_expires_at TIMESTAMP,
        provider_user_id VARCHAR(200),
        scopes TEXT,
        is_active BOOLEAN DEFAULT TRUE,
        last_synced_at TIMESTAMP,
        sync_error TEXT,
        connected_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        disconnected_at TIMESTAMP,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(user_id, provider)
      )
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS "${schemaName}"."wearable_data" (
        id SERIAL PRIMARY KEY,
        user_id INTEGER NOT NULL,
        provider VARCHAR(30) NOT NULL,
        data_type VARCHAR(30) NOT NULL,
        value NUMERIC(10,2) NOT NULL,
        unit VARCHAR(20),
        recorded_at TIMESTAMP NOT NULL,
        recorded_date DATE NOT NULL,
        metadata JSONB,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(user_id, provider, data_type, recorded_date)
      )
    `);

    // ─── 7. Multi-Currency Support ───

    await client.query(`
      CREATE TABLE IF NOT EXISTS "${schemaName}"."currencies" (
        id SERIAL PRIMARY KEY,
        code VARCHAR(3) NOT NULL UNIQUE,
        name VARCHAR(50) NOT NULL,
        symbol VARCHAR(10) NOT NULL,
        decimal_places INTEGER DEFAULT 2,
        is_active BOOLEAN DEFAULT TRUE,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS "${schemaName}"."exchange_rates" (
        id SERIAL PRIMARY KEY,
        from_currency VARCHAR(3) NOT NULL,
        to_currency VARCHAR(3) NOT NULL,
        rate NUMERIC(15,6) NOT NULL,
        source VARCHAR(30) DEFAULT 'manual',
        effective_date DATE NOT NULL DEFAULT CURRENT_DATE,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(from_currency, to_currency, effective_date)
      )
    `);

    // ─── Phase 5 Indexes ───
    try {
      // Custom Fields
      await client.query(`CREATE INDEX IF NOT EXISTS "idx_${schemaName}_custom_fields_entity_type" ON "${schemaName}"."custom_fields"(entity_type) WHERE is_deleted = FALSE`);
      await client.query(`CREATE INDEX IF NOT EXISTS "idx_${schemaName}_custom_fields_branch" ON "${schemaName}"."custom_fields"(branch_id) WHERE is_deleted = FALSE`);
      await client.query(`CREATE INDEX IF NOT EXISTS "idx_${schemaName}_custom_field_values_field" ON "${schemaName}"."custom_field_values"(custom_field_id)`);
      await client.query(`CREATE INDEX IF NOT EXISTS "idx_${schemaName}_custom_field_values_entity" ON "${schemaName}"."custom_field_values"(entity_id)`);
      await client.query(`CREATE INDEX IF NOT EXISTS "idx_${schemaName}_custom_field_values_composite" ON "${schemaName}"."custom_field_values"(custom_field_id, entity_id)`);
      // Surveys
      await client.query(`CREATE INDEX IF NOT EXISTS "idx_${schemaName}_surveys_branch" ON "${schemaName}"."surveys"(branch_id) WHERE is_deleted = FALSE`);
      await client.query(`CREATE INDEX IF NOT EXISTS "idx_${schemaName}_surveys_status" ON "${schemaName}"."surveys"(status) WHERE is_deleted = FALSE`);
      await client.query(`CREATE INDEX IF NOT EXISTS "idx_${schemaName}_surveys_type" ON "${schemaName}"."surveys"(type) WHERE is_deleted = FALSE`);
      await client.query(`CREATE INDEX IF NOT EXISTS "idx_${schemaName}_survey_questions_survey" ON "${schemaName}"."survey_questions"(survey_id)`);
      await client.query(`CREATE INDEX IF NOT EXISTS "idx_${schemaName}_survey_responses_survey" ON "${schemaName}"."survey_responses"(survey_id)`);
      await client.query(`CREATE INDEX IF NOT EXISTS "idx_${schemaName}_survey_responses_user" ON "${schemaName}"."survey_responses"(user_id)`);
      await client.query(`CREATE INDEX IF NOT EXISTS "idx_${schemaName}_survey_answers_response" ON "${schemaName}"."survey_answers"(response_id)`);
      await client.query(`CREATE INDEX IF NOT EXISTS "idx_${schemaName}_survey_answers_question" ON "${schemaName}"."survey_answers"(question_id)`);
      // Engagement Scores
      await client.query(`CREATE INDEX IF NOT EXISTS "idx_${schemaName}_engagement_scores_user" ON "${schemaName}"."engagement_scores"(user_id) WHERE is_current = TRUE`);
      await client.query(`CREATE INDEX IF NOT EXISTS "idx_${schemaName}_engagement_scores_risk" ON "${schemaName}"."engagement_scores"(risk_level) WHERE is_current = TRUE`);
      await client.query(`CREATE INDEX IF NOT EXISTS "idx_${schemaName}_engagement_scores_branch" ON "${schemaName}"."engagement_scores"(branch_id) WHERE is_current = TRUE`);
      await client.query(`CREATE INDEX IF NOT EXISTS "idx_${schemaName}_engagement_scores_score" ON "${schemaName}"."engagement_scores"(overall_score) WHERE is_current = TRUE`);
      // Churn Alerts
      await client.query(`CREATE INDEX IF NOT EXISTS "idx_${schemaName}_churn_alerts_user" ON "${schemaName}"."churn_alerts"(user_id) WHERE is_deleted = FALSE`);
      await client.query(`CREATE INDEX IF NOT EXISTS "idx_${schemaName}_churn_alerts_risk" ON "${schemaName}"."churn_alerts"(risk_level) WHERE is_deleted = FALSE AND is_acknowledged = FALSE`);
      await client.query(`CREATE INDEX IF NOT EXISTS "idx_${schemaName}_churn_alerts_branch" ON "${schemaName}"."churn_alerts"(branch_id) WHERE is_deleted = FALSE`);
      // Challenges
      await client.query(`CREATE INDEX IF NOT EXISTS "idx_${schemaName}_challenges_branch" ON "${schemaName}"."challenges"(branch_id) WHERE is_deleted = FALSE`);
      await client.query(`CREATE INDEX IF NOT EXISTS "idx_${schemaName}_challenges_status" ON "${schemaName}"."challenges"(status) WHERE is_deleted = FALSE`);
      await client.query(`CREATE INDEX IF NOT EXISTS "idx_${schemaName}_challenges_dates" ON "${schemaName}"."challenges"(start_date, end_date) WHERE is_deleted = FALSE`);
      await client.query(`CREATE INDEX IF NOT EXISTS "idx_${schemaName}_challenge_parts_challenge" ON "${schemaName}"."challenge_participants"(challenge_id)`);
      await client.query(`CREATE INDEX IF NOT EXISTS "idx_${schemaName}_challenge_parts_user" ON "${schemaName}"."challenge_participants"(user_id)`);
      await client.query(`CREATE INDEX IF NOT EXISTS "idx_${schemaName}_challenge_parts_rank" ON "${schemaName}"."challenge_participants"(challenge_id, rank) WHERE status = 'active'`);
      // Achievements
      await client.query(`CREATE INDEX IF NOT EXISTS "idx_${schemaName}_achievements_branch" ON "${schemaName}"."achievements"(branch_id) WHERE is_deleted = FALSE`);
      await client.query(`CREATE INDEX IF NOT EXISTS "idx_${schemaName}_achievements_category" ON "${schemaName}"."achievements"(category) WHERE is_deleted = FALSE`);
      await client.query(`CREATE INDEX IF NOT EXISTS "idx_${schemaName}_user_achievements_user" ON "${schemaName}"."user_achievements"(user_id)`);
      await client.query(`CREATE INDEX IF NOT EXISTS "idx_${schemaName}_user_achievements_achievement" ON "${schemaName}"."user_achievements"(achievement_id)`);
      // Streaks
      await client.query(`CREATE INDEX IF NOT EXISTS "idx_${schemaName}_streaks_user" ON "${schemaName}"."streaks"(user_id)`);
      await client.query(`CREATE INDEX IF NOT EXISTS "idx_${schemaName}_streaks_type" ON "${schemaName}"."streaks"(streak_type, is_active)`);
      // Loyalty
      await client.query(`CREATE INDEX IF NOT EXISTS "idx_${schemaName}_loyalty_points_user" ON "${schemaName}"."loyalty_points"(user_id)`);
      await client.query(`CREATE INDEX IF NOT EXISTS "idx_${schemaName}_loyalty_points_tier" ON "${schemaName}"."loyalty_points"(tier_id)`);
      await client.query(`CREATE INDEX IF NOT EXISTS "idx_${schemaName}_loyalty_transactions_user" ON "${schemaName}"."loyalty_transactions"(user_id)`);
      await client.query(`CREATE INDEX IF NOT EXISTS "idx_${schemaName}_loyalty_transactions_type" ON "${schemaName}"."loyalty_transactions"(type)`);
      await client.query(`CREATE INDEX IF NOT EXISTS "idx_${schemaName}_loyalty_transactions_source" ON "${schemaName}"."loyalty_transactions"(source)`);
      await client.query(`CREATE INDEX IF NOT EXISTS "idx_${schemaName}_loyalty_transactions_created" ON "${schemaName}"."loyalty_transactions"(created_at DESC)`);
      await client.query(`CREATE INDEX IF NOT EXISTS "idx_${schemaName}_loyalty_rewards_branch" ON "${schemaName}"."loyalty_rewards"(branch_id) WHERE is_deleted = FALSE`);
      await client.query(`CREATE INDEX IF NOT EXISTS "idx_${schemaName}_loyalty_rewards_active" ON "${schemaName}"."loyalty_rewards"(is_active) WHERE is_deleted = FALSE`);
      await client.query(`CREATE INDEX IF NOT EXISTS "idx_${schemaName}_loyalty_tiers_branch" ON "${schemaName}"."loyalty_tiers"(branch_id)`);
      await client.query(`CREATE INDEX IF NOT EXISTS "idx_${schemaName}_loyalty_tiers_points" ON "${schemaName}"."loyalty_tiers"(min_points)`);
      // Wearables
      await client.query(`CREATE INDEX IF NOT EXISTS "idx_${schemaName}_wearable_conn_user" ON "${schemaName}"."wearable_connections"(user_id)`);
      await client.query(`CREATE INDEX IF NOT EXISTS "idx_${schemaName}_wearable_conn_provider" ON "${schemaName}"."wearable_connections"(provider, is_active)`);
      await client.query(`CREATE INDEX IF NOT EXISTS "idx_${schemaName}_wearable_data_user" ON "${schemaName}"."wearable_data"(user_id)`);
      await client.query(`CREATE INDEX IF NOT EXISTS "idx_${schemaName}_wearable_data_type_date" ON "${schemaName}"."wearable_data"(user_id, data_type, recorded_date)`);
      await client.query(`CREATE INDEX IF NOT EXISTS "idx_${schemaName}_wearable_data_provider" ON "${schemaName}"."wearable_data"(provider)`);
      await client.query(`CREATE INDEX IF NOT EXISTS "idx_${schemaName}_wearable_data_date" ON "${schemaName}"."wearable_data"(recorded_date)`);
      // Currencies
      await client.query(`CREATE INDEX IF NOT EXISTS "idx_${schemaName}_exchange_rates_pair" ON "${schemaName}"."exchange_rates"(from_currency, to_currency)`);
      await client.query(`CREATE INDEX IF NOT EXISTS "idx_${schemaName}_exchange_rates_date" ON "${schemaName}"."exchange_rates"(effective_date DESC)`);
    } catch {
      // Indexes may already exist
    }
  }

  private async seedDefaultCurrencies(
    client: PoolClient,
    schemaName: string,
  ): Promise<void> {
    try {
      const existing = await client.query(
        `SELECT COUNT(*) as count FROM "${schemaName}"."currencies"`,
      );
      if (parseInt(existing.rows[0].count) > 0) return;

      const currencies = [
        { code: 'INR', name: 'Indian Rupee', symbol: '₹', decimal_places: 2 },
        { code: 'USD', name: 'US Dollar', symbol: '$', decimal_places: 2 },
        { code: 'EUR', name: 'Euro', symbol: '€', decimal_places: 2 },
        { code: 'GBP', name: 'British Pound', symbol: '£', decimal_places: 2 },
        { code: 'AED', name: 'UAE Dirham', symbol: 'د.إ', decimal_places: 2 },
        { code: 'SAR', name: 'Saudi Riyal', symbol: '﷼', decimal_places: 2 },
        { code: 'AUD', name: 'Australian Dollar', symbol: 'A$', decimal_places: 2 },
        { code: 'CAD', name: 'Canadian Dollar', symbol: 'C$', decimal_places: 2 },
      ];

      for (const cur of currencies) {
        await client.query(
          `INSERT INTO "${schemaName}"."currencies" (code, name, symbol, decimal_places) VALUES ($1, $2, $3, $4)`,
          [cur.code, cur.name, cur.symbol, cur.decimal_places],
        );
      }
      this.logger.log(`Seeded currencies for ${schemaName}`);
    } catch (error) {
      this.logger.error(
        `Error seeding currencies for ${schemaName}:`,
        error instanceof Error ? error.message : String(error),
      );
    }
  }

  private async seedDefaultLoyaltyTiers(
    client: PoolClient,
    schemaName: string,
  ): Promise<void> {
    try {
      const existing = await client.query(
        `SELECT COUNT(*) as count FROM "${schemaName}"."loyalty_tiers"`,
      );
      if (parseInt(existing.rows[0].count) > 0) return;

      const tiers = [
        { name: 'Bronze', min_points: 0, multiplier: 1.00, color: '#CD7F32', display_order: 1, benefits: '{"discount_pct":0}' },
        { name: 'Silver', min_points: 500, multiplier: 1.25, color: '#C0C0C0', display_order: 2, benefits: '{"discount_pct":5}' },
        { name: 'Gold', min_points: 2000, multiplier: 1.50, color: '#FFD700', display_order: 3, benefits: '{"discount_pct":10,"priority_booking":true}' },
        { name: 'Platinum', min_points: 5000, multiplier: 2.00, color: '#E5E4E2', display_order: 4, benefits: '{"discount_pct":15,"priority_booking":true,"free_guest_passes":2}' },
      ];

      for (const tier of tiers) {
        await client.query(
          `INSERT INTO "${schemaName}"."loyalty_tiers" (name, min_points, multiplier, color, display_order, benefits) VALUES ($1, $2, $3, $4, $5, $6)`,
          [tier.name, tier.min_points, tier.multiplier, tier.color, tier.display_order, tier.benefits],
        );
      }
      this.logger.log(`Seeded loyalty tiers for ${schemaName}`);
    } catch (error) {
      this.logger.error(
        `Error seeding loyalty tiers for ${schemaName}:`,
        error instanceof Error ? error.message : String(error),
      );
    }
  }

  private async seedDefaultAchievements(
    client: PoolClient,
    schemaName: string,
  ): Promise<void> {
    try {
      const existing = await client.query(
        `SELECT COUNT(*) as count FROM "${schemaName}"."achievements" WHERE is_deleted = FALSE`,
      );
      if (parseInt(existing.rows[0].count) > 0) return;

      const achievements = [
        { name: 'First Step', description: 'Complete your first gym visit', icon: 'footprints', category: 'milestone', criteria: '{"type":"visit_count","threshold":1}', points_value: 10 },
        { name: 'Week Warrior', description: 'Visit 7 days in a row', icon: 'flame', category: 'attendance', criteria: '{"type":"daily_streak","threshold":7}', points_value: 50 },
        { name: 'Month Master', description: 'Visit 30 days in a row', icon: 'trophy', category: 'attendance', criteria: '{"type":"daily_streak","threshold":30}', points_value: 200 },
        { name: 'Century Club', description: 'Complete 100 total visits', icon: 'star', category: 'milestone', criteria: '{"type":"visit_count","threshold":100}', points_value: 500 },
        { name: 'Social Butterfly', description: 'Refer 3 friends who sign up', icon: 'users', category: 'social', criteria: '{"type":"referral_count","threshold":3}', points_value: 150 },
        { name: 'Goal Getter', description: 'Achieve your first fitness goal', icon: 'target', category: 'milestone', criteria: '{"type":"goal_achieved","threshold":1}', points_value: 100 },
      ];

      for (const ach of achievements) {
        await client.query(
          `INSERT INTO "${schemaName}"."achievements" (name, description, icon, category, criteria, points_value, created_by) VALUES ($1, $2, $3, $4, $5, $6, 0)`,
          [ach.name, ach.description, ach.icon, ach.category, ach.criteria, ach.points_value],
        );
      }
      this.logger.log(`Seeded default achievements for ${schemaName}`);
    } catch (error) {
      this.logger.error(
        `Error seeding achievements for ${schemaName}:`,
        error instanceof Error ? error.message : String(error),
      );
    }
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
