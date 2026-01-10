import { Injectable, NotFoundException, Inject, forwardRef } from '@nestjs/common';
import { FirebaseService } from '../firebase/firebase.service';
import { StreaksService } from '../streaks/streaks.service';
import { StreakItemType } from '../streaks/dto/create-streak-record.dto';
import { CreateGoalDto } from './dto/create-goal.dto';
import { UpdateGoalDto } from './dto/update-goal.dto';

export interface Goal {
  id: string;
  title: string;
  description: string;
  category: string;
  goalType: string;
  targetDate: string;
  progress: number;
  status: string;
  targetAmount?: number;
  currentAmount?: number;
  createdAt: string;
  updatedAt: string;
}

@Injectable()
export class GoalsService {
  private readonly collectionName = 'goals';

  constructor(
    private readonly firebaseService: FirebaseService,
    @Inject(forwardRef(() => StreaksService))
    private readonly streaksService: StreaksService,
  ) {}

  async findAll(userId: string): Promise<Goal[]> {
    return this.firebaseService.getCollection<Goal>(
      this.collectionName,
      userId,
    );
  }

  async findOne(userId: string, id: string): Promise<Goal> {
    const goal = await this.firebaseService.getDocument<Goal>(
      this.collectionName,
      userId,
      id,
    );

    if (!goal) {
      throw new NotFoundException(`Goal with ID ${id} not found`);
    }

    return goal;
  }

  async create(userId: string, createGoalDto: CreateGoalDto): Promise<Goal> {
    const goalData = {
      ...createGoalDto,
      goalType: createGoalDto.goalType || 'regular',
    };

    // Calculate progress for savings goals
    if (goalData.goalType === 'savings' && goalData.targetAmount && goalData.targetAmount > 0) {
      const currentAmount = goalData.currentAmount || 0;
      goalData.progress = Math.min(100, Math.round((currentAmount / goalData.targetAmount) * 100));
    }

    // Create goal in database
    const goal = await this.firebaseService.createDocument<Goal>(
      this.collectionName,
      userId,
      goalData,
    );

    // Register goal for streak tracking
    await this.streaksService.registerItem(
      userId,
      goal.id,
      StreakItemType.GOAL,
      goal.title,
    );

    return goal;
  }

  async update(
    userId: string,
    id: string,
    updateGoalDto: UpdateGoalDto,
  ): Promise<Goal> {
    const existingGoal = await this.findOne(userId, id);
    const updateData = { ...updateGoalDto };

    // Recalculate progress for savings goals
    const goalType = updateGoalDto.goalType || existingGoal.goalType;
    if (goalType === 'savings') {
      const targetAmount = updateGoalDto.targetAmount ?? existingGoal.targetAmount;
      const currentAmount = updateGoalDto.currentAmount ?? existingGoal.currentAmount ?? 0;

      if (targetAmount && targetAmount > 0) {
        updateData.progress = Math.min(100, Math.round((currentAmount / targetAmount) * 100));
      }
    }

    const goal = await this.firebaseService.updateDocument<Goal>(
      this.collectionName,
      userId,
      id,
      updateData,
    );

    if (!goal) {
      throw new NotFoundException(`Goal with ID ${id} not found`);
    }

    // Update name in streak tracking if title changed
    if (updateGoalDto.title) {
      await this.streaksService.updateItemName(userId, id, updateGoalDto.title);
    }

    return goal;
  }

  // Mark goal progress for today (increment streak)
  async markProgress(userId: string, id: string): Promise<{ goal: Goal; streak: any }> {
    const goal = await this.findOne(userId, id);

    // Use central streak service to track progress
    const streak = await this.streaksService.completeItem(userId, id);

    return { goal, streak };
  }

  async updateSavingsAmount(
    userId: string,
    id: string,
    amount: number,
  ): Promise<Goal> {
    const goal = await this.findOne(userId, id);

    if (goal.goalType !== 'savings') {
      throw new NotFoundException('This endpoint is only for savings goals');
    }

    const newAmount = (goal.currentAmount || 0) + amount;
    const progress = goal.targetAmount && goal.targetAmount > 0
      ? Math.min(100, Math.round((newAmount / goal.targetAmount) * 100))
      : 0;

    const updates: Partial<Goal> = {
      currentAmount: newAmount,
      progress,
    };

    // Auto-complete if target reached
    if (progress >= 100) {
      updates.status = 'completed';
    }

    // Also mark streak progress when adding savings
    await this.streaksService.completeItem(userId, id);

    return this.firebaseService.updateDocument<Goal>(
      this.collectionName,
      userId,
      id,
      updates,
    );
  }

  async remove(userId: string, id: string): Promise<{ success: boolean }> {
    // Remove from streak tracking
    await this.streaksService.removeItem(userId, id);

    // Delete goal
    await this.firebaseService.deleteDocument(this.collectionName, userId, id);
    return { success: true };
  }

  // Get goal with its current streak
  async getGoalWithStreak(userId: string, id: string): Promise<{ goal: Goal; streak: any }> {
    const goal = await this.findOne(userId, id);
    const streak = await this.streaksService.getItemStreak(userId, id);
    return { goal, streak };
  }

  // Get all goals with their streaks
  async getAllWithStreaks(userId: string): Promise<{ goal: Goal; streak: any }[]> {
    const goals = await this.findAll(userId);
    const results: { goal: Goal; streak: any }[] = [];

    for (const goal of goals) {
      const streak = await this.streaksService.getItemStreak(userId, goal.id);
      results.push({ goal, streak });
    }

    return results;
  }
}
