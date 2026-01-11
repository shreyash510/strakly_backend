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

  async searchUsers(query: string, excludeUserId?: string): Promise<any[]> {
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

    const docs = await model.find(filter).limit(50).lean();
    return docs.map((doc: any) => ({
      id: doc._id.toString(),
      name: doc.name,
      email: doc.email,
      bio: doc.bio || '',
      streak: doc.streak || 0,
    }));
  }
}
