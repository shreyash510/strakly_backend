import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  Query,
  UseGuards,
} from '@nestjs/common';
import { StreaksService } from './streaks.service';
import { StreakItemType } from './dto/create-streak-record.dto';
import { JwtAuthGuard } from '../auth/guards';
import { CurrentUser } from '../auth/decorators';

@Controller('streaks')
@UseGuards(JwtAuthGuard)
export class StreaksController {
  constructor(private readonly streaksService: StreaksService) {}

  // Get all current streaks
  @Get()
  async getCurrentStreaks(@CurrentUser() user: any) {
    return this.streaksService.getCurrentStreaks(user.userId);
  }

  // Get streak summary for dashboard
  @Get('summary')
  async getStreakSummary(@CurrentUser() user: any) {
    return this.streaksService.getStreakSummary(user.userId);
  }

  // Get streak for a specific item
  @Get('item/:itemId')
  async getItemStreak(@CurrentUser() user: any, @Param('itemId') itemId: string) {
    return this.streaksService.getItemStreak(user.userId, itemId);
  }

  // Get items by type (habit/goal/task)
  @Get('type/:itemType')
  async getItemsByType(
    @CurrentUser() user: any,
    @Param('itemType') itemType: StreakItemType,
  ) {
    return this.streaksService.getItemsByType(user.userId, itemType);
  }

  // Get streak history for an item
  @Get('history/:itemId')
  async getStreakHistory(
    @CurrentUser() user: any,
    @Param('itemId') itemId: string,
    @Query('limit') limit?: number,
  ) {
    return this.streaksService.getStreakHistory(user.userId, itemId, limit || 30);
  }

  // Get all records for a specific date
  @Get('date/:date')
  async getRecordsForDate(@CurrentUser() user: any, @Param('date') date: string) {
    return this.streaksService.getRecordsForDate(user.userId, date);
  }

  // Register a new item for streak tracking
  @Post('register')
  async registerItem(
    @CurrentUser() user: any,
    @Body()
    body: {
      itemId: string;
      itemType: StreakItemType;
      itemName: string;
      isGoodHabit?: boolean;
    },
  ) {
    return this.streaksService.registerItem(
      user.userId,
      body.itemId,
      body.itemType,
      body.itemName,
      body.isGoodHabit,
    );
  }

  // Complete item for today (increment streak)
  @Patch('complete/:itemId')
  async completeItem(@CurrentUser() user: any, @Param('itemId') itemId: string) {
    return this.streaksService.completeItem(user.userId, itemId);
  }

  // Reset streak to zero
  @Patch('reset/:itemId')
  async resetStreak(@CurrentUser() user: any, @Param('itemId') itemId: string) {
    return this.streaksService.resetStreak(user.userId, itemId);
  }

  // Update item name
  @Patch('rename/:itemId')
  async updateItemName(
    @CurrentUser() user: any,
    @Param('itemId') itemId: string,
    @Body('name') name: string,
  ) {
    return this.streaksService.updateItemName(user.userId, itemId, name);
  }

  // Remove item from streak tracking
  @Delete(':itemId')
  async removeItem(@CurrentUser() user: any, @Param('itemId') itemId: string) {
    await this.streaksService.removeItem(user.userId, itemId);
    return { success: true };
  }
}
