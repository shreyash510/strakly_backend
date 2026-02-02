import { Injectable, OnModuleDestroy, Logger } from '@nestjs/common';
import { Pool, PoolClient } from 'pg';

/**
 * DbManager - Singleton service for database pool management
 *
 * This service manages a single PostgreSQL connection pool that is shared
 * across all requests. It provides methods to get schema-specific clients
 * with the search_path already set.
 *
 * Key features:
 * - Lazy pool initialization
 * - Schema-specific client acquisition
 * - Proper cleanup on module destroy
 * - Pool statistics for monitoring
 */
@Injectable()
export class DbManager implements OnModuleDestroy {
  private readonly logger = new Logger(DbManager.name);
  private pool: Pool | null = null;

  /**
   * Get or create the database pool (lazy initialization)
   * Uses DIRECT_URL to bypass PgBouncer which doesn't preserve session state
   */
  getPool(): Pool {
    if (!this.pool) {
      // Use DIRECT_URL for direct connection (bypasses PgBouncer)
      // Fall back to DATABASE_URL if DIRECT_URL is not set
      const connectionString =
        process.env.DIRECT_URL || process.env.DATABASE_URL;

      if (!connectionString) {
        throw new Error(
          'DATABASE_URL or DIRECT_URL must be configured for DbManager',
        );
      }

      this.pool = new Pool({
        connectionString,
        max: 20, // Max connections in pool
        idleTimeoutMillis: 30000, // Close idle connections after 30s
        connectionTimeoutMillis: 5000, // Fail if can't connect in 5s
      });

      // Log pool errors
      this.pool.on('error', (err) => {
        this.logger.error('Unexpected pool error:', err);
      });

      this.logger.log('Database pool initialized');
    }

    return this.pool;
  }

  /**
   * Get a client with search_path set to the specified schema
   *
   * @param schemaName - The schema name (e.g., 'public', 'tenant_1')
   * @returns PoolClient with search_path already set
   *
   * IMPORTANT: The caller is responsible for releasing this client
   * by calling client.release() when done
   */
  async getSchemaClient(schemaName: string): Promise<PoolClient> {
    const pool = this.getPool();
    const client = await pool.connect();

    try {
      // Set search_path to the schema with public as fallback
      await client.query(`SET search_path TO "${schemaName}", public`);
      return client;
    } catch (error) {
      // Release client if we fail to set search_path
      client.release();
      throw error;
    }
  }

  /**
   * Get a client for the public/main schema
   */
  async getMainClient(): Promise<PoolClient> {
    return this.getSchemaClient('public');
  }

  /**
   * Get a client for a tenant schema
   *
   * @param gymId - The gym ID (used to construct schema name: tenant_{gymId})
   */
  async getTenantClient(gymId: number): Promise<PoolClient> {
    const schemaName = `tenant_${gymId}`;
    return this.getSchemaClient(schemaName);
  }

  /**
   * Get pool statistics for monitoring
   */
  getPoolStats(): {
    total: number;
    idle: number;
    waiting: number;
  } {
    const pool = this.getPool();
    return {
      total: pool.totalCount,
      idle: pool.idleCount,
      waiting: pool.waitingCount,
    };
  }

  /**
   * Cleanup on module destroy
   */
  async onModuleDestroy(): Promise<void> {
    if (this.pool) {
      this.logger.log('Closing database pool...');
      await this.pool.end();
      this.pool = null;
      this.logger.log('Database pool closed');
    }
  }
}
