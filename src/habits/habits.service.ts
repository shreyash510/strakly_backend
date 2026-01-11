import { Injectable, NotFoundException, Inject, forwardRef } from '@nestjs/common';
import { DatabaseService } from '../database/database.service';
import { StreaksService } from '../streaks/streaks.service';
import { StreakItemType } from '../streaks/dto/create-streak-record.dto';
import { CreateHabitDto } from './dto/create-habit.dto';
import { UpdateHabitDto } from './dto/update-habit.dto';

export interface Habit {
  id: string;
  title: string;
  description: string;
  frequency: string;
  customDays: number[];
  isGoodHabit: boolean;
  isActive: boolean;
  targetDays?: number;
  thoughts?: string;
  createdAt: string;
  updatedAt: string;
}

@Injectable()
export class HabitsService {
  private readonly collectionName = 'habits';

  constructor(
    private readonly databaseService: DatabaseService,
    @Inject(forwardRef(() => StreaksService))
    private readonly streaksService: StreaksService,
  ) {}

  async findAll(userId: string): Promise<Habit[]> {
    return this.databaseService.getCollection<Habit>(
      this.collectionName,
      userId,
    );
  }

  async findOne(userId: string, id: string): Promise<Habit> {
    const habit = await this.databaseService.getDocument<Habit>(
      this.collectionName,
      userId,
      id,
    );

    if (!habit) {
      throw new NotFoundException(`Habit with ID ${id} not found`);
    }

    return habit;
  }

  async create(userId: string, createHabitDto: CreateHabitDto): Promise<Habit> {
    const habitData = {
      ...createHabitDto,
      customDays: createHabitDto.customDays || [],
      isActive: true,
    };

    // Create habit in database
    const habit = await this.databaseService.createDocument<Habit>(
      this.collectionName,
      userId,
      habitData,
    );

    // Register habit for streak tracking
    await this.streaksService.registerItem(
      userId,
      habit.id,
      StreakItemType.HABIT,
      habit.title,
      habit.isGoodHabit,
    );

    return habit;
  }

  async update(
    userId: string,
    id: string,
    updateHabitDto: UpdateHabitDto,
  ): Promise<Habit> {
    const habit = await this.databaseService.updateDocument<Habit>(
      this.collectionName,
      userId,
      id,
      updateHabitDto,
    );

    if (!habit) {
      throw new NotFoundException(`Habit with ID ${id} not found`);
    }

    // Update name in streak tracking if title changed
    if (updateHabitDto.title) {
      await this.streaksService.updateItemName(userId, id, updateHabitDto.title);
    }

    return habit;
  }

  // Complete habit for today - uses central streak service
  async completeToday(userId: string, id: string): Promise<{ habit: Habit; streak: any }> {
    const habit = await this.findOne(userId, id);

    // Use central streak service to track completion
    const streak = await this.streaksService.completeItem(userId, id);

    return { habit, streak };
  }

  async toggleActive(userId: string, id: string): Promise<Habit> {
    const habit = await this.findOne(userId, id);

    return this.databaseService.updateDocument<Habit>(
      this.collectionName,
      userId,
      id,
      { isActive: !habit.isActive },
    );
  }

  async remove(userId: string, id: string): Promise<{ success: boolean }> {
    // Remove from streak tracking
    await this.streaksService.removeItem(userId, id);

    // Delete habit
    await this.databaseService.deleteDocument(this.collectionName, userId, id);
    return { success: true };
  }

  // Get habit with its current streak
  async getHabitWithStreak(userId: string, id: string): Promise<{ habit: Habit; streak: any }> {
    const habit = await this.findOne(userId, id);
    const streak = await this.streaksService.getItemStreak(userId, id);
    return { habit, streak };
  }

  // Get all habits with their streaks
  async getAllWithStreaks(userId: string): Promise<{ habit: Habit; streak: any }[]> {
    const habits = await this.findAll(userId);
    const results: { habit: Habit; streak: any }[] = [];

    for (const habit of habits) {
      const streak = await this.streaksService.getItemStreak(userId, habit.id);
      results.push({ habit, streak });
    }

    return results;
  }
}
