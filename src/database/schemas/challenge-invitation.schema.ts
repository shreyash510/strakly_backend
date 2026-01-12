import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type ChallengeInvitationDocument = ChallengeInvitation & Document;

@Schema({ timestamps: true, collection: 'challengeInvitations' })
export class ChallengeInvitation {
  @Prop({ type: Types.ObjectId, ref: 'Challenge', required: true })
  challengeId: Types.ObjectId;

  @Prop({ required: true })
  challengeTitle: string;

  @Prop()
  challengeDescription: string;

  @Prop()
  challengePrize: string;

  @Prop({ type: Types.ObjectId, ref: 'User', required: true })
  fromUserId: Types.ObjectId;

  @Prop({ required: true })
  fromUserName: string;

  @Prop({ type: Types.ObjectId, ref: 'User', required: true })
  toUserId: Types.ObjectId;

  @Prop({ required: true })
  toUserName: string;

  @Prop({ required: true })
  startDate: Date;

  @Prop({ required: true })
  endDate: Date;

  @Prop({ default: 0 })
  participantCount: number;

  @Prop({ enum: ['pending', 'accepted', 'declined'], default: 'pending' })
  status: string;
}

export const ChallengeInvitationSchema = SchemaFactory.createForClass(ChallengeInvitation);

// Indexes
ChallengeInvitationSchema.index({ challengeId: 1 });
ChallengeInvitationSchema.index({ fromUserId: 1 });
ChallengeInvitationSchema.index({ toUserId: 1 });
ChallengeInvitationSchema.index({ status: 1 });
