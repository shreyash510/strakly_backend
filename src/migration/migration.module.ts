import { Module } from '@nestjs/common';
import { MigrationController } from './migration.controller';
import { MigrationService } from './migration.service';
import { DatabaseModule } from '../database/database.module';
import { TenantModule } from '../tenant/tenant.module';

@Module({
  imports: [DatabaseModule, TenantModule],
  controllers: [MigrationController],
  providers: [MigrationService],
})
export class MigrationModule {}
