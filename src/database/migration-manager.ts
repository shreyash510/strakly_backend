import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { Pool, PoolClient } from 'pg';
import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';

interface MigrationFile {
  version: string;
  name: string;
  filename: string;
  filePath: string;
  type: 'sql' | 'ts';
}

interface AppliedMigration {
  version: string;
  name: string;
  md5_hash: string;
  applied_at: Date;
}

/**
 * MigrationManager handles file-based migrations for both main (public) and tenant schemas.
 *
 * Features:
 * - Supports .sql and .ts migration files
 * - MD5 hash tracking to detect modified migrations
 * - Idempotent execution (safe to run multiple times)
 * - Separate migration sets for main and tenant schemas
 *
 * Usage:
 * - Main schema migrations run on app startup
 * - Tenant migrations run when creating a new tenant or on startup for all existing tenants
 */
@Injectable()
export class MigrationManager implements OnModuleInit {
  private readonly logger = new Logger(MigrationManager.name);
  private readonly migrationsPath: string;
  private pool: Pool;

  constructor() {
    this.migrationsPath = path.join(__dirname, 'migrations');

    // Use DIRECT_URL for migrations (bypasses PgBouncer to preserve session state)
    const databaseUrl = process.env.DIRECT_URL || process.env.DATABASE_URL;
    if (!databaseUrl) {
      throw new Error('DATABASE_URL not configured');
    }

    this.pool = new Pool({
      connectionString: databaseUrl,
      max: 5,
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 10000,
    });
  }

  /**
   * Run main schema migrations on startup
   */
  async onModuleInit(): Promise<void> {
    try {
      this.logger.log('Running main schema migrations...');
      await this.runMigrations('main', 'public');
      this.logger.log('Main schema migrations complete');
    } catch (error) {
      this.logger.error('Failed to run main schema migrations:', error);
      // Don't throw - let the app continue even if migrations fail
      // TenantService will handle tenant migrations separately
    }
  }

  /**
   * Run migrations for a specific schema
   * @param schemaType - 'main' or 'tenant' (determines which migration folder to use)
   * @param schemaName - The actual schema name (e.g., 'public', 'tenant_1')
   */
  async runMigrations(
    schemaType: 'main' | 'tenant',
    schemaName: string,
  ): Promise<void> {
    const client = await this.pool.connect();

    try {
      // Set search path to the target schema
      await client.query(`SET search_path TO "${schemaName}"`);

      // Ensure migrations table exists
      await this.ensureMigrationsTable(client, schemaName);

      // Get migration files from the appropriate folder
      const migrationDir = path.join(this.migrationsPath, schemaType);
      const files = this.getMigrationFiles(migrationDir);

      if (files.length === 0) {
        this.logger.log(`No migration files found in ${migrationDir}`);
        return;
      }

      // Get already applied migrations
      const applied = await this.getAppliedMigrations(client, schemaName);

      // Run pending migrations
      for (const file of files) {
        const existing = applied.find((m) => m.version === file.version);
        const hash = this.getFileHash(file.filePath);

        if (existing) {
          // Check hash matches (detect modified migrations)
          if (existing.md5_hash !== hash) {
            this.logger.warn(
              `Migration ${file.filename} has been modified! ` +
                `Expected hash: ${existing.md5_hash}, got: ${hash}. ` +
                `Skipping to avoid data corruption.`,
            );
          }
          continue; // Already applied
        }

        this.logger.log(`Running migration: ${file.filename} on ${schemaName}`);

        try {
          // Run migration in a transaction
          await client.query('BEGIN');

          if (file.type === 'sql') {
            const sql = fs.readFileSync(file.filePath, 'utf-8');
            await client.query(sql);
          } else {
            // TypeScript migration - require and execute
            // eslint-disable-next-line @typescript-eslint/no-require-imports
            const migration = require(file.filePath);
            if (typeof migration.up === 'function') {
              await migration.up(client, schemaName);
            } else {
              throw new Error(
                `Migration ${file.filename} does not export an 'up' function`,
              );
            }
          }

          // Record migration
          await this.recordMigration(client, schemaName, file, hash);

          await client.query('COMMIT');
          this.logger.log(`Completed migration: ${file.filename}`);
        } catch (error) {
          await client.query('ROLLBACK');
          this.logger.error(`Failed migration ${file.filename}:`, error);
          throw error;
        }
      }
    } finally {
      client.release();
    }
  }

  /**
   * Run tenant migrations for a specific gym
   * Creates the schema if it doesn't exist
   */
  async runTenantMigrations(gymId: number): Promise<void> {
    const schemaName = `tenant_${gymId}`;

    const client = await this.pool.connect();
    try {
      // First ensure schema exists
      await client.query(`CREATE SCHEMA IF NOT EXISTS "${schemaName}"`);
      this.logger.log(`Ensured schema exists: ${schemaName}`);
    } finally {
      client.release();
    }

    // Run tenant migrations
    await this.runMigrations('tenant', schemaName);
  }

  /**
   * Run migrations for all existing tenant schemas
   */
  async migrateAllTenantSchemas(): Promise<void> {
    const client = await this.pool.connect();
    try {
      // Get all tenant schemas
      const result = await client.query(`
        SELECT schema_name FROM information_schema.schemata
        WHERE schema_name LIKE 'tenant_%'
        ORDER BY schema_name
      `);

      this.logger.log(
        `Found ${result.rows.length} tenant schemas to migrate`,
      );

      for (const row of result.rows) {
        const schemaName = row.schema_name;
        try {
          await this.runMigrations('tenant', schemaName);
        } catch (error) {
          this.logger.error(
            `Failed to migrate schema ${schemaName}:`,
            error.message,
          );
          // Continue with other schemas
        }
      }

      this.logger.log('All tenant schema migrations completed');
    } finally {
      client.release();
    }
  }

  /**
   * Ensure migrations tracking table exists in the schema
   */
  private async ensureMigrationsTable(
    client: PoolClient,
    schemaName: string,
  ): Promise<void> {
    await client.query(`
      CREATE TABLE IF NOT EXISTS migrations (
        id SERIAL PRIMARY KEY,
        schema_name VARCHAR(100) NOT NULL,
        version VARCHAR(10) NOT NULL,
        name VARCHAR(255) NOT NULL,
        md5_hash VARCHAR(32) NOT NULL,
        applied_at TIMESTAMPTZ DEFAULT NOW(),
        UNIQUE(schema_name, version)
      )
    `);
  }

  /**
   * Get list of migration files sorted by version
   */
  private getMigrationFiles(dir: string): MigrationFile[] {
    if (!fs.existsSync(dir)) {
      this.logger.warn(`Migration directory does not exist: ${dir}`);
      return [];
    }

    const files = fs
      .readdirSync(dir)
      .filter((f) => f.endsWith('.sql') || f.endsWith('.ts') || f.endsWith('.js'))
      .filter((f) => !f.endsWith('.d.ts')) // Exclude type definitions
      .sort();

    return files.map((filename) => {
      // Parse filename: 001_initial_setup.sql or 001_initial_setup.ts
      const match = filename.match(/^(\d{3})_(.+)\.(sql|ts|js)$/);
      if (!match) {
        throw new Error(
          `Invalid migration filename: ${filename}. Expected format: 001_name.sql or 001_name.ts`,
        );
      }

      return {
        version: match[1],
        name: match[2],
        filename,
        filePath: path.join(dir, filename),
        type: match[3] === 'sql' ? 'sql' : 'ts',
      } as MigrationFile;
    });
  }

  /**
   * Get already applied migrations from the database
   */
  private async getAppliedMigrations(
    client: PoolClient,
    schemaName: string,
  ): Promise<AppliedMigration[]> {
    try {
      const result = await client.query(
        'SELECT version, name, md5_hash, applied_at FROM migrations WHERE schema_name = $1 ORDER BY version',
        [schemaName],
      );
      return result.rows;
    } catch (error: any) {
      // Table might not exist yet (42P01 = undefined_table)
      if (error.code === '42P01') {
        return [];
      }
      throw error;
    }
  }

  /**
   * Record a migration as applied
   */
  private async recordMigration(
    client: PoolClient,
    schemaName: string,
    file: MigrationFile,
    hash: string,
  ): Promise<void> {
    await client.query(
      `INSERT INTO migrations (schema_name, version, name, md5_hash)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (schema_name, version) DO NOTHING`,
      [schemaName, file.version, file.name, hash],
    );
  }

  /**
   * Calculate MD5 hash of a file
   */
  private getFileHash(filePath: string): string {
    const content = fs.readFileSync(filePath);
    return crypto.createHash('md5').update(content).digest('hex');
  }

  /**
   * Get migration status for a schema
   * Useful for debugging and health checks
   */
  async getMigrationStatus(
    schemaType: 'main' | 'tenant',
    schemaName: string,
  ): Promise<{
    applied: AppliedMigration[];
    pending: MigrationFile[];
  }> {
    const client = await this.pool.connect();

    try {
      await client.query(`SET search_path TO "${schemaName}"`);

      const migrationDir = path.join(this.migrationsPath, schemaType);
      const files = this.getMigrationFiles(migrationDir);
      const applied = await this.getAppliedMigrations(client, schemaName);

      const appliedVersions = new Set(applied.map((m) => m.version));
      const pending = files.filter((f) => !appliedVersions.has(f.version));

      return { applied, pending };
    } finally {
      client.release();
    }
  }

  /**
   * Check if a specific migration has been applied
   */
  async isMigrationApplied(
    schemaName: string,
    version: string,
  ): Promise<boolean> {
    const client = await this.pool.connect();
    try {
      await client.query(`SET search_path TO "${schemaName}"`);
      const result = await client.query(
        'SELECT 1 FROM migrations WHERE schema_name = $1 AND version = $2',
        [schemaName, version],
      );
      return result.rows.length > 0;
    } catch {
      return false;
    } finally {
      client.release();
    }
  }

  /**
   * Get the pool for direct access if needed
   */
  getPool(): Pool {
    return this.pool;
  }

  /**
   * Cleanup pool on module destroy
   */
  async onModuleDestroy(): Promise<void> {
    if (this.pool) {
      await this.pool.end();
    }
  }
}
