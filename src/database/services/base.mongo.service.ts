import { Injectable, OnModuleInit } from '@nestjs/common';
import { InjectConnection } from '@nestjs/mongoose';
import { Connection, Model } from 'mongoose';
import { UserSchema } from '../schemas';

@Injectable()
export class BaseMongoService implements OnModuleInit {
  protected models: Map<string, Model<any>> = new Map();

  constructor(@InjectConnection() protected connection: Connection) {}

  onModuleInit() {
    // Register user model
    this.models.set('users', this.connection.model('User', UserSchema));
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
}
