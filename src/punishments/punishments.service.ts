import { Injectable, NotFoundException } from '@nestjs/common';
import { DatabaseService } from '../database/database.service';
import { CreatePunishmentRuleDto } from './dto/create-punishment-rule.dto';
import { UpdatePunishmentRuleDto } from './dto/update-punishment-rule.dto';
import { CreatePunishmentDto } from './dto/create-punishment.dto';
import { UpdatePunishmentDto } from './dto/update-punishment.dto';

export interface PunishmentRule {
  id: string;
  title: string;
  description: string;
  category: string;
  linkedItemId: string;
  linkedItemName: string;
  triggerStreak: number;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface Punishment {
  id: string;
  ruleId: string;
  title: string;
  description: string;
  reason: string;
  thoughts?: string;
  date?: string;
  category: string;
  linkedItemId: string;
  linkedItemName: string;
  streak?: number;
  status: string;
  completedAt?: string;
  createdAt: string;
  updatedAt: string;
}

@Injectable()
export class PunishmentsService {
  private readonly rulesCollection = 'punishment-rules';
  private readonly punishmentsCollection = 'punishments';

  constructor(private readonly databaseService: DatabaseService) {}

  // Punishment Rules CRUD
  async findAllRules(userId: string): Promise<PunishmentRule[]> {
    return this.databaseService.getCollection<PunishmentRule>(
      this.rulesCollection,
      userId,
    );
  }

  async findOneRule(userId: string, id: string): Promise<PunishmentRule> {
    const rule = await this.databaseService.getDocument<PunishmentRule>(
      this.rulesCollection,
      userId,
      id,
    );

    if (!rule) {
      throw new NotFoundException(`Punishment rule with ID ${id} not found`);
    }

    return rule;
  }

  async createRule(
    userId: string,
    createRuleDto: CreatePunishmentRuleDto,
  ): Promise<PunishmentRule> {
    const ruleData = {
      ...createRuleDto,
      isActive: true,
    };

    return this.databaseService.createDocument<PunishmentRule>(
      this.rulesCollection,
      userId,
      ruleData,
    );
  }

  async updateRule(
    userId: string,
    id: string,
    updateRuleDto: UpdatePunishmentRuleDto,
  ): Promise<PunishmentRule> {
    const rule = await this.databaseService.updateDocument<PunishmentRule>(
      this.rulesCollection,
      userId,
      id,
      updateRuleDto,
    );

    if (!rule) {
      throw new NotFoundException(`Punishment rule with ID ${id} not found`);
    }

    return rule;
  }

  async toggleRuleActive(userId: string, id: string): Promise<PunishmentRule> {
    const rule = await this.findOneRule(userId, id);
    return this.databaseService.updateDocument<PunishmentRule>(
      this.rulesCollection,
      userId,
      id,
      { isActive: !rule.isActive },
    );
  }

  async removeRule(userId: string, id: string): Promise<{ success: boolean }> {
    await this.databaseService.deleteDocument(this.rulesCollection, userId, id);
    return { success: true };
  }

  // Punishments CRUD
  async findAllPunishments(userId: string): Promise<Punishment[]> {
    return this.databaseService.getCollection<Punishment>(
      this.punishmentsCollection,
      userId,
    );
  }

  async findOnePunishment(userId: string, id: string): Promise<Punishment> {
    const punishment = await this.databaseService.getDocument<Punishment>(
      this.punishmentsCollection,
      userId,
      id,
    );

    if (!punishment) {
      throw new NotFoundException(`Punishment with ID ${id} not found`);
    }

    return punishment;
  }

  async createPunishment(
    userId: string,
    createPunishmentDto: CreatePunishmentDto,
  ): Promise<Punishment> {
    const punishmentData = {
      ...createPunishmentDto,
      status: 'pending',
    };

    return this.databaseService.createDocument<Punishment>(
      this.punishmentsCollection,
      userId,
      punishmentData,
    );
  }

  async updatePunishment(
    userId: string,
    id: string,
    updatePunishmentDto: UpdatePunishmentDto,
  ): Promise<Punishment> {
    const punishment = await this.databaseService.updateDocument<Punishment>(
      this.punishmentsCollection,
      userId,
      id,
      updatePunishmentDto,
    );

    if (!punishment) {
      throw new NotFoundException(`Punishment with ID ${id} not found`);
    }

    return punishment;
  }

  async completePunishment(userId: string, id: string): Promise<Punishment> {
    return this.databaseService.updateDocument<Punishment>(
      this.punishmentsCollection,
      userId,
      id,
      {
        status: 'completed',
        completedAt: new Date().toISOString(),
      },
    );
  }

  async skipPunishment(userId: string, id: string): Promise<Punishment> {
    return this.databaseService.updateDocument<Punishment>(
      this.punishmentsCollection,
      userId,
      id,
      { status: 'skipped' },
    );
  }

  async removePunishment(userId: string, id: string): Promise<{ success: boolean }> {
    await this.databaseService.deleteDocument(this.punishmentsCollection, userId, id);
    return { success: true };
  }

  // Trigger punishment from rule
  async triggerPunishment(
    userId: string,
    ruleId: string,
    reason: string,
    streak?: number,
  ): Promise<Punishment> {
    const rule = await this.findOneRule(userId, ruleId);

    if (!rule.isActive) {
      throw new NotFoundException('Punishment rule is not active');
    }

    const punishmentData: CreatePunishmentDto = {
      ruleId: rule.id,
      title: rule.title,
      description: rule.description,
      reason,
      category: rule.category as any,
      linkedItemId: rule.linkedItemId,
      linkedItemName: rule.linkedItemName,
      streak,
      date: new Date().toISOString(),
    };

    return this.createPunishment(userId, punishmentData);
  }
}
