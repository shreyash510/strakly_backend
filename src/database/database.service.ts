import { Injectable, OnModuleInit, Optional } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { FirebaseService } from '../firebase/firebase.service';
import { UserFirebaseService } from '../firebase/services';
import { BaseMongoService, UserMongoService } from './services';

@Injectable()
export class DatabaseService implements OnModuleInit {
  private readonly databaseType: string;

  constructor(
    private configService: ConfigService,
    // Firebase services
    @Optional() private firebaseService: FirebaseService,
    @Optional() private userFirebaseService: UserFirebaseService,
    // MongoDB services
    @Optional() private baseMongoService: BaseMongoService,
    @Optional() private userMongoService: UserMongoService,
  ) {
    this.databaseType = this.configService.get<string>('DATABASE_TYPE') || 'firebase';
  }

  onModuleInit() {
    console.log(`DatabaseService initialized with type: ${this.databaseType}`);
  }

  isFirebase(): boolean {
    return this.databaseType === 'firebase';
  }

  isMongoDB(): boolean {
    return this.databaseType === 'mongodb';
  }

  // Get the underlying services for direct access when needed
  getFirebaseService(): FirebaseService {
    return this.firebaseService;
  }

  getUserMongoService(): UserMongoService {
    return this.userMongoService;
  }

  // Generic CRUD operations
  async getCollection<T>(collectionName: string, userId: string): Promise<T[]> {
    if (this.isMongoDB()) {
      return this.baseMongoService.getCollection<T>(collectionName, userId);
    }
    return this.firebaseService.getCollection<T>(collectionName, userId);
  }

  async getDocument<T>(collectionName: string, userId: string, docId: string): Promise<T | null> {
    if (this.isMongoDB()) {
      return this.baseMongoService.getDocument<T>(collectionName, userId, docId);
    }
    return this.firebaseService.getDocument<T>(collectionName, userId, docId);
  }

  async createDocument<T>(collectionName: string, userId: string, data: Record<string, any>): Promise<T> {
    if (this.isMongoDB()) {
      return this.baseMongoService.createDocument<T>(collectionName, userId, data);
    }
    return this.firebaseService.createDocument<T>(collectionName, userId, data);
  }

  async updateDocument<T>(collectionName: string, userId: string, docId: string, data: Record<string, any>): Promise<T> {
    if (this.isMongoDB()) {
      return this.baseMongoService.updateDocument<T>(collectionName, userId, docId, data);
    }
    return this.firebaseService.updateDocument<T>(collectionName, userId, docId, data);
  }

  async deleteDocument(collectionName: string, userId: string, docId: string): Promise<boolean> {
    if (this.isMongoDB()) {
      return this.baseMongoService.deleteDocument(collectionName, userId, docId);
    }
    return this.firebaseService.deleteDocument(collectionName, userId, docId);
  }

  async setDocument<T>(collectionName: string, userId: string, docId: string, data: Record<string, any>): Promise<T> {
    if (this.isMongoDB()) {
      return this.baseMongoService.setDocument<T>(collectionName, userId, docId, data);
    }
    return this.firebaseService.setDocument<T>(collectionName, userId, docId, data);
  }

  // User methods (for auth)
  async findUserByEmail(email: string): Promise<any | null> {
    if (this.isMongoDB()) {
      return this.userMongoService.findUserByEmail(email);
    }
    return this.userFirebaseService.findUserByEmail(email);
  }

  async findUserById(userId: string): Promise<any | null> {
    if (this.isMongoDB()) {
      return this.userMongoService.findUserById(userId);
    }
    return this.userFirebaseService.findUserById(userId);
  }

  async createUser(data: Record<string, any>): Promise<any> {
    if (this.isMongoDB()) {
      return this.userMongoService.createUser(data);
    }
    return this.userFirebaseService.createUser(data);
  }

  async updateUser(userId: string, data: Record<string, any>): Promise<any> {
    if (this.isMongoDB()) {
      return this.userMongoService.updateUser(userId, data);
    }
    return this.userFirebaseService.updateUser(userId, data);
  }

  async searchUsers(
    query: string,
    excludeUserId?: string,
    page: number = 1,
    limit: number = 20,
  ): Promise<{ users: any[]; hasMore: boolean; page: number; total?: number }> {
    if (this.isMongoDB()) {
      return this.userMongoService.searchUsers(query, excludeUserId, page, limit);
    }
    return this.userFirebaseService.searchUsers(query, excludeUserId, page, limit);
  }
}
