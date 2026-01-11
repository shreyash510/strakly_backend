import { Injectable } from '@nestjs/common';
import { InjectConnection } from '@nestjs/mongoose';
import { Connection } from 'mongoose';
import { BaseMongoService } from './base.mongo.service';

@Injectable()
export class UserMongoService extends BaseMongoService {
  constructor(@InjectConnection() connection: Connection) {
    super(connection);
  }

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

  async searchUsers(
    query: string,
    excludeUserId?: string,
    page: number = 1,
    limit: number = 20,
  ): Promise<{ users: any[]; hasMore: boolean; page: number; total?: number }> {
    const model = this.getModel('users');
    const filter: any = {};

    // Only exclude user if ID is provided
    if (excludeUserId) {
      filter._id = { $ne: excludeUserId };
    }

    // Only add search filter if query is provided
    if (query && query.trim().length > 0) {
      filter.$or = [
        { name: { $regex: query, $options: 'i' } },
        { email: { $regex: query, $options: 'i' } },
      ];
    }

    const skip = (page - 1) * limit;
    const [docs, total] = await Promise.all([
      model.find(filter).skip(skip).limit(limit + 1).lean(), // +1 to check hasMore
      model.countDocuments(filter),
    ]);

    const hasMore = docs.length > limit;
    const users = docs.slice(0, limit).map((doc: any) => ({
      id: doc._id.toString(),
      name: doc.name,
      email: doc.email,
      bio: doc.bio || '',
      streak: doc.streak || 0,
    }));

    return { users, hasMore, page, total };
  }
}
