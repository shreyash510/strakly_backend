import { Injectable, OnModuleInit } from '@nestjs/common';
import { BaseMongoService, UserMongoService } from './services';

@Injectable()
export class DatabaseService implements OnModuleInit {
  constructor(
    private baseMongoService: BaseMongoService,
    private userMongoService: UserMongoService,
  ) {}

  onModuleInit() {
    console.log('DatabaseService initialized with MongoDB');
  }

  getUserMongoService(): UserMongoService {
    return this.userMongoService;
  }

  // Generic CRUD operations
  async getCollection<T>(collectionName: string, userId: string): Promise<T[]> {
    return this.baseMongoService.getCollection<T>(collectionName, userId);
  }

  async getDocument<T>(collectionName: string, userId: string, docId: string): Promise<T | null> {
    return this.baseMongoService.getDocument<T>(collectionName, userId, docId);
  }

  async createDocument<T>(collectionName: string, userId: string, data: Record<string, any>): Promise<T> {
    return this.baseMongoService.createDocument<T>(collectionName, userId, data);
  }

  async updateDocument<T>(collectionName: string, userId: string, docId: string, data: Record<string, any>): Promise<T> {
    return this.baseMongoService.updateDocument<T>(collectionName, userId, docId, data);
  }

  async deleteDocument(collectionName: string, userId: string, docId: string): Promise<boolean> {
    return this.baseMongoService.deleteDocument(collectionName, userId, docId);
  }

  async setDocument<T>(collectionName: string, userId: string, docId: string, data: Record<string, any>): Promise<T> {
    return this.baseMongoService.setDocument<T>(collectionName, userId, docId, data);
  }

  // User methods (for auth)
  async findUserByEmail(email: string): Promise<any | null> {
    return this.userMongoService.findUserByEmail(email);
  }

  async findUserById(userId: string): Promise<any | null> {
    return this.userMongoService.findUserById(userId);
  }

  async createUser(data: Record<string, any>): Promise<any> {
    return this.userMongoService.createUser(data);
  }

  async updateUser(userId: string, data: Record<string, any>): Promise<any> {
    return this.userMongoService.updateUser(userId, data);
  }

  async searchUsers(
    query: string,
    excludeUserId?: string,
    page: number = 1,
    limit: number = 20,
  ): Promise<{ users: any[]; hasMore: boolean; page: number; total?: number }> {
    return this.userMongoService.searchUsers(query, excludeUserId, page, limit);
  }
}
