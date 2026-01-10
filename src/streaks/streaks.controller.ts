import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  Query,
  Headers,
  UnauthorizedException,
} from '@nestjs/common';
import { StreaksService } from './streaks.service';
import { StreakItemType } from './dto/create-streak-record.dto';

@Controller('streaks')
export class StreaksController {
  constructor(private readonly streaksService: StreaksService) {}

  private getUserId(authHeader: string): string {
    if (!authHeader) {
      throw new UnauthorizedException('User ID header is required');
    }
    return authHeader;
  }

  // Get all current streaks
  @Get()
  async getCurrentStreaks(@Headers('x-user-id') userId: string) {
    return this.streaksService.getCurrentStreaks(this.getUserId(userId));
  }

  // Get streak summary for dashboard
  @Get('summary')
  async getStreakSummary(@Headers('x-user-id') userId: string) {
    return this.streaksService.getStreakSummary(this.getUserId(userId));
  }

  // Get streak for a specific item
  @Get('item/:itemId')
  async getItemStreak(
    @Headers('x-user-id') userId: string,
    @Param('itemId') itemId: string,
  ) {
    return this.streaksService.getItemStreak(this.getUserId(userId), itemId);
  }

  // Get items by type (habit/goal/task)
  @Get('type/:itemType')
  async getItemsByType(
    @Headers('x-user-id') userId: string,
    @Param('itemType') itemType: StreakItemType,
  ) {
    return this.streaksService.getItemsByType(this.getUserId(userId), itemType);
  }

  // Get streak history for an item
  @Get('history/:itemId')
  async getStreakHistory(
    @Headers('x-user-id') userId: string,
    @Param('itemId') itemId: string,
    @Query('limit') limit?: number,
  ) {
    return this.streaksService.getStreakHistory(
      this.getUserId(userId),
      itemId,
      limit || 30,
    );
  }

  // Get all records for a specific date
  @Get('date/:date')
  async getRecordsForDate(
    @Headers('x-user-id') userId: string,
    @Param('date') date: string,
  ) {
    return this.streaksService.getRecordsForDate(this.getUserId(userId), date);
  }

  // Register a new item for streak tracking
  @Post('register')
  async registerItem(
    @Headers('x-user-id') userId: string,
    @Body()
    body: {
      itemId: string;
      itemType: StreakItemType;
      itemName: string;
      isGoodHabit?: boolean;
    },
  ) {
    return this.streaksService.registerItem(
      this.getUserId(userId),
      body.itemId,
      body.itemType,
      body.itemName,
      body.isGoodHabit,
    );
  }

  // Complete item for today (increment streak)
  @Patch('complete/:itemId')
  async completeItem(
    @Headers('x-user-id') userId: string,
    @Param('itemId') itemId: string,
  ) {
    return this.streaksService.completeItem(this.getUserId(userId), itemId);
  }

  // Reset streak to zero
  @Patch('reset/:itemId')
  async resetStreak(
    @Headers('x-user-id') userId: string,
    @Param('itemId') itemId: string,
  ) {
    return this.streaksService.resetStreak(this.getUserId(userId), itemId);
  }

  // Update item name
  @Patch('rename/:itemId')
  async updateItemName(
    @Headers('x-user-id') userId: string,
    @Param('itemId') itemId: string,
    @Body('name') name: string,
  ) {
    return this.streaksService.updateItemName(
      this.getUserId(userId),
      itemId,
      name,
    );
  }

  // Remove item from streak tracking
  @Delete(':itemId')
  async removeItem(
    @Headers('x-user-id') userId: string,
    @Param('itemId') itemId: string,
  ) {
    await this.streaksService.removeItem(this.getUserId(userId), itemId);
    return { success: true };
  }
}
