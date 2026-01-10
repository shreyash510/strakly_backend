import { Module } from '@nestjs/common';
import { SchedulerService } from './scheduler.service';
import { SchedulerController } from './scheduler.controller';
import { StreaksModule } from '../streaks/streaks.module';
import { ChallengesModule } from '../challenges/challenges.module';

@Module({
  imports: [StreaksModule, ChallengesModule],
  controllers: [SchedulerController],
  providers: [SchedulerService],
})
export class SchedulerModule {}
