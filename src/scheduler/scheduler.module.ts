import { Module } from '@nestjs/common';
import { SchedulerService } from './scheduler.service';
import { ActivitySchedulerService } from './activity-scheduler.service';
import { SchedulerController } from './scheduler.controller';
import { StreaksModule } from '../streaks/streaks.module';
import { ChallengesModule } from '../challenges/challenges.module';
import { DatabaseModule } from '../database/database.module';
import { PostsModule } from '../posts/posts.module';

@Module({
  imports: [StreaksModule, ChallengesModule, DatabaseModule, PostsModule],
  controllers: [SchedulerController],
  providers: [SchedulerService, ActivitySchedulerService],
  exports: [ActivitySchedulerService],
})
export class SchedulerModule {}
