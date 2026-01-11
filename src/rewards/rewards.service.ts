import { Injectable, NotFoundException } from '@nestjs/common';
import { DatabaseService } from '../database/database.service';
import { CreateRewardDto } from './dto/create-reward.dto';
import { UpdateRewardDto } from './dto/update-reward.dto';

export interface Reward {
  id: string;
  challenge: string;
  reward: string;
  targetStreak: number;
  currentStreak: number;
  category?: string;
  linkedItemId?: string;
  linkedItemName?: string;
  status: string;
  claimedAt?: string;
  createdAt: string;
  updatedAt: string;
}

@Injectable()
export class RewardsService {
  private readonly collectionName = 'rewards';

  constructor(private readonly databaseService: DatabaseService) {}

  async findAll(userId: string): Promise<Reward[]> {
    return this.databaseService.getCollection<Reward>(
      this.collectionName,
      userId,
    );
  }

  async findOne(userId: string, id: string): Promise<Reward> {
    const reward = await this.databaseService.getDocument<Reward>(
      this.collectionName,
      userId,
      id,
    );

    if (!reward) {
      throw new NotFoundException(`Reward with ID ${id} not found`);
    }

    return reward;
  }

  async create(
    userId: string,
    createRewardDto: CreateRewardDto,
  ): Promise<Reward> {
    const rewardData = {
      ...createRewardDto,
      currentStreak: 0,
      status: 'in_progress',
    };

    return this.databaseService.createDocument<Reward>(
      this.collectionName,
      userId,
      rewardData,
    );
  }

  async update(
    userId: string,
    id: string,
    updateRewardDto: UpdateRewardDto,
  ): Promise<Reward> {
    const reward = await this.databaseService.updateDocument<Reward>(
      this.collectionName,
      userId,
      id,
      updateRewardDto,
    );

    if (!reward) {
      throw new NotFoundException(`Reward with ID ${id} not found`);
    }

    return reward;
  }

  async incrementStreak(userId: string, id: string): Promise<Reward> {
    const reward = await this.findOne(userId, id);
    const newStreak = reward.currentStreak + 1;
    const updates: Partial<Reward> = { currentStreak: newStreak };

    // Auto-complete if target reached
    if (newStreak >= reward.targetStreak) {
      updates.status = 'completed';
    }

    return this.databaseService.updateDocument<Reward>(
      this.collectionName,
      userId,
      id,
      updates,
    );
  }

  async resetStreak(userId: string, id: string): Promise<Reward> {
    return this.databaseService.updateDocument<Reward>(
      this.collectionName,
      userId,
      id,
      { currentStreak: 0 },
    );
  }

  async markCompleted(userId: string, id: string): Promise<Reward> {
    return this.databaseService.updateDocument<Reward>(
      this.collectionName,
      userId,
      id,
      { status: 'completed' },
    );
  }

  async markFailed(userId: string, id: string): Promise<Reward> {
    return this.databaseService.updateDocument<Reward>(
      this.collectionName,
      userId,
      id,
      { status: 'failed' },
    );
  }

  async claimReward(userId: string, id: string): Promise<Reward> {
    const reward = await this.findOne(userId, id);

    if (reward.status !== 'completed') {
      throw new NotFoundException('Reward can only be claimed when completed');
    }

    return this.databaseService.updateDocument<Reward>(
      this.collectionName,
      userId,
      id,
      {
        status: 'claimed',
        claimedAt: new Date().toISOString(),
      },
    );
  }

  async remove(userId: string, id: string): Promise<{ success: boolean }> {
    await this.databaseService.deleteDocument(this.collectionName, userId, id);
    return { success: true };
  }
}
