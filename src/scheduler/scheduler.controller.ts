import { Controller, Post } from '@nestjs/common';
import { SchedulerService } from './scheduler.service';
import { ActivitySchedulerService } from './activity-scheduler.service';

@Controller('scheduler')
export class SchedulerController {
  constructor(
    private readonly schedulerService: SchedulerService,
    private readonly activitySchedulerService: ActivitySchedulerService,
  ) {}

  // Manual trigger for testing (should be protected in production)
  @Post('trigger-end-of-day')
  async triggerEndOfDay() {
    return this.schedulerService.triggerEndOfDay();
  }

  // Manual trigger for activity simulation
  @Post('trigger-activity')
  async triggerActivity() {
    return this.activitySchedulerService.triggerActivitySimulation();
  }
}
