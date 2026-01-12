import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type ChallengeDocument = Challenge & Document;

@Schema({ _id: false })
export class ChallengeParticipant {
  @Prop({ type: Types.ObjectId, ref: 'User', required: true })
  userId: Types.ObjectId;

  @Prop({ required: true })
  userName: string;

  @Prop({ required: true })
  joinedAt: Date;

  @Prop({ default: 0 })
  progress: number;

  @Prop({ enum: ['pending', 'accepted', 'declined'], default: 'pending' })
  status: string;
}

export const ChallengeParticipantSchema = SchemaFactory.createForClass(ChallengeParticipant);

@Schema({ timestamps: true, collection: 'challenges' })
export class Challenge {
  @Prop({ required: true })
  title: string;

  @Prop()
  description: string;

  @Prop({ type: Types.ObjectId, ref: 'User', required: true })
  creatorId: Types.ObjectId;

  @Prop({ type: [Types.ObjectId], ref: 'User', default: [] })
  participantIds: Types.ObjectId[];

  @Prop({ type: [ChallengeParticipantSchema], default: [] })
  participants: ChallengeParticipant[];

  @Prop({ required: true, enum: ['habit', 'goal', 'custom'] })
  challengeType: string;

  @Prop({ required: true })
  targetValue: number;

  @Prop({ required: true })
  unit: string;

  @Prop({ required: true })
  startDate: Date;

  @Prop({ required: true })
  endDate: Date;

  @Prop()
  prize: string;

  @Prop({ enum: ['upcoming', 'active', 'completed', 'cancelled'], default: 'upcoming' })
  status: string;

  @Prop({ type: Types.ObjectId, ref: 'User' })
  winnerId: Types.ObjectId;

  // Audit fields
  @Prop({ type: Types.ObjectId, ref: 'User' })
  createdBy: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'User' })
  updatedBy: Types.ObjectId;

  @Prop({ default: false })
  isArchived: boolean;

  @Prop()
  archivedAt: Date;

  @Prop({ type: Types.ObjectId, ref: 'User' })
  archivedBy: Types.ObjectId;
}

export const ChallengeSchema = SchemaFactory.createForClass(Challenge);

// Indexes
ChallengeSchema.index({ creatorId: 1 });
ChallengeSchema.index({ participantIds: 1 });
ChallengeSchema.index({ status: 1 });
ChallengeSchema.index({ isArchived: 1 });
