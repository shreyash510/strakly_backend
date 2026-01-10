import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { StreaksService } from '../streaks/streaks.service';

@Injectable()
export class SchedulerService {
  private readonly logger = new Logger(SchedulerService.name);

  constructor(private readonly streaksService: StreaksService) {}

  // Run every day at 11:45 PM
  @Cron('45 23 * * *')
  async handleEndOfDay() {
    this.logger.log('Running end-of-day streak processing at 11:45 PM...');

    try {
      const result = await this.streaksService.processEndOfDay();
      this.logger.log(
        `End-of-day processing complete: ${result.usersProcessed} users, ${result.itemsProcessed} items, ${result.streaksReduced} streaks reduced, ${result.recordsCreated} records created`,
      );
    } catch (error) {
      this.logger.error('Error during end-of-day processing:', error);
    }
  }

  // Manual trigger for testing
  async triggerEndOfDay(): Promise<{
    usersProcessed: number;
    itemsProcessed: number;
    streaksReduced: number;
    recordsCreated: number;
  }> {
    this.logger.log('Manually triggering end-of-day processing...');
    return this.streaksService.processEndOfDay();
  }
}
