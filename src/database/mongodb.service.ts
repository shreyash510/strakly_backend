import { Injectable, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
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
} from './schemas';

@Injectable()
export class MongoDBService implements OnModuleInit {
  private models: Map<string, Model<any>> = new Map();

  constructor(
    private configService: ConfigService,
    @InjectConnection() private connection: Connection,
  ) {}

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

  // Generic CRUD operations for MongoDB (matching Firebase interface)
  async getCollection<T>(
    collectionName: string,
    userId: string,
  ): Promise<T[]> {
    const model = this.getModel(collectionName);
    const docs = await model.find({ userId }).sort({ createdAt: -1 }).lean();
    return docs.map((doc: any) => ({
      id: doc._id.toString(),
      ...doc,
      _id: undefined,
    })) as T[];
  }

  async getDocument<T>(
    collectionName: string,
    userId: string,
    docId: string,
  ): Promise<T | null> {
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

  async createDocument<T>(
    collectionName: string,
    userId: string,
    data: Record<string, any>,
  ): Promise<T> {
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

  async updateDocument<T>(
    collectionName: string,
    userId: string,
    docId: string,
    data: Record<string, any>,
  ): Promise<T> {
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

  async deleteDocument(
    collectionName: string,
    userId: string,
    docId: string,
  ): Promise<boolean> {
    const model = this.getModel(collectionName);
    await model.deleteOne({ _id: docId, userId });
    return true;
  }

  async setDocument<T>(
    collectionName: string,
    userId: string,
    docId: string,
    data: Record<string, any>,
  ): Promise<T> {
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

  // Get all documents from a collection across all users (for cron jobs)
  async getAllUsersCollection<T>(
    collectionName: string,
  ): Promise<{ userId: string; habits: T[] }[]> {
    const model = this.getModel(collectionName);
    const docs = await model.find().lean();

    // Group by userId
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

  // User-specific methods for auth
  async findUserByEmail(email: string): Promise<any | null> {
    const model = this.getModel('users');
    const doc = await model.findOne({ email }).lean();
    if (!doc) {
      return null;
    }
    return {
      id: (doc as any)._id.toString(),
      ...doc,
      _id: undefined,
    };
  }

  async findUserById(userId: string): Promise<any | null> {
    const model = this.getModel('users');
    const doc = await model.findById(userId).lean();
    if (!doc) {
      return null;
    }
    return {
      id: (doc as any)._id.toString(),
      ...doc,
      _id: undefined,
    };
  }

  async createUser(data: Record<string, any>): Promise<any> {
    const model = this.getModel('users');
    const doc = await model.create({
      ...data,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });
    const obj = doc.toObject();
    return {
      id: obj._id.toString(),
      ...obj,
      _id: undefined,
    };
  }

  async updateUser(userId: string, data: Record<string, any>): Promise<any> {
    const model = this.getModel('users');
    const doc = await model
      .findByIdAndUpdate(
        userId,
        { ...data, updatedAt: new Date().toISOString() },
        { new: true },
      )
      .lean();
    if (!doc) {
      return null;
    }
    return {
      id: (doc as any)._id.toString(),
      ...doc,
      _id: undefined,
    };
  }

  // Search users by name (for friends feature)
  async searchUsers(query: string, excludeUserId: string): Promise<any[]> {
    const model = this.getModel('users');
    const docs = await model
      .find({
        name: { $regex: query, $options: 'i' },
        _id: { $ne: excludeUserId },
      })
      .limit(20)
      .lean();
    return docs.map((doc: any) => ({
      id: doc._id.toString(),
      name: doc.name,
      email: doc.email,
    }));
  }

  // Friends-specific methods
  async findFriendship(userId1: string, userId2: string): Promise<any | null> {
    const model = this.getModel('friends');
    const doc = await model.findOne({
      $or: [
        { userId: userId1, friendId: userId2 },
        { userId: userId2, friendId: userId1 },
      ],
    }).lean();
    if (!doc) {
      return null;
    }
    return {
      id: (doc as any)._id.toString(),
      ...doc,
      _id: undefined,
    };
  }

  async getFriends(userId: string): Promise<any[]> {
    const model = this.getModel('friends');
    const docs = await model.find({
      $or: [{ userId }, { friendId: userId }],
    }).lean();
    return docs.map((doc: any) => ({
      id: doc._id.toString(),
      ...doc,
      _id: undefined,
    }));
  }

  async deleteFriendship(userId1: string, userId2: string): Promise<boolean> {
    const model = this.getModel('friends');
    await model.deleteOne({
      $or: [
        { userId: userId1, friendId: userId2 },
        { userId: userId2, friendId: userId1 },
      ],
    });
    return true;
  }

  // Friend requests
  async findFriendRequest(fromUserId: string, toUserId: string): Promise<any | null> {
    const model = this.getModel('friendRequests');
    const doc = await model.findOne({ fromUserId, toUserId, status: 'pending' }).lean();
    if (!doc) {
      return null;
    }
    return {
      id: (doc as any)._id.toString(),
      ...doc,
      _id: undefined,
    };
  }

  async getFriendRequestById(requestId: string): Promise<any | null> {
    const model = this.getModel('friendRequests');
    const doc = await model.findById(requestId).lean();
    if (!doc) {
      return null;
    }
    return {
      id: (doc as any)._id.toString(),
      ...doc,
      _id: undefined,
    };
  }

  async getPendingFriendRequests(userId: string): Promise<any[]> {
    const model = this.getModel('friendRequests');
    const docs = await model.find({ toUserId: userId, status: 'pending' }).lean();
    return docs.map((doc: any) => ({
      id: doc._id.toString(),
      ...doc,
      _id: undefined,
    }));
  }

  async getSentFriendRequests(userId: string): Promise<any[]> {
    const model = this.getModel('friendRequests');
    const docs = await model.find({ fromUserId: userId, status: 'pending' }).lean();
    return docs.map((doc: any) => ({
      id: doc._id.toString(),
      ...doc,
      _id: undefined,
    }));
  }

  async createFriendRequest(data: Record<string, any>): Promise<any> {
    const model = this.getModel('friendRequests');
    const doc = await model.create({
      ...data,
      status: 'pending',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });
    const obj = doc.toObject();
    return {
      id: obj._id.toString(),
      ...obj,
      _id: undefined,
    };
  }

  async updateFriendRequest(requestId: string, data: Record<string, any>): Promise<any> {
    const model = this.getModel('friendRequests');
    const doc = await model
      .findByIdAndUpdate(
        requestId,
        { ...data, updatedAt: new Date().toISOString() },
        { new: true },
      )
      .lean();
    if (!doc) {
      return null;
    }
    return {
      id: (doc as any)._id.toString(),
      ...doc,
      _id: undefined,
    };
  }

  async createFriend(data: Record<string, any>): Promise<any> {
    const model = this.getModel('friends');
    const doc = await model.create({
      ...data,
      createdAt: new Date().toISOString(),
    });
    const obj = doc.toObject();
    return {
      id: obj._id.toString(),
      ...obj,
      _id: undefined,
    };
  }

  // Challenge methods
  async getChallengeById(challengeId: string): Promise<any | null> {
    const model = this.getModel('challenges');
    const doc = await model.findById(challengeId).lean();
    if (!doc) {
      return null;
    }
    return {
      id: (doc as any)._id.toString(),
      ...doc,
      _id: undefined,
    };
  }

  async getUserChallenges(userId: string): Promise<any[]> {
    const model = this.getModel('challenges');
    const docs = await model.find({
      'participants.userId': userId,
    }).lean();
    return docs.map((doc: any) => ({
      id: doc._id.toString(),
      ...doc,
      _id: undefined,
    }));
  }

  async createChallenge(data: Record<string, any>): Promise<any> {
    const model = this.getModel('challenges');
    const doc = await model.create({
      ...data,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });
    const obj = doc.toObject();
    return {
      id: obj._id.toString(),
      ...obj,
      _id: undefined,
    };
  }

  async updateChallenge(challengeId: string, data: Record<string, any>): Promise<any> {
    const model = this.getModel('challenges');
    const doc = await model
      .findByIdAndUpdate(
        challengeId,
        { ...data, updatedAt: new Date().toISOString() },
        { new: true },
      )
      .lean();
    if (!doc) {
      return null;
    }
    return {
      id: (doc as any)._id.toString(),
      ...doc,
      _id: undefined,
    };
  }

  async deleteChallenge(challengeId: string): Promise<boolean> {
    const model = this.getModel('challenges');
    await model.findByIdAndDelete(challengeId);
    return true;
  }

  // Challenge invitations
  async getChallengeInvitation(invitationId: string): Promise<any | null> {
    const model = this.getModel('challengeInvitations');
    const doc = await model.findById(invitationId).lean();
    if (!doc) {
      return null;
    }
    return {
      id: (doc as any)._id.toString(),
      ...doc,
      _id: undefined,
    };
  }

  async getUserChallengeInvitations(userId: string): Promise<any[]> {
    const model = this.getModel('challengeInvitations');
    const docs = await model.find({ toUserId: userId, status: 'pending' }).lean();
    return docs.map((doc: any) => ({
      id: doc._id.toString(),
      ...doc,
      _id: undefined,
    }));
  }

  async createChallengeInvitation(data: Record<string, any>): Promise<any> {
    const model = this.getModel('challengeInvitations');
    const doc = await model.create({
      ...data,
      status: 'pending',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });
    const obj = doc.toObject();
    return {
      id: obj._id.toString(),
      ...obj,
      _id: undefined,
    };
  }

  async updateChallengeInvitation(invitationId: string, data: Record<string, any>): Promise<any> {
    const model = this.getModel('challengeInvitations');
    const doc = await model
      .findByIdAndUpdate(
        invitationId,
        { ...data, updatedAt: new Date().toISOString() },
        { new: true },
      )
      .lean();
    if (!doc) {
      return null;
    }
    return {
      id: (doc as any)._id.toString(),
      ...doc,
      _id: undefined,
    };
  }

  async findExistingChallengeInvitation(challengeId: string, toUserId: string): Promise<any | null> {
    const model = this.getModel('challengeInvitations');
    const doc = await model.findOne({ challengeId, toUserId, status: 'pending' }).lean();
    if (!doc) {
      return null;
    }
    return {
      id: (doc as any)._id.toString(),
      ...doc,
      _id: undefined,
    };
  }

  // Posts methods
  async getAllPosts(limit: number = 50): Promise<any[]> {
    const model = this.getModel('posts');
    const docs = await model.find().sort({ createdAt: -1 }).limit(limit).lean();
    return docs.map((doc: any) => ({
      id: doc._id.toString(),
      ...doc,
      _id: undefined,
    }));
  }

  async getFriendsPosts(friendIds: string[], limit: number = 50): Promise<any[]> {
    const model = this.getModel('posts');
    const docs = await model
      .find({ userId: { $in: friendIds } })
      .sort({ createdAt: -1 })
      .limit(limit)
      .lean();
    return docs.map((doc: any) => ({
      id: doc._id.toString(),
      ...doc,
      _id: undefined,
    }));
  }

  async getPostById(postId: string): Promise<any | null> {
    const model = this.getModel('posts');
    const doc = await model.findById(postId).lean();
    if (!doc) {
      return null;
    }
    return {
      id: (doc as any)._id.toString(),
      ...doc,
      _id: undefined,
    };
  }

  async createPost(data: Record<string, any>): Promise<any> {
    const model = this.getModel('posts');
    const doc = await model.create({
      ...data,
      reactions: [],
      comments: [],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });
    const obj = doc.toObject();
    return {
      id: obj._id.toString(),
      ...obj,
      _id: undefined,
    };
  }

  async updatePost(postId: string, data: Record<string, any>): Promise<any> {
    const model = this.getModel('posts');
    const doc = await model
      .findByIdAndUpdate(
        postId,
        { ...data, updatedAt: new Date().toISOString() },
        { new: true },
      )
      .lean();
    if (!doc) {
      return null;
    }
    return {
      id: (doc as any)._id.toString(),
      ...doc,
      _id: undefined,
    };
  }

  async deletePost(postId: string): Promise<boolean> {
    const model = this.getModel('posts');
    await model.findByIdAndDelete(postId);
    return true;
  }

  // Streaks methods
  async getUserStreaks(userId: string): Promise<any | null> {
    const model = this.getModel('streaks');
    const doc = await model.findOne({ userId }).lean();
    if (!doc) {
      return null;
    }
    return {
      id: (doc as any)._id.toString(),
      ...doc,
      _id: undefined,
    };
  }

  async upsertUserStreaks(userId: string, data: Record<string, any>): Promise<any> {
    const model = this.getModel('streaks');
    const doc = await model
      .findOneAndUpdate(
        { userId },
        { ...data, userId, updatedAt: new Date().toISOString() },
        { new: true, upsert: true },
      )
      .lean();
    return {
      id: (doc as any)._id.toString(),
      ...doc,
      _id: undefined,
    };
  }
}
