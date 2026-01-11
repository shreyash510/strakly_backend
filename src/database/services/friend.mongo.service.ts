import { Injectable } from '@nestjs/common';
import { InjectConnection } from '@nestjs/mongoose';
import { Connection } from 'mongoose';
import { BaseMongoService } from './base.mongo.service';

@Injectable()
export class FriendMongoService extends BaseMongoService {
  constructor(@InjectConnection() connection: Connection) {
    super(connection);
  }

  // New array-based friends structure
  async getFriendsDocument(userId: string): Promise<{ userId: string; friends: string[] } | null> {
    const model = this.getModel('friends');
    const doc = await model.findOne({ userId }).lean();
    if (!doc) {
      return null;
    }
    return {
      userId: (doc as any).userId,
      friends: (doc as any).friends || [],
    };
  }

  async addFriend(userId: string, friendId: string): Promise<void> {
    const model = this.getModel('friends');
    await model.findOneAndUpdate(
      { userId },
      { $addToSet: { friends: friendId } },
      { upsert: true, new: true },
    );
  }

  async removeFriend(userId: string, friendId: string): Promise<void> {
    const model = this.getModel('friends');
    await model.findOneAndUpdate(
      { userId },
      { $pull: { friends: friendId } },
    );
  }

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
}
