import { Module } from '@nestjs/common';
import { EngagementController } from './engagement.controller';
import { EngagementService } from './engagement.service';
import { EngagementScheduler } from './engagement.scheduler';
import { TenantModule } from '../tenant/tenant.module';
import { DatabaseModule } from '../database/database.module';

@Module({
  imports: [TenantModule, DatabaseModule],
  controllers: [EngagementController],
  providers: [EngagementService, EngagementScheduler],
  exports: [EngagementService],
})
export class EngagementModule {}
