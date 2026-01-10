import { Controller, Post } from '@nestjs/common';
import { SchedulerService } from './scheduler.service';

@Controller('scheduler')
export class SchedulerController {
  constructor(private readonly schedulerService: SchedulerService) {}

  // Manual trigger for testing (should be protected in production)
  @Post('trigger-end-of-day')
  async triggerEndOfDay() {
    return this.schedulerService.triggerEndOfDay();
  }
}
