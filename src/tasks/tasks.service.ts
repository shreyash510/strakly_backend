import { Injectable, NotFoundException } from '@nestjs/common';
import { DatabaseService } from '../database/database.service';
import { CreateTaskDto } from './dto/create-task.dto';
import { UpdateTaskDto } from './dto/update-task.dto';

export interface Task {
  id: string;
  title: string;
  description: string;
  dueDate: string;
  priority: string;
  status: string;
  completedAt?: string;
  createdAt: string;
  updatedAt: string;
}

@Injectable()
export class TasksService {
  private readonly collectionName = 'tasks';

  constructor(private readonly databaseService: DatabaseService) {}

  async findAll(userId: string): Promise<Task[]> {
    return this.databaseService.getCollection<Task>(
      this.collectionName,
      userId,
    );
  }

  async findOne(userId: string, id: string): Promise<Task> {
    const task = await this.databaseService.getDocument<Task>(
      this.collectionName,
      userId,
      id,
    );

    if (!task) {
      throw new NotFoundException(`Task with ID ${id} not found`);
    }

    return task;
  }

  async create(userId: string, createTaskDto: CreateTaskDto): Promise<Task> {
    return this.databaseService.createDocument<Task>(
      this.collectionName,
      userId,
      createTaskDto,
    );
  }

  async update(
    userId: string,
    id: string,
    updateTaskDto: UpdateTaskDto,
  ): Promise<Task> {
    const updateData: Partial<Task> = { ...updateTaskDto };

    // If status is being changed to completed, add completedAt
    if (updateTaskDto.status === 'completed') {
      updateData.completedAt = new Date().toISOString();
    }

    const task = await this.databaseService.updateDocument<Task>(
      this.collectionName,
      userId,
      id,
      updateData,
    );

    if (!task) {
      throw new NotFoundException(`Task with ID ${id} not found`);
    }

    return task;
  }

  async toggleStatus(userId: string, id: string): Promise<Task> {
    const task = await this.findOne(userId, id);

    const newStatus = task.status === 'completed' ? 'pending' : 'completed';
    const updateData: Partial<Task> = {
      status: newStatus,
    };

    if (newStatus === 'completed') {
      updateData.completedAt = new Date().toISOString();
    } else {
      updateData.completedAt = undefined;
    }

    return this.databaseService.updateDocument<Task>(
      this.collectionName,
      userId,
      id,
      updateData,
    );
  }

  async remove(userId: string, id: string): Promise<{ success: boolean }> {
    await this.databaseService.deleteDocument(this.collectionName, userId, id);
    return { success: true };
  }
}
