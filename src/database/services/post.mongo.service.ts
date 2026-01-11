import { Injectable } from '@nestjs/common';
import { InjectConnection } from '@nestjs/mongoose';
import { Connection } from 'mongoose';
import { BaseMongoService } from './base.mongo.service';

@Injectable()
export class PostMongoService extends BaseMongoService {
  constructor(@InjectConnection() connection: Connection) {
    super(connection);
  }

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
}
