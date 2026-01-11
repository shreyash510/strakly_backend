import { Injectable, Logger } from '@nestjs/common';
import { DatabaseService } from '../database/database.service';
import { StreakItemType } from './dto/create-streak-record.dto';

// Current streak state for an item
export interface ItemStreak {
  itemId: string;
  itemType: StreakItemType;
  itemName: string;
  streak: number;
  longestStreak: number;
  lastCompletedDate?: string;
  isGoodHabit?: boolean;
}

// Daily streak record (snapshot)
export interface StreakRecord {
  id: string;
  itemId: string;
  itemType: StreakItemType;
  itemName: string;
  streak: number;
  longestStreak: number;
  date: string;
  completed: boolean;
  isGoodHabit?: boolean;
  createdAt: string;
}

// User's current streaks (single document)
export interface UserStreaks {
  id: string;
  items: Record<string, ItemStreak>; // keyed by itemId
  updatedAt: string;
}

@Injectable()
export class StreaksService {
  private readonly logger = new Logger(StreaksService.name);
  private readonly streaksCollection = 'current-streaks';
  private readonly recordsCollection = 'streak-records';
  private readonly docId = 'user-streaks';

  constructor(private readonly databaseService: DatabaseService) {}

  // =====================
  // CURRENT STREAKS MANAGEMENT
  // =====================

  // Get all current streaks for a user
  async getCurrentStreaks(userId: string): Promise<Record<string, ItemStreak>> {
    const doc = await this.databaseService.getDocument<UserStreaks>(
      this.streaksCollection,
      userId,
      this.docId,
    );
    return doc?.items || {};
  }

  // Get streak for a specific item
  async getItemStreak(userId: string, itemId: string): Promise<ItemStreak | null> {
    const streaks = await this.getCurrentStreaks(userId);
    return streaks[itemId] || null;
  }

  // Register a new item for streak tracking
  async registerItem(
    userId: string,
    itemId: string,
    itemType: StreakItemType,
    itemName: string,
    isGoodHabit?: boolean,
  ): Promise<ItemStreak> {
    const streaks = await this.getCurrentStreaks(userId);

    const newItem: ItemStreak = {
      itemId,
      itemType,
      itemName,
      streak: 0,
      longestStreak: 0,
      isGoodHabit,
    };

    streaks[itemId] = newItem;

    await this.databaseService.setDocument(
      this.streaksCollection,
      userId,
      this.docId,
      { items: streaks },
    );

    return newItem;
  }

  // Mark item as completed for today - increases streak
  async completeItem(userId: string, itemId: string): Promise<ItemStreak> {
    const streaks = await this.getCurrentStreaks(userId);
    const today = new Date().toISOString().split('T')[0];

    if (!streaks[itemId]) {
      throw new Error(`Item ${itemId} not registered for streak tracking`);
    }

    const item = streaks[itemId];

    // Already completed today
    if (item.lastCompletedDate === today) {
      return item;
    }

    // Increment streak
    item.streak += 1;
    item.longestStreak = Math.max(item.streak, item.longestStreak);
    item.lastCompletedDate = today;

    streaks[itemId] = item;

    await this.databaseService.setDocument(
      this.streaksCollection,
      userId,
      this.docId,
      { items: streaks },
    );

    this.logger.log(`Streak incremented for ${item.itemName}: ${item.streak}`);

    return item;
  }

  // Reduce streak (called by end-of-day job)
  async reduceStreak(
    userId: string,
    itemId: string,
    amount: number = 2,
  ): Promise<ItemStreak> {
    const streaks = await this.getCurrentStreaks(userId);

    if (!streaks[itemId]) {
      throw new Error(`Item ${itemId} not registered for streak tracking`);
    }

    const item = streaks[itemId];
    const oldStreak = item.streak;
    item.streak = Math.max(0, item.streak - amount);

    streaks[itemId] = item;

    await this.databaseService.setDocument(
      this.streaksCollection,
      userId,
      this.docId,
      { items: streaks },
    );

    this.logger.log(
      `Streak reduced for ${item.itemName}: ${oldStreak} -> ${item.streak}`,
    );

    return item;
  }

  // Reset streak to zero
  async resetStreak(userId: string, itemId: string): Promise<ItemStreak> {
    const streaks = await this.getCurrentStreaks(userId);

    if (!streaks[itemId]) {
      throw new Error(`Item ${itemId} not registered for streak tracking`);
    }

    const item = streaks[itemId];
    item.streak = 0;

    streaks[itemId] = item;

    await this.databaseService.setDocument(
      this.streaksCollection,
      userId,
      this.docId,
      { items: streaks },
    );

    return item;
  }

  // Remove item from streak tracking
  async removeItem(userId: string, itemId: string): Promise<void> {
    const streaks = await this.getCurrentStreaks(userId);
    delete streaks[itemId];

    await this.databaseService.setDocument(
      this.streaksCollection,
      userId,
      this.docId,
      { items: streaks },
    );
  }

  // Update item name (when habit/goal is renamed)
  async updateItemName(
    userId: string,
    itemId: string,
    newName: string,
  ): Promise<ItemStreak> {
    const streaks = await this.getCurrentStreaks(userId);

    if (!streaks[itemId]) {
      throw new Error(`Item ${itemId} not registered for streak tracking`);
    }

    streaks[itemId].itemName = newName;

    await this.databaseService.setDocument(
      this.streaksCollection,
      userId,
      this.docId,
      { items: streaks },
    );

    return streaks[itemId];
  }

  // =====================
  // DAILY RECORDS (HISTORY)
  // =====================

  // Record today's streak snapshot for an item
  async recordDailyStreak(
    userId: string,
    itemId: string,
    completed: boolean,
  ): Promise<StreakRecord> {
    const item = await this.getItemStreak(userId, itemId);
    if (!item) {
      throw new Error(`Item ${itemId} not registered for streak tracking`);
    }

    const today = new Date().toISOString().split('T')[0];

    const record: Omit<StreakRecord, 'id' | 'createdAt'> = {
      itemId: item.itemId,
      itemType: item.itemType,
      itemName: item.itemName,
      streak: item.streak,
      longestStreak: item.longestStreak,
      date: today,
      completed,
      isGoodHabit: item.isGoodHabit,
    };

    return this.databaseService.createDocument<StreakRecord>(
      this.recordsCollection,
      userId,
      record,
    );
  }

  // Get streak history for an item
  async getStreakHistory(
    userId: string,
    itemId: string,
    limit: number = 30,
  ): Promise<StreakRecord[]> {
    const records = await this.databaseService.getCollection<StreakRecord>(
      this.recordsCollection,
      userId,
    );

    return records
      .filter((r) => r.itemId === itemId)
      .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
      .slice(0, limit);
  }

  // Get all records for a specific date
  async getRecordsForDate(userId: string, date: string): Promise<StreakRecord[]> {
    const records = await this.databaseService.getCollection<StreakRecord>(
      this.recordsCollection,
      userId,
    );

    return records.filter((r) => r.date === date);
  }

  // =====================
  // END OF DAY PROCESSING
  // =====================

  // Process all users' streaks at end of day
  async processEndOfDay(): Promise<{
    usersProcessed: number;
    itemsProcessed: number;
    streaksReduced: number;
    recordsCreated: number;
  }> {
    const today = new Date().toISOString().split('T')[0];
    let usersProcessed = 0;
    let itemsProcessed = 0;
    let streaksReduced = 0;
    let recordsCreated = 0;

    // Get all users with streaks
    const allUsersData = await this.databaseService.getAllUsersCollection<UserStreaks>(
      this.streaksCollection,
    );

    for (const { userId, habits: docs } of allUsersData) {
      usersProcessed++;

      // Get the user's streaks document
      const userStreaks = await this.getCurrentStreaks(userId);

      for (const itemId of Object.keys(userStreaks)) {
        const item = userStreaks[itemId];
        itemsProcessed++;

        const wasCompleted = item.lastCompletedDate === today;

        // Record daily snapshot
        await this.recordDailyStreak(userId, itemId, wasCompleted);
        recordsCreated++;

        // If not completed today and has streak, reduce it
        if (!wasCompleted && item.streak > 0) {
          await this.reduceStreak(userId, itemId, 2);
          streaksReduced++;
        }
      }
    }

    this.logger.log(
      `End of day processing complete: ${usersProcessed} users, ${itemsProcessed} items, ${streaksReduced} reduced, ${recordsCreated} records`,
    );

    return {
      usersProcessed,
      itemsProcessed,
      streaksReduced,
      recordsCreated,
    };
  }

  // =====================
  // UTILITY METHODS
  // =====================

  // Get all items by type
  async getItemsByType(
    userId: string,
    itemType: StreakItemType,
  ): Promise<ItemStreak[]> {
    const streaks = await this.getCurrentStreaks(userId);
    return Object.values(streaks).filter((item) => item.itemType === itemType);
  }

  // Get streak summary for dashboard
  async getStreakSummary(userId: string): Promise<{
    totalItems: number;
    activeStreaks: number;
    longestCurrentStreak: number;
    completedToday: number;
    habits: ItemStreak[];
    goals: ItemStreak[];
    tasks: ItemStreak[];
  }> {
    const today = new Date().toISOString().split('T')[0];
    const streaks = await this.getCurrentStreaks(userId);
    const items = Object.values(streaks);

    return {
      totalItems: items.length,
      activeStreaks: items.filter((i) => i.streak > 0).length,
      longestCurrentStreak: Math.max(...items.map((i) => i.streak), 0),
      completedToday: items.filter((i) => i.lastCompletedDate === today).length,
      habits: items.filter((i) => i.itemType === StreakItemType.HABIT),
      goals: items.filter((i) => i.itemType === StreakItemType.GOAL),
      tasks: items.filter((i) => i.itemType === StreakItemType.TASK),
    };
  }
}
