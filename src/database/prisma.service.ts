import { Injectable, Logger, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { Pool } from 'pg';

@Injectable()
export class PrismaService
  extends PrismaClient
  implements OnModuleInit, OnModuleDestroy
{
  private readonly logger = new Logger(PrismaService.name);
  private pool: Pool;

  constructor() {
    const env = process.env.ENVIRONMENT || 'dev';

    // Select database URL based on ENVIRONMENT
    let databaseUrl: string | undefined;
    if (env === 'prod') {
      databaseUrl = process.env.DATABASE_URL_PROD || process.env.DATABASE_URL;
    } else {
      databaseUrl = process.env.DATABASE_URL_DEV || process.env.DATABASE_URL;
    }

    if (!databaseUrl) {
      throw new Error(
        `Database URL not configured for environment: ${env}. Set DATABASE_URL_${env === 'prod' ? 'PROD' : 'DEV'} or DATABASE_URL`,
      );
    }

    const pool = new Pool({ connectionString: databaseUrl });
    const adapter = new PrismaPg(pool);
    super({
      adapter,
      log: env === 'dev' ? ['warn', 'error'] : ['error'],
    });
    this.pool = pool;
    this.logger.log(`Connecting to ${env} database...`);
  }

  async onModuleInit() {
    await this.$connect();
    this.logger.log('Connected to PostgreSQL database');
  }

  async onModuleDestroy() {
    await this.$disconnect();
  }
}
