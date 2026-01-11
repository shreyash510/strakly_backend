import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

export type ChallengeDocument = Challenge & Document;

@Schema({ _id: false })
export class ChallengeParticipant {
  @Prop({ required: true })
  oderId: string;

  @Prop({ required: true })
  odername: string;

  @Prop({ required: true })
  oderedAt: string;

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

  @Prop({ required: true })
  creatorId: string;

  @Prop({ type: [String], default: [] })
  participantIds: string[];

  @Prop({ type: [ChallengeParticipantSchema], default: [] })
  participants: ChallengeParticipant[];

  @Prop({ required: true, enum: ['habit', 'goal', 'custom'] })
  challengeType: string;

  @Prop({ required: true })
  targetValue: number;

  @Prop({ required: true })
  unit: string;

  @Prop({ required: true })
  startDate: string;

  @Prop({ required: true })
  endDate: string;

  @Prop()
  prize: string;

  @Prop({ enum: ['upcoming', 'active', 'completed', 'cancelled'], default: 'upcoming' })
  status: string;

  @Prop()
  winnerId: string;

  @Prop()
  createdAt: string;

  @Prop()
  updatedAt: string;
}

export const ChallengeSchema = SchemaFactory.createForClass(Challenge);
