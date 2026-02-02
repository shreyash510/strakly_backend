import {
  Module,
  Global,
  MiddlewareConsumer,
  NestModule,
  RequestMethod,
} from '@nestjs/common';
import { PrismaService } from './prisma.service';
import { DbManager } from './db-manager';
import { DbClientMiddleware } from './db-client.middleware';

/**
 * DatabaseModule - Global module for database connectivity
 *
 * This module provides:
 * - PrismaService: For Prisma ORM operations (existing)
 * - DbManager: For direct pool management with schema switching (new)
 * - DbClientMiddleware: Injects req.db with mainPool/tenantPool per request (new)
 *
 * The middleware applies to all API routes and provides database pools
 * that are scoped to each request with proper cleanup.
 */
@Global()
@Module({
  providers: [PrismaService, DbManager, DbClientMiddleware],
  exports: [PrismaService, DbManager],
})
export class DatabaseModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    // Apply DbClientMiddleware to all API routes
    // This runs AFTER auth middleware, so req.user.gymId is available
    consumer
      .apply(DbClientMiddleware)
      .forRoutes({ path: '*', method: RequestMethod.ALL });
  }
}
