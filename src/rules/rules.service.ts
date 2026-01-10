import { Injectable, NotFoundException } from '@nestjs/common';
import { FirebaseService } from '../firebase/firebase.service';
import { CreateRuleDto } from './dto/create-rule.dto';
import { UpdateRuleDto } from './dto/update-rule.dto';

export interface Rule {
  id: string;
  title: string;
  description: string;
  isActive: boolean;
  priority: number;
  createdAt: string;
  updatedAt: string;
}

@Injectable()
export class RulesService {
  private readonly collectionName = 'rules';

  constructor(private readonly firebaseService: FirebaseService) {}

  async findAll(userId: string): Promise<Rule[]> {
    return this.firebaseService.getCollection<Rule>(
      this.collectionName,
      userId,
    );
  }

  async findOne(userId: string, id: string): Promise<Rule> {
    const rule = await this.firebaseService.getDocument<Rule>(
      this.collectionName,
      userId,
      id,
    );

    if (!rule) {
      throw new NotFoundException(`Rule with ID ${id} not found`);
    }

    return rule;
  }

  async create(userId: string, createRuleDto: CreateRuleDto): Promise<Rule> {
    return this.firebaseService.createDocument<Rule>(
      this.collectionName,
      userId,
      createRuleDto,
    );
  }

  async update(
    userId: string,
    id: string,
    updateRuleDto: UpdateRuleDto,
  ): Promise<Rule> {
    const rule = await this.firebaseService.updateDocument<Rule>(
      this.collectionName,
      userId,
      id,
      updateRuleDto,
    );

    if (!rule) {
      throw new NotFoundException(`Rule with ID ${id} not found`);
    }

    return rule;
  }

  async toggleActive(userId: string, id: string): Promise<Rule> {
    const rule = await this.findOne(userId, id);

    return this.firebaseService.updateDocument<Rule>(
      this.collectionName,
      userId,
      id,
      { isActive: !rule.isActive },
    );
  }

  async remove(userId: string, id: string): Promise<{ success: boolean }> {
    await this.firebaseService.deleteDocument(this.collectionName, userId, id);
    return { success: true };
  }
}
