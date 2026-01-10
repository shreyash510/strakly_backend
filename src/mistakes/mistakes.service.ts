import { Injectable, NotFoundException } from '@nestjs/common';
import { FirebaseService } from '../firebase/firebase.service';
import { CreateMistakeDto } from './dto/create-mistake.dto';
import { UpdateMistakeDto } from './dto/update-mistake.dto';

export interface Mistake {
  id: string;
  title: string;
  description: string;
  lesson: string;
  date: string;
  category: string;
  isResolved: boolean;
  createdAt: string;
  updatedAt: string;
}

@Injectable()
export class MistakesService {
  private readonly collectionName = 'mistakes';

  constructor(private readonly firebaseService: FirebaseService) {}

  async findAll(userId: string): Promise<Mistake[]> {
    return this.firebaseService.getCollection<Mistake>(
      this.collectionName,
      userId,
    );
  }

  async findOne(userId: string, id: string): Promise<Mistake> {
    const mistake = await this.firebaseService.getDocument<Mistake>(
      this.collectionName,
      userId,
      id,
    );

    if (!mistake) {
      throw new NotFoundException(`Mistake with ID ${id} not found`);
    }

    return mistake;
  }

  async create(
    userId: string,
    createMistakeDto: CreateMistakeDto,
  ): Promise<Mistake> {
    return this.firebaseService.createDocument<Mistake>(
      this.collectionName,
      userId,
      createMistakeDto,
    );
  }

  async update(
    userId: string,
    id: string,
    updateMistakeDto: UpdateMistakeDto,
  ): Promise<Mistake> {
    const mistake = await this.firebaseService.updateDocument<Mistake>(
      this.collectionName,
      userId,
      id,
      updateMistakeDto,
    );

    if (!mistake) {
      throw new NotFoundException(`Mistake with ID ${id} not found`);
    }

    return mistake;
  }

  async toggleResolved(userId: string, id: string): Promise<Mistake> {
    const mistake = await this.findOne(userId, id);

    return this.firebaseService.updateDocument<Mistake>(
      this.collectionName,
      userId,
      id,
      { isResolved: !mistake.isResolved },
    );
  }

  async remove(userId: string, id: string): Promise<{ success: boolean }> {
    await this.firebaseService.deleteDocument(this.collectionName, userId, id);
    return { success: true };
  }
}
