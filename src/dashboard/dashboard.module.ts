import { Module } from '@nestjs/common';
import { DashboardController } from './dashboard.controller';
import { DashboardService } from './dashboard.service';
import { DashboardCacheService } from './dashboard-cache.service';
import { DashboardConsumer } from './dashboard.consumer';
import { DashboardScheduler } from './dashboard.scheduler';
import { DatabaseModule } from '../database/database.module';

@Module({
  imports: [DatabaseModule],
  controllers: [DashboardController],
  providers: [
    DashboardService,
    DashboardCacheService,
    DashboardConsumer,
    DashboardScheduler,
  ],
  exports: [DashboardService, DashboardCacheService],
})
export class DashboardModule {}
