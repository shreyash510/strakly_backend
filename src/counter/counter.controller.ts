import { Controller, Get, Post, Param, Headers } from '@nestjs/common';
import { CounterService } from './counter.service';

@Controller('counters')
export class CounterController {
  constructor(private readonly counterService: CounterService) {}

  // Get all collection counts
  @Get()
  async getAllCounts() {
    return this.counterService.getAllCounts();
  }

  // Sync all counters with actual collection counts
  @Post('sync')
  async syncAllCounters() {
    return this.counterService.syncAllCounters();
  }

  // Get count for a specific collection
  @Get(':collection')
  async getCount(@Param('collection') collection: string) {
    const count = await this.counterService.getCount(collection);
    return { collection, count };
  }

  // Get counts for the current user
  @Get('user/me')
  async getUserCounts(@Headers('x-user-id') userId: string) {
    if (!userId) {
      return { error: 'User ID is required' };
    }
    return this.counterService.getUserCounts(userId);
  }

  // Get count for a specific user's collection
  @Get('user/:userId/:collection')
  async getUserCollectionCount(
    @Param('userId') userId: string,
    @Param('collection') collection: string,
  ) {
    const count = await this.counterService.getUserCollectionCount(userId, collection);
    return { userId, collection, count };
  }
}
