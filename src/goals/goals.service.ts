import { Injectable, NotFoundException } from '@nestjs/common';
import { FirebaseService } from '../firebase/firebase.service';
import { CreateGoalDto } from './dto/create-goal.dto';
import { UpdateGoalDto } from './dto/update-goal.dto';

export interface Goal {
  id: string;
  title: string;
  description: string;
  category: string;
  targetDate: string;
  progress: number;
  status: string;
  createdAt: string;
  updatedAt: string;
}

@Injectable()
export class GoalsService {
  private readonly collectionName = 'goals';

  constructor(private readonly firebaseService: FirebaseService) {}

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
    return this.firebaseService.createDocument<Goal>(
      this.collectionName,
      userId,
      createGoalDto,
    );
  }

  async update(
    userId: string,
    id: string,
    updateGoalDto: UpdateGoalDto,
  ): Promise<Goal> {
    const goal = await this.firebaseService.updateDocument<Goal>(
      this.collectionName,
      userId,
      id,
      updateGoalDto,
    );

    if (!goal) {
      throw new NotFoundException(`Goal with ID ${id} not found`);
    }

    return goal;
  }

  async remove(userId: string, id: string): Promise<{ success: boolean }> {
    await this.firebaseService.deleteDocument(this.collectionName, userId, id);
    return { success: true };
  }
}
