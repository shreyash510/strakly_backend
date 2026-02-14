import { Module } from '@nestjs/common';
import { GamificationController } from './gamification.controller';
import { GamificationService } from './gamification.service';
import { GamificationScheduler } from './gamification.scheduler';
import { TenantModule } from '../tenant/tenant.module';
import { DatabaseModule } from '../database/database.module';

@Module({
  imports: [TenantModule, DatabaseModule],
  controllers: [GamificationController],
  providers: [GamificationService, GamificationScheduler],
  exports: [GamificationService],
})
export class GamificationModule {}
