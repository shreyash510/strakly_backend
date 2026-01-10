import { Injectable, NotFoundException } from '@nestjs/common';
import { FirebaseService } from '../firebase/firebase.service';
import { CreateHabitDto } from './dto/create-habit.dto';
import { UpdateHabitDto } from './dto/update-habit.dto';

export interface Habit {
  id: string;
  title: string;
  description: string;
  frequency: string;
  customDays: number[];
  streak: number;
  longestStreak: number;
  completedDates: string[];
  isGoodHabit: boolean;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

@Injectable()
export class HabitsService {
  private readonly collectionName = 'habits';

  constructor(private readonly firebaseService: FirebaseService) {}

  async findAll(userId: string): Promise<Habit[]> {
    return this.firebaseService.getCollection<Habit>(
      this.collectionName,
      userId,
    );
  }

  async findOne(userId: string, id: string): Promise<Habit> {
    const habit = await this.firebaseService.getDocument<Habit>(
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
      streak: 0,
      longestStreak: 0,
      completedDates: [],
      isActive: true,
    };

    return this.firebaseService.createDocument<Habit>(
      this.collectionName,
      userId,
      habitData,
    );
  }

  async update(
    userId: string,
    id: string,
    updateHabitDto: UpdateHabitDto,
  ): Promise<Habit> {
    const habit = await this.firebaseService.updateDocument<Habit>(
      this.collectionName,
      userId,
      id,
      updateHabitDto,
    );

    if (!habit) {
      throw new NotFoundException(`Habit with ID ${id} not found`);
    }

    return habit;
  }

  async toggleCompletion(
    userId: string,
    id: string,
    date: string,
  ): Promise<Habit> {
    const habit = await this.findOne(userId, id);

    const dateIndex = habit.completedDates.indexOf(date);
    let completedDates: string[];

    if (dateIndex > -1) {
      completedDates = habit.completedDates.filter((d) => d !== date);
    } else {
      completedDates = [...habit.completedDates, date];
    }

    const newStreak = this.calculateStreak(completedDates, habit.frequency);
    const longestStreak = Math.max(newStreak, habit.longestStreak);

    return this.firebaseService.updateDocument<Habit>(
      this.collectionName,
      userId,
      id,
      { completedDates, streak: newStreak, longestStreak },
    );
  }

  async toggleActive(userId: string, id: string): Promise<Habit> {
    const habit = await this.findOne(userId, id);

    return this.firebaseService.updateDocument<Habit>(
      this.collectionName,
      userId,
      id,
      { isActive: !habit.isActive },
    );
  }

  async remove(userId: string, id: string): Promise<{ success: boolean }> {
    await this.firebaseService.deleteDocument(this.collectionName, userId, id);
    return { success: true };
  }

  private calculateStreak(completedDates: string[], frequency: string): number {
    if (completedDates.length === 0) return 0;

    const sortedDates = [...completedDates].sort(
      (a, b) => new Date(b).getTime() - new Date(a).getTime(),
    );

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const lastCompleted = new Date(sortedDates[0]);
    lastCompleted.setHours(0, 0, 0, 0);

    const daysDiff = Math.floor(
      (today.getTime() - lastCompleted.getTime()) / (1000 * 60 * 60 * 24),
    );

    if (frequency === 'daily' && daysDiff > 1) return 0;
    if (frequency === 'weekly' && daysDiff > 7) return 0;

    let streak = 1;
    for (let i = 1; i < sortedDates.length; i++) {
      const current = new Date(sortedDates[i - 1]);
      const previous = new Date(sortedDates[i]);
      const diff = Math.floor(
        (current.getTime() - previous.getTime()) / (1000 * 60 * 60 * 24),
      );

      const maxGap = frequency === 'weekly' ? 7 : 1;
      if (diff <= maxGap) {
        streak++;
      } else {
        break;
      }
    }

    return streak;
  }
}
