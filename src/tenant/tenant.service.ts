import { Injectable, OnModuleInit } from '@nestjs/common';
import { Pool } from 'pg';

@Injectable()
export class TenantService implements OnModuleInit {
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
    console.log('TenantService initialized');
    // Run migrations to ensure all tenant schemas have required columns
    await this.migrateAllTenantSchemas();
  }

  /**
   * Run migrations on all tenant schemas to add missing columns
   */
  async migrateAllTenantSchemas(): Promise<void> {
    const client = await this.pool.connect();
    try {
      // Get all tenant schemas
      const schemasResult = await client.query(`
        SELECT schema_name FROM information_schema.schemata
        WHERE schema_name LIKE 'tenant_%'
      `);

      console.log(`Found ${schemasResult.rows.length} tenant schemas to migrate`);

      for (const row of schemasResult.rows) {
        const schemaName = row.schema_name;
        try {
          await this.migrateTenantSchema(client, schemaName);
        } catch (error) {
          console.error(`Failed to migrate schema ${schemaName}:`, error.message);
        }
      }

      console.log('Tenant schema migrations completed');
    } finally {
      client.release();
    }
  }

  /**
   * Apply migrations to a single tenant schema
   */
  private async migrateTenantSchema(client: any, schemaName: string): Promise<void> {
    console.log(`Migrating schema: ${schemaName}`);

    // Always try to add the role column (IF NOT EXISTS handles the case where it already exists)
    try {
      await client.query(`
        ALTER TABLE "${schemaName}".users
        ADD COLUMN IF NOT EXISTS role VARCHAR(50) NOT NULL DEFAULT 'client'
      `);
      console.log(`Ensured 'role' column exists in ${schemaName}.users`);
    } catch (error) {
      console.error(`Error adding role column to ${schemaName}:`, error.message);
    }

    // Add branch_id columns to all tenant tables
    await this.addBranchIdColumns(client, schemaName);

    // Create facilities and amenities tables if they don't exist
    await this.createFacilitiesAndAmenitiesTables(client, schemaName);

    // Create membership_facilities and membership_amenities junction tables
    await this.createMembershipFacilityTables(client, schemaName);

    // Seed default plans if none exist
    try {
      const plansResult = await client.query(`SELECT COUNT(*) as count FROM "${schemaName}".plans`);
      if (parseInt(plansResult.rows[0].count) === 0) {
        await this.seedDefaultPlans(client, schemaName);
      }
    } catch (error) {
      console.error(`Error seeding plans for ${schemaName}:`, error.message);
    }
  }

  /**
   * Add branch_id columns to existing tenant tables (migration for multi-branch support)
   */
  private async addBranchIdColumns(client: any, schemaName: string): Promise<void> {
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
        await client.query(`
          ALTER TABLE "${schemaName}"."${table}"
          ADD COLUMN IF NOT EXISTS branch_id INTEGER
        `);
        console.log(`Ensured 'branch_id' column exists in ${schemaName}.${table}`);
      } catch (error) {
        console.error(`Error adding branch_id to ${schemaName}.${table}:`, error.message);
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
        console.error(`Error creating index for ${schemaName}:`, error.message);
      }
    }
    console.log(`Created branch_id indexes for ${schemaName}`);
  }

  /**
   * Create facilities and amenities tables if they don't exist (migration for existing tenants)
   */
  private async createFacilitiesAndAmenitiesTables(client: any, schemaName: string): Promise<void> {
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
      await client.query(`CREATE INDEX IF NOT EXISTS "idx_${schemaName}_facilities_branch" ON "${schemaName}"."facilities"(branch_id)`);
      await client.query(`CREATE INDEX IF NOT EXISTS "idx_${schemaName}_facilities_code" ON "${schemaName}"."facilities"(code)`);
      await client.query(`CREATE INDEX IF NOT EXISTS "idx_${schemaName}_facilities_active" ON "${schemaName}"."facilities"(is_active)`);
      console.log(`Ensured 'facilities' table exists in ${schemaName}`);
    } catch (error) {
      console.error(`Error creating facilities table for ${schemaName}:`, error.message);
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
      await client.query(`CREATE INDEX IF NOT EXISTS "idx_${schemaName}_amenities_branch" ON "${schemaName}"."amenities"(branch_id)`);
      await client.query(`CREATE INDEX IF NOT EXISTS "idx_${schemaName}_amenities_code" ON "${schemaName}"."amenities"(code)`);
      await client.query(`CREATE INDEX IF NOT EXISTS "idx_${schemaName}_amenities_active" ON "${schemaName}"."amenities"(is_active)`);
      console.log(`Ensured 'amenities' table exists in ${schemaName}`);
    } catch (error) {
      console.error(`Error creating amenities table for ${schemaName}:`, error.message);
    }
  }

  /**
   * Create membership_facilities and membership_amenities junction tables (migration for existing tenants)
   */
  private async createMembershipFacilityTables(client: any, schemaName: string): Promise<void> {
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
      await client.query(`CREATE INDEX IF NOT EXISTS "idx_${schemaName}_membership_facilities_membership" ON "${schemaName}"."membership_facilities"(membership_id)`);
      await client.query(`CREATE INDEX IF NOT EXISTS "idx_${schemaName}_membership_facilities_facility" ON "${schemaName}"."membership_facilities"(facility_id)`);
      console.log(`Ensured 'membership_facilities' table exists in ${schemaName}`);
    } catch (error) {
      console.error(`Error creating membership_facilities table for ${schemaName}:`, error.message);
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
      await client.query(`CREATE INDEX IF NOT EXISTS "idx_${schemaName}_membership_amenities_membership" ON "${schemaName}"."membership_amenities"(membership_id)`);
      await client.query(`CREATE INDEX IF NOT EXISTS "idx_${schemaName}_membership_amenities_amenity" ON "${schemaName}"."membership_amenities"(amenity_id)`);
      console.log(`Ensured 'membership_amenities' table exists in ${schemaName}`);
    } catch (error) {
      console.error(`Error creating membership_amenities table for ${schemaName}:`, error.message);
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
      console.log(`Created tenant schema: ${schemaName}`);
    } catch (error) {
      await client.query('ROLLBACK');
      console.error(`Failed to create tenant schema ${schemaName}:`, error);
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
  private async createTenantTables(client: any, schemaName: string): Promise<void> {
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
        email_verified BOOLEAN DEFAULT false,
        attendance_code VARCHAR(20) UNIQUE,
        join_date TIMESTAMP,
        last_login_at TIMESTAMP,
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

    // Create indexes for better query performance
    await this.createTenantIndexes(client, schemaName);
  }

  /**
   * Create indexes for tenant tables
   */
  private async createTenantIndexes(client: any, schemaName: string): Promise<void> {
    // Users indexes
    await client.query(`CREATE INDEX IF NOT EXISTS "idx_${schemaName}_users_email" ON "${schemaName}"."users"(email)`);
    await client.query(`CREATE INDEX IF NOT EXISTS "idx_${schemaName}_users_role" ON "${schemaName}"."users"(role)`);
    await client.query(`CREATE INDEX IF NOT EXISTS "idx_${schemaName}_users_status" ON "${schemaName}"."users"(status)`);
    await client.query(`CREATE INDEX IF NOT EXISTS "idx_${schemaName}_users_attendance_code" ON "${schemaName}"."users"(attendance_code)`);
    await client.query(`CREATE INDEX IF NOT EXISTS "idx_${schemaName}_users_branch" ON "${schemaName}"."users"(branch_id)`);

    // Plans indexes
    await client.query(`CREATE INDEX IF NOT EXISTS "idx_${schemaName}_plans_branch" ON "${schemaName}"."plans"(branch_id)`);

    // Offers indexes
    await client.query(`CREATE INDEX IF NOT EXISTS "idx_${schemaName}_offers_branch" ON "${schemaName}"."offers"(branch_id)`);

    // Memberships indexes
    await client.query(`CREATE INDEX IF NOT EXISTS "idx_${schemaName}_memberships_user" ON "${schemaName}"."memberships"(user_id)`);
    await client.query(`CREATE INDEX IF NOT EXISTS "idx_${schemaName}_memberships_status" ON "${schemaName}"."memberships"(status)`);
    await client.query(`CREATE INDEX IF NOT EXISTS "idx_${schemaName}_memberships_dates" ON "${schemaName}"."memberships"(start_date, end_date)`);
    await client.query(`CREATE INDEX IF NOT EXISTS "idx_${schemaName}_memberships_branch" ON "${schemaName}"."memberships"(branch_id)`);

    // Attendance indexes
    await client.query(`CREATE INDEX IF NOT EXISTS "idx_${schemaName}_attendance_user" ON "${schemaName}"."attendance"(user_id)`);
    await client.query(`CREATE INDEX IF NOT EXISTS "idx_${schemaName}_attendance_date" ON "${schemaName}"."attendance"(date)`);
    await client.query(`CREATE INDEX IF NOT EXISTS "idx_${schemaName}_attendance_marked_by" ON "${schemaName}"."attendance"(marked_by)`);
    await client.query(`CREATE INDEX IF NOT EXISTS "idx_${schemaName}_attendance_branch" ON "${schemaName}"."attendance"(branch_id)`);

    // Attendance history indexes
    await client.query(`CREATE INDEX IF NOT EXISTS "idx_${schemaName}_attendance_history_user" ON "${schemaName}"."attendance_history"(user_id)`);
    await client.query(`CREATE INDEX IF NOT EXISTS "idx_${schemaName}_attendance_history_date" ON "${schemaName}"."attendance_history"(date)`);
    await client.query(`CREATE INDEX IF NOT EXISTS "idx_${schemaName}_attendance_history_branch" ON "${schemaName}"."attendance_history"(branch_id)`);

    // Membership history indexes
    await client.query(`CREATE INDEX IF NOT EXISTS "idx_${schemaName}_membership_history_branch" ON "${schemaName}"."membership_history"(branch_id)`);

    // Body metrics indexes
    await client.query(`CREATE INDEX IF NOT EXISTS "idx_${schemaName}_body_metrics_branch" ON "${schemaName}"."body_metrics"(branch_id)`);
    await client.query(`CREATE INDEX IF NOT EXISTS "idx_${schemaName}_body_metrics_history_branch" ON "${schemaName}"."body_metrics_history"(branch_id)`);

    // Trainer-client indexes
    await client.query(`CREATE INDEX IF NOT EXISTS "idx_${schemaName}_trainer_client_trainer" ON "${schemaName}"."trainer_client_xref"(trainer_id)`);
    await client.query(`CREATE INDEX IF NOT EXISTS "idx_${schemaName}_trainer_client_client" ON "${schemaName}"."trainer_client_xref"(client_id)`);
    await client.query(`CREATE INDEX IF NOT EXISTS "idx_${schemaName}_trainer_client_branch" ON "${schemaName}"."trainer_client_xref"(branch_id)`);

    // Plan-offer indexes
    await client.query(`CREATE INDEX IF NOT EXISTS "idx_${schemaName}_plan_offer_xref_branch" ON "${schemaName}"."plan_offer_xref"(branch_id)`);

    // Staff salaries indexes
    await client.query(`CREATE INDEX IF NOT EXISTS "idx_${schemaName}_staff_salaries_staff" ON "${schemaName}"."staff_salaries"(staff_id)`);
    await client.query(`CREATE INDEX IF NOT EXISTS "idx_${schemaName}_staff_salaries_status" ON "${schemaName}"."staff_salaries"(payment_status)`);
    await client.query(`CREATE INDEX IF NOT EXISTS "idx_${schemaName}_staff_salaries_period" ON "${schemaName}"."staff_salaries"(year, month)`);
    await client.query(`CREATE INDEX IF NOT EXISTS "idx_${schemaName}_staff_salaries_branch" ON "${schemaName}"."staff_salaries"(branch_id)`);

    // Facilities indexes
    await client.query(`CREATE INDEX IF NOT EXISTS "idx_${schemaName}_facilities_branch" ON "${schemaName}"."facilities"(branch_id)`);
    await client.query(`CREATE INDEX IF NOT EXISTS "idx_${schemaName}_facilities_code" ON "${schemaName}"."facilities"(code)`);
    await client.query(`CREATE INDEX IF NOT EXISTS "idx_${schemaName}_facilities_active" ON "${schemaName}"."facilities"(is_active)`);

    // Amenities indexes
    await client.query(`CREATE INDEX IF NOT EXISTS "idx_${schemaName}_amenities_branch" ON "${schemaName}"."amenities"(branch_id)`);
    await client.query(`CREATE INDEX IF NOT EXISTS "idx_${schemaName}_amenities_code" ON "${schemaName}"."amenities"(code)`);
    await client.query(`CREATE INDEX IF NOT EXISTS "idx_${schemaName}_amenities_active" ON "${schemaName}"."amenities"(is_active)`);

    // Membership-Facility indexes
    await client.query(`CREATE INDEX IF NOT EXISTS "idx_${schemaName}_membership_facilities_membership" ON "${schemaName}"."membership_facilities"(membership_id)`);
    await client.query(`CREATE INDEX IF NOT EXISTS "idx_${schemaName}_membership_facilities_facility" ON "${schemaName}"."membership_facilities"(facility_id)`);

    // Membership-Amenity indexes
    await client.query(`CREATE INDEX IF NOT EXISTS "idx_${schemaName}_membership_amenities_membership" ON "${schemaName}"."membership_amenities"(membership_id)`);
    await client.query(`CREATE INDEX IF NOT EXISTS "idx_${schemaName}_membership_amenities_amenity" ON "${schemaName}"."membership_amenities"(amenity_id)`);
  }

  /**
   * Seed default membership plans for a new tenant
   */
  private async seedDefaultPlans(client: any, schemaName: string): Promise<void> {
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
        description: 'Our most popular plan with great value for committed members',
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
        [plan.code]
      );

      if (existing.rows.length === 0) {
        await client.query(`
          INSERT INTO "${schemaName}"."plans"
          (code, name, description, duration_value, duration_type, price, features, display_order, is_featured, is_active)
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, true)
        `, [
          plan.code,
          plan.name,
          plan.description,
          plan.duration_value,
          plan.duration_type,
          plan.price,
          plan.features,
          plan.display_order,
          plan.is_featured,
        ]);
      }
    }

    console.log(`Seeded default plans for ${schemaName}`);
  }

  /**
   * Drop a tenant schema (use with caution!)
   */
  async dropTenantSchema(gymId: number): Promise<void> {
    const schemaName = this.getTenantSchemaName(gymId);
    const client = await this.pool.connect();

    try {
      await client.query(`DROP SCHEMA IF EXISTS "${schemaName}" CASCADE`);
      console.log(`Dropped tenant schema: ${schemaName}`);
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
      [schemaName]
    );
    return result.rows.length > 0;
  }

  /**
   * Execute a query in a specific tenant schema
   */
  async executeInTenant<T>(gymId: number, callback: (client: any, schemaName: string) => Promise<T>): Promise<T> {
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
