import { Injectable, OnModuleInit } from '@nestjs/common';
import { InjectConnection } from '@nestjs/mongoose';
import { Connection, Model } from 'mongoose';
import {
  UserSchema,
  GoalSchema,
  HabitSchema,
  TaskSchema,
  RewardSchema,
  PunishmentSchema,
  FriendSchema,
  FriendRequestSchema,
  ChallengeSchema,
  ChallengeInvitationSchema,
  PostSchema,
  StreakSchema,
  GymSchema,
  TrainerSchema,
  ProgramSchema,
  AnnouncementSchema,
  SupportSchema,
  NotificationSchema,
} from '../schemas';

@Injectable()
export class BaseMongoService implements OnModuleInit {
  protected models: Map<string, Model<any>> = new Map();

  constructor(@InjectConnection() protected connection: Connection) {}

  onModuleInit() {
    // Register all models
    this.models.set('users', this.connection.model('User', UserSchema));
    this.models.set('goals', this.connection.model('Goal', GoalSchema));
    this.models.set('habits', this.connection.model('Habit', HabitSchema));
    this.models.set('tasks', this.connection.model('Task', TaskSchema));
    this.models.set('rewards', this.connection.model('Reward', RewardSchema));
    this.models.set('punishments', this.connection.model('Punishment', PunishmentSchema));
    this.models.set('friends', this.connection.model('Friend', FriendSchema));
    this.models.set('friendRequests', this.connection.model('FriendRequest', FriendRequestSchema));
    this.models.set('challenges', this.connection.model('Challenge', ChallengeSchema));
    this.models.set('challengeInvitations', this.connection.model('ChallengeInvitation', ChallengeInvitationSchema));
    this.models.set('posts', this.connection.model('Post', PostSchema));
    this.models.set('streaks', this.connection.model('Streak', StreakSchema));
    // New models
    this.models.set('gyms', this.connection.model('Gym', GymSchema));
    this.models.set('trainers', this.connection.model('Trainer', TrainerSchema));
    this.models.set('programs', this.connection.model('Program', ProgramSchema));
    this.models.set('announcements', this.connection.model('Announcement', AnnouncementSchema));
    this.models.set('support_tickets', this.connection.model('Support', SupportSchema));
    this.models.set('notifications', this.connection.model('Notification', NotificationSchema));
  }

  getModel(name: string): Model<any> {
    const model = this.models.get(name);
    if (!model) {
      throw new Error(`Model ${name} not found`);
    }
    return model;
  }

  getConnection(): Connection {
    return this.connection;
  }

  // Generic CRUD operations
  async getCollection<T>(collectionName: string, userId: string): Promise<T[]> {
    const model = this.getModel(collectionName);
    const docs = await model.find({ userId }).sort({ createdAt: -1 }).lean();
    return docs.map((doc: any) => ({
      id: doc._id.toString(),
      ...doc,
      _id: undefined,
    })) as T[];
  }

  async getDocument<T>(collectionName: string, userId: string, docId: string): Promise<T | null> {
    const model = this.getModel(collectionName);
    const doc = await model.findOne({ _id: docId, userId }).lean();
    if (!doc) {
      return null;
    }
    return {
      id: (doc as any)._id.toString(),
      ...doc,
      _id: undefined,
    } as T;
  }

  async createDocument<T>(collectionName: string, userId: string, data: Record<string, any>): Promise<T> {
    const model = this.getModel(collectionName);
    const doc = await model.create({
      ...data,
      userId,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });
    const obj = doc.toObject();
    return {
      id: obj._id.toString(),
      ...obj,
      _id: undefined,
    } as T;
  }

  async updateDocument<T>(collectionName: string, userId: string, docId: string, data: Record<string, any>): Promise<T> {
    const model = this.getModel(collectionName);
    const doc = await model
      .findOneAndUpdate(
        { _id: docId, userId },
        { ...data, updatedAt: new Date().toISOString() },
        { new: true },
      )
      .lean();
    if (!doc) {
      return null as T;
    }
    return {
      id: (doc as any)._id.toString(),
      ...doc,
      _id: undefined,
    } as T;
  }

  async deleteDocument(collectionName: string, userId: string, docId: string): Promise<boolean> {
    const model = this.getModel(collectionName);
    await model.deleteOne({ _id: docId, userId });
    return true;
  }

  async setDocument<T>(collectionName: string, userId: string, docId: string, data: Record<string, any>): Promise<T> {
    const model = this.getModel(collectionName);
    const doc = await model
      .findOneAndUpdate(
        { _id: docId, userId },
        { ...data, userId, updatedAt: new Date().toISOString() },
        { new: true, upsert: true },
      )
      .lean();
    return {
      id: (doc as any)._id.toString(),
      ...doc,
      _id: undefined,
    } as T;
  }

  async getAllUsersCollection<T>(collectionName: string): Promise<{ userId: string; habits: T[] }[]> {
    const model = this.getModel(collectionName);
    const docs = await model.find().lean();

    const groupedByUser = new Map<string, T[]>();
    for (const doc of docs) {
      const userId = (doc as any).userId;
      if (!groupedByUser.has(userId)) {
        groupedByUser.set(userId, []);
      }
      groupedByUser.get(userId)!.push({
        id: (doc as any)._id.toString(),
        ...doc,
        _id: undefined,
      } as T);
    }

    return Array.from(groupedByUser.entries()).map(([userId, habits]) => ({
      userId,
      habits,
    }));
  }
}
