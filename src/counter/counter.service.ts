import { Injectable } from '@nestjs/common';
import { InjectConnection } from '@nestjs/mongoose';
import { Connection } from 'mongoose';

export interface CollectionCounts {
  users: number;
  goals: number;
  habits: number;
  tasks: number;
  punishments: number;
  challenges: number;
  friendRequests: number;
  friends: number;
}

export interface CounterDocument {
  _id: string;
  collection: string;
  count: number;
  updatedAt: string;
}

@Injectable()
export class CounterService {
  private readonly COUNTER_COLLECTION = 'counters';

  constructor(@InjectConnection() private connection: Connection) {}

  private getModel(collectionName: string) {
    return this.connection.collection(collectionName);
  }

  // Get count for a specific collection
  async getCount(collectionName: string): Promise<number> {
    const model = this.getModel(this.COUNTER_COLLECTION);
    const doc = await model.findOne({ collection: collectionName });
    return doc?.count || 0;
  }

  // Get all counts
  async getAllCounts(): Promise<CollectionCounts> {
    const model = this.getModel(this.COUNTER_COLLECTION);
    const docs = await model.find({}).toArray();

    const counts: CollectionCounts = {
      users: 0,
      goals: 0,
      habits: 0,
      tasks: 0,
      punishments: 0,
      challenges: 0,
      friendRequests: 0,
      friends: 0,
    };

    for (const doc of docs) {
      const collectionName = doc.collection as keyof CollectionCounts;
      if (collectionName in counts) {
        counts[collectionName] = doc.count;
      }
    }

    return counts;
  }

  // Increment count for a collection
  async incrementCount(collectionName: string, amount: number = 1): Promise<number> {
    const model = this.getModel(this.COUNTER_COLLECTION);
    const result = await model.findOneAndUpdate(
      { collection: collectionName },
      {
        $inc: { count: amount },
        $set: { updatedAt: new Date().toISOString() },
      },
      { upsert: true, returnDocument: 'after' },
    );
    return result?.count || amount;
  }

  // Decrement count for a collection
  async decrementCount(collectionName: string, amount: number = 1): Promise<number> {
    const model = this.getModel(this.COUNTER_COLLECTION);
    const result = await model.findOneAndUpdate(
      { collection: collectionName },
      {
        $inc: { count: -amount },
        $set: { updatedAt: new Date().toISOString() },
      },
      { upsert: true, returnDocument: 'after' },
    );
    // Ensure count doesn't go below 0
    const newCount = Math.max(0, result?.count || 0);
    if (result?.count < 0) {
      await model.updateOne(
        { collection: collectionName },
        { $set: { count: 0 } },
      );
    }
    return newCount;
  }

  // Set count for a collection (used for syncing)
  async setCount(collectionName: string, count: number): Promise<void> {
    const model = this.getModel(this.COUNTER_COLLECTION);
    await model.updateOne(
      { collection: collectionName },
      {
        $set: {
          count: Math.max(0, count),
          updatedAt: new Date().toISOString(),
        },
      },
      { upsert: true },
    );
  }

  // Sync all counters with actual collection counts
  async syncAllCounters(): Promise<CollectionCounts> {
    const collections = [
      'users',
      'goals',
      'habits',
      'tasks',
      'punishments',
      'challenges',
      'friend-requests',
      'friends',
    ];

    const counts: CollectionCounts = {
      users: 0,
      goals: 0,
      habits: 0,
      tasks: 0,
      punishments: 0,
      challenges: 0,
      friendRequests: 0,
      friends: 0,
    };

    for (const collectionName of collections) {
      try {
        const collection = this.getModel(collectionName);
        const count = await collection.countDocuments();

        // Map collection name to counts key
        const key = collectionName === 'friend-requests'
          ? 'friendRequests'
          : collectionName as keyof CollectionCounts;

        if (key in counts) {
          counts[key] = count;
          await this.setCount(collectionName, count);
        }
      } catch (error) {
        console.error(`Error counting ${collectionName}:`, error);
      }
    }

    return counts;
  }

  // Get count for a specific user's collection (e.g., user's goals count)
  async getUserCollectionCount(userId: string, collectionName: string): Promise<number> {
    try {
      const collection = this.getModel(collectionName);
      const count = await collection.countDocuments({ userId });
      return count;
    } catch (error) {
      console.error(`Error counting ${collectionName} for user ${userId}:`, error);
      return 0;
    }
  }

  // Get all counts for a specific user
  async getUserCounts(userId: string): Promise<{
    goals: number;
    habits: number;
    tasks: number;
    punishments: number;
  }> {
    const collections = ['goals', 'habits', 'tasks', 'punishments'];
    const counts: any = {};

    for (const collectionName of collections) {
      counts[collectionName] = await this.getUserCollectionCount(userId, collectionName);
    }

    return counts;
  }
}
