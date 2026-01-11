import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

export type ChallengeInvitationDocument = ChallengeInvitation & Document;

@Schema({ timestamps: true, collection: 'challengeInvitations' })
export class ChallengeInvitation {
  @Prop({ required: true })
  challengeId: string;

  @Prop({ required: true })
  challengeTitle: string;

  @Prop()
  challengeDescription: string;

  @Prop()
  challengePrize: string;

  @Prop({ required: true })
  fromUserId: string;

  @Prop({ required: true })
  fromUserName: string;

  @Prop({ required: true })
  toUserId: string;

  @Prop({ required: true })
  toUserName: string;

  @Prop({ required: true })
  startDate: string;

  @Prop({ required: true })
  endDate: string;

  @Prop({ default: 0 })
  participantCount: number;

  @Prop({ enum: ['pending', 'accepted', 'declined'], default: 'pending' })
  status: string;

  @Prop()
  createdAt: string;

  @Prop()
  updatedAt: string;
}

export const ChallengeInvitationSchema = SchemaFactory.createForClass(ChallengeInvitation);
