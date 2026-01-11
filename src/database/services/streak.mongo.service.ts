import { Injectable } from '@nestjs/common';
import { InjectConnection } from '@nestjs/mongoose';
import { Connection } from 'mongoose';
import { BaseMongoService } from './base.mongo.service';

@Injectable()
export class StreakMongoService extends BaseMongoService {
  constructor(@InjectConnection() connection: Connection) {
    super(connection);
  }

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
