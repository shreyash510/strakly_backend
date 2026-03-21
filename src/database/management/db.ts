import pg, { QueryResult } from "pg";
import dotenv from "dotenv";

dotenv.config();

const { Pool, Client } = pg;
type PoolClient = pg.PoolClient;
type PoolType = typeof Pool;
type ClientType = typeof Client;

const logger = {
  info: (...args: any[]) => console.info("[DB]", ...args),
  warn: (...args: any[]) => console.warn("[DB]", ...args),
  error: (...args: any[]) => console.error("[DB]", ...args),
};

/**
 * Get database connection string.
 * Prefers DIRECT_URL (bypasses PgBouncer) for migrations, falls back to DATABASE_URL.
 */
function getConnectionString(): string {
  const url = process.env.DIRECT_URL || process.env.DATABASE_URL;
  if (!url) {
    throw new Error(
      "Missing database connection string. Set DIRECT_URL or DATABASE_URL in .env",
    );
  }
  return url;
}

export const schemaNames = {
  tenantSchemaName: (gymId: number) => `tenant_${gymId}`,
  tenantSchemaFolderName: () => "tenant",
};

interface TransactionHandlers {
  pool: PoolClient;
  query: (query: string, params?: any[]) => Promise<QueryResult<any>>;
  commit: () => Promise<void>;
  rollback: () => Promise<void>;
}

class DbManager {
  private client: InstanceType<ClientType> | null = null;
  private pool: InstanceType<PoolType> | null = null;

  async getDbClient(): Promise<InstanceType<ClientType>> {
    if (!this.client) {
      this.client = new Client({
        connectionString: getConnectionString(),
      });
      await this.client.connect();
      logger.info("PostgreSQL client connected successfully");
    }
    return this.client;
  }

  getDbPool(): InstanceType<PoolType> {
    if (!this.pool) {
      this.pool = new Pool({
        connectionString: getConnectionString(),
        max: 20,
        idleTimeoutMillis: 30000,
        connectionTimeoutMillis: 5000,
      });

      this.pool.on("error", (err: Error, client: PoolClient) => {
        logger.error("Unexpected error on idle PostgreSQL client", err);
      });
    }
    return this.pool;
  }

  async getSchemaPool(schemaName: string): Promise<PoolClient> {
    const pool = await this.getDbPool().connect();
    try {
      await pool.query(`SET search_path TO ${schemaName}`);
      return pool;
    } catch (error) {
      pool.release();
      logger.error(`Failed to set schema "${schemaName}"`, error);
      throw error;
    }
  }

  async transaction(schemaName: string): Promise<TransactionHandlers> {
    const pool = await this.getDbPool().connect();
    try {
      await pool.query(`SET search_path TO ${schemaName}`);
      await pool.query("BEGIN");

      const commit = async (): Promise<void> => {
        await pool.query("COMMIT");
        pool.release(true);
      };

      const rollback = async (): Promise<void> => {
        await pool.query("ROLLBACK");
        pool.release(true);
      };
      const query = pool.query;

      return { pool, query, commit, rollback };
    } catch (error) {
      pool.release(true);
      logger.error("Transaction Error:", error);
      throw error;
    }
  }

  async shutdown(): Promise<void> {
    try {
      if (this.client) {
        await this.client.end();
        this.client = null;
      }
      if (this.pool) {
        await this.pool.end();
        this.pool = null;
      }
      logger.info("Database connections closed successfully");
    } catch (error) {
      logger.error("Error during database shutdown:", error);
      throw error;
    }
  }
}

// Create a singleton instance
const db = new DbManager();

// Handle process termination
process.on("SIGINT", async () => {
  try {
    await db.shutdown();
    process.exit(0);
  } catch (error) {
    logger.error("Error during shutdown:", error);
    process.exit(1);
  }
});

export default db;
