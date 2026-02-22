import { Module } from '@nestjs/common';
import { AttendanceController } from './attendance.controller';
import { AttendanceService } from './attendance.service';
import { ActivityLogsModule } from '../activity-logs/activity-logs.module';
import { LoyaltyModule } from '../loyalty/loyalty.module';

@Module({
  imports: [ActivityLogsModule, LoyaltyModule],
  controllers: [AttendanceController],
  providers: [AttendanceService],
  exports: [AttendanceService],
})
export class AttendanceModule {}
