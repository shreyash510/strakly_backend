import { Injectable } from '@nestjs/common';
import { InjectConnection } from '@nestjs/mongoose';
import { Connection } from 'mongoose';
import { BaseMongoService } from './base.mongo.service';

@Injectable()
export class ChallengeMongoService extends BaseMongoService {
  constructor(@InjectConnection() connection: Connection) {
    super(connection);
  }

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
      'participants.odataUserId': userId,
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
}
