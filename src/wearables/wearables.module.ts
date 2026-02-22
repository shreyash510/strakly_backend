import { Module } from '@nestjs/common';
import { WearablesController } from './wearables.controller';
import { WearablesService } from './wearables.service';
import { WearablesScheduler } from './wearables.scheduler';
import { TenantModule } from '../tenant/tenant.module';
import { DatabaseModule } from '../database/database.module';

@Module({
  imports: [TenantModule, DatabaseModule],
  controllers: [WearablesController],
  providers: [WearablesService, WearablesScheduler],
  exports: [WearablesService],
})
export class WearablesModule {}
