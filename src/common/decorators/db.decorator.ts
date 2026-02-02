import {
  createParamDecorator,
  ExecutionContext,
  BadRequestException,
} from '@nestjs/common';
import { DbClientPool } from '../../database/db.types';
import { PoolClient } from 'pg';

/**
 * @Db() - Get the full DbClientPool from the request
 *
 * Usage in controller:
 * ```typescript
 * @Get()
 * async findAll(@Db() db: DbClientPool) {
 *   // Access both db.mainPool and db.tenantPool
 *   const result = await db.tenantPool.query('SELECT * FROM users');
 * }
 * ```
 */
export const Db = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): DbClientPool => {
    const request = ctx.switchToHttp().getRequest();

    if (!request.db) {
      throw new BadRequestException(
        'Database pools not available. Ensure DbClientMiddleware is configured.',
      );
    }

    return request.db;
  },
);

/**
 * @TenantDb() - Get only the tenant pool from the request
 *
 * Throws BadRequestException if tenant pool is not available (no gymId)
 *
 * Usage in controller:
 * ```typescript
 * @Get()
 * async findAll(@TenantDb() tenantPool: PoolClient) {
 *   const result = await tenantPool.query('SELECT * FROM users');
 * }
 * ```
 */
export const TenantDb = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): PoolClient => {
    const request = ctx.switchToHttp().getRequest();

    if (!request.db) {
      throw new BadRequestException(
        'Database pools not available. Ensure DbClientMiddleware is configured.',
      );
    }

    if (!request.db.tenantPool) {
      throw new BadRequestException(
        'Tenant pool not available. Missing gymId? Ensure user is authenticated with a gym.',
      );
    }

    return request.db.tenantPool;
  },
);

/**
 * @MainDb() - Get only the main pool (public schema) from the request
 *
 * Usage in controller:
 * ```typescript
 * @Post('login')
 * async login(@MainDb() mainPool: PoolClient) {
 *   // For pre-auth routes that only need public schema
 *   const result = await mainPool.query('SELECT * FROM gyms WHERE id = $1', [gymId]);
 * }
 * ```
 */
export const MainDb = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): PoolClient => {
    const request = ctx.switchToHttp().getRequest();

    if (!request.db) {
      throw new BadRequestException(
        'Database pools not available. Ensure DbClientMiddleware is configured.',
      );
    }

    if (!request.db.mainPool) {
      throw new BadRequestException('Main pool not available.');
    }

    return request.db.mainPool;
  },
);

/**
 * @OptionalTenantDb() - Get tenant pool if available, otherwise null
 *
 * Use this for endpoints that can work with or without tenant context
 *
 * Usage in controller:
 * ```typescript
 * @Get()
 * async findAll(@OptionalTenantDb() tenantPool: PoolClient | null) {
 *   if (tenantPool) {
 *     // Has tenant context
 *   } else {
 *     // No tenant context (e.g., superadmin)
 *   }
 * }
 * ```
 */
export const OptionalTenantDb = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): PoolClient | null => {
    const request = ctx.switchToHttp().getRequest();

    if (!request.db) {
      return null;
    }

    return request.db.tenantPool || null;
  },
);
