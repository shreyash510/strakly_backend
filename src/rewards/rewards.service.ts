import { Injectable, NotFoundException } from '@nestjs/common';
import { FirebaseService } from '../firebase/firebase.service';
import { CreateRewardDto } from './dto/create-reward.dto';
import { UpdateRewardDto } from './dto/update-reward.dto';

export interface Reward {
  id: string;
  challenge: string;
  reward: string;
  startDate: string;
  endDate: string;
  status: string;
  claimedAt?: string;
  createdAt: string;
  updatedAt: string;
}

@Injectable()
export class RewardsService {
  private readonly collectionName = 'rewards';

  constructor(private readonly firebaseService: FirebaseService) {}

  async findAll(userId: string): Promise<Reward[]> {
    return this.firebaseService.getCollection<Reward>(
      this.collectionName,
      userId,
    );
  }

  async findOne(userId: string, id: string): Promise<Reward> {
    const reward = await this.firebaseService.getDocument<Reward>(
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
      status: 'in_progress',
    };

    return this.firebaseService.createDocument<Reward>(
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
    const reward = await this.firebaseService.updateDocument<Reward>(
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

  async markCompleted(userId: string, id: string): Promise<Reward> {
    return this.firebaseService.updateDocument<Reward>(
      this.collectionName,
      userId,
      id,
      { status: 'completed' },
    );
  }

  async markFailed(userId: string, id: string): Promise<Reward> {
    return this.firebaseService.updateDocument<Reward>(
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

    return this.firebaseService.updateDocument<Reward>(
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
    await this.firebaseService.deleteDocument(this.collectionName, userId, id);
    return { success: true };
  }
}
