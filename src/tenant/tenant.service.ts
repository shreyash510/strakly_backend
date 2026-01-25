import { Injectable, OnModuleInit } from '@nestjs/common';
import { Pool } from 'pg';

@Injectable()
export class TenantService implements OnModuleInit {
  private pool: Pool;

  constructor() {
    const databaseUrl = process.env.DATABASE_URL;
    if (!databaseUrl) {
      throw new Error('DATABASE_URL not configured');
    }
    this.pool = new Pool({ connectionString: databaseUrl });
  }

  async onModuleInit() {
    console.log('TenantService initialized');
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
        attendance_code VARCHAR(20) UNIQUE,
        join_date TIMESTAMP,
        last_login_at TIMESTAMP,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Plans table (gym-specific membership plans)
    await client.query(`
      CREATE TABLE IF NOT EXISTS "${schemaName}"."plans" (
        id SERIAL PRIMARY KEY,
        code VARCHAR(100) UNIQUE NOT NULL,
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
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Offers table
    await client.query(`
      CREATE TABLE IF NOT EXISTS "${schemaName}"."offers" (
        id SERIAL PRIMARY KEY,
        code VARCHAR(100) UNIQUE NOT NULL,
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
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Plan-Offer cross reference
    await client.query(`
      CREATE TABLE IF NOT EXISTS "${schemaName}"."plan_offer_xref" (
        id SERIAL PRIMARY KEY,
        plan_id INTEGER NOT NULL REFERENCES "${schemaName}"."plans"(id) ON DELETE CASCADE,
        offer_id INTEGER NOT NULL REFERENCES "${schemaName}"."offers"(id) ON DELETE CASCADE,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(plan_id, offer_id)
      )
    `);

    // Memberships table
    await client.query(`
      CREATE TABLE IF NOT EXISTS "${schemaName}"."memberships" (
        id SERIAL PRIMARY KEY,
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

    // Attendance table (active check-ins)
    // marked_by references public.users.id (staff)
    await client.query(`
      CREATE TABLE IF NOT EXISTS "${schemaName}"."attendance" (
        id SERIAL PRIMARY KEY,
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

    // Memberships indexes
    await client.query(`CREATE INDEX IF NOT EXISTS "idx_${schemaName}_memberships_user" ON "${schemaName}"."memberships"(user_id)`);
    await client.query(`CREATE INDEX IF NOT EXISTS "idx_${schemaName}_memberships_status" ON "${schemaName}"."memberships"(status)`);
    await client.query(`CREATE INDEX IF NOT EXISTS "idx_${schemaName}_memberships_dates" ON "${schemaName}"."memberships"(start_date, end_date)`);

    // Attendance indexes
    await client.query(`CREATE INDEX IF NOT EXISTS "idx_${schemaName}_attendance_user" ON "${schemaName}"."attendance"(user_id)`);
    await client.query(`CREATE INDEX IF NOT EXISTS "idx_${schemaName}_attendance_date" ON "${schemaName}"."attendance"(date)`);
    await client.query(`CREATE INDEX IF NOT EXISTS "idx_${schemaName}_attendance_marked_by" ON "${schemaName}"."attendance"(marked_by)`);

    // Attendance history indexes
    await client.query(`CREATE INDEX IF NOT EXISTS "idx_${schemaName}_attendance_history_user" ON "${schemaName}"."attendance_history"(user_id)`);
    await client.query(`CREATE INDEX IF NOT EXISTS "idx_${schemaName}_attendance_history_date" ON "${schemaName}"."attendance_history"(date)`);

    // Trainer-client indexes
    await client.query(`CREATE INDEX IF NOT EXISTS "idx_${schemaName}_trainer_client_trainer" ON "${schemaName}"."trainer_client_xref"(trainer_id)`);
    await client.query(`CREATE INDEX IF NOT EXISTS "idx_${schemaName}_trainer_client_client" ON "${schemaName}"."trainer_client_xref"(client_id)`);
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
