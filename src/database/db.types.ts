import { PoolClient } from 'pg';

/**
 * Database client pool interface for per-request database connections
 * This is injected by DbClientMiddleware into each request
 */
export interface DbClientPool {
  /** Connection to the public/main schema */
  mainPool: PoolClient;
  /** Connection to the tenant-specific schema (null if no gymId) */
  tenantPool: PoolClient | null;
}

/**
 * Extend Express Request to include database pools
 */
declare global {
  namespace Express {
    interface Request {
      /** Database pools injected by DbClientMiddleware */
      db?: DbClientPool;
    }
  }
}
