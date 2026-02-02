import { Injectable, NestMiddleware, Logger } from '@nestjs/common';
import { Request, Response, NextFunction } from 'express';
import { DbManager } from './db-manager';
import { DbClientPool } from './db.types';

/**
 * DbClientMiddleware - Injects database pools into each request
 *
 * This middleware runs after JWT authentication (if applicable) and injects
 * mainPool and tenantPool into req.db for use by controllers and services.
 *
 * Connection lifecycle:
 * 1. Acquire mainPool connection at request start
 * 2. Acquire tenantPool connection if gymId is available (from JWT or header)
 * 3. Attach to req.db
 * 4. Release both connections when response finishes (or closes/errors)
 *
 * This pattern ensures:
 * - Same connection is reused for all queries within a request
 * - Connections are properly released even on errors
 * - No connection leaks
 */
@Injectable()
export class DbClientMiddleware implements NestMiddleware {
  private readonly logger = new Logger(DbClientMiddleware.name);

  constructor(private readonly dbManager: DbManager) {}

  async use(req: Request, res: Response, next: NextFunction): Promise<void> {
    const db: DbClientPool = {
      mainPool: null as any,
      tenantPool: null,
    };

    // Track if cleanup has been done to prevent double-release
    let isReleased = false;

    const cleanup = () => {
      if (isReleased) return;
      isReleased = true;

      try {
        if (db.tenantPool && typeof db.tenantPool.release === 'function') {
          db.tenantPool.release();
        }
        if (db.mainPool && typeof db.mainPool.release === 'function') {
          db.mainPool.release();
        }
      } catch (releaseError) {
        this.logger.error('Error releasing database connections:', releaseError);
      }
    };

    try {
      // Always get main pool (public schema)
      db.mainPool = await this.dbManager.getMainClient();

      // Get gymId from JWT user (set by auth guard) or from x-gym-id header
      // The JWT auth middleware runs before this and sets req.user
      const user = (req as any).user;
      const headerGymId = req.headers['x-gym-id'] as string | undefined;
      const gymId = user?.gymId || (headerGymId ? parseInt(headerGymId, 10) : null);

      // Get tenant pool if gymId is available
      if (gymId && !isNaN(gymId)) {
        try {
          db.tenantPool = await this.dbManager.getTenantClient(gymId);
        } catch (error) {
          // Log but don't fail - some routes may not need tenant pool
          this.logger.warn(
            `Failed to get tenant pool for gymId ${gymId}: ${error instanceof Error ? error.message : String(error)}`,
          );
        }
      }

      // Attach to request
      req.db = db;

      // Release connections when response ends
      res.on('finish', cleanup);
      res.on('close', cleanup);
      res.on('error', cleanup);

      next();
    } catch (error) {
      // Release any acquired connections on error
      cleanup();

      this.logger.error(
        'Database connection error in middleware:',
        error instanceof Error ? error.message : String(error),
      );

      // Pass error to next middleware/error handler
      next(error);
    }
  }
}
