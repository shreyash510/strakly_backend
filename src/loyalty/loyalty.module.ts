import { Module } from '@nestjs/common';
import { LoyaltyController } from './loyalty.controller';
import { LoyaltyService } from './loyalty.service';
import { LoyaltyScheduler } from './loyalty.scheduler';
import { TenantModule } from '../tenant/tenant.module';
import { DatabaseModule } from '../database/database.module';

@Module({
  imports: [TenantModule, DatabaseModule],
  controllers: [LoyaltyController],
  providers: [LoyaltyService, LoyaltyScheduler],
  exports: [LoyaltyService],
})
export class LoyaltyModule {}
