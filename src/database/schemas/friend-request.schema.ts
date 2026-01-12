import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type FriendRequestDocument = FriendRequest & Document;

@Schema({ timestamps: true, collection: 'friendRequests' })
export class FriendRequest {
  @Prop({ type: Types.ObjectId, ref: 'User', required: true })
  fromUserId: Types.ObjectId;

  @Prop({ required: true })
  fromUserName: string;

  @Prop({ required: true })
  fromUserEmail: string;

  @Prop({ type: Types.ObjectId, ref: 'User', required: true })
  toUserId: Types.ObjectId;

  @Prop({ required: true })
  toUserName: string;

  @Prop({ required: true })
  toUserEmail: string;

  @Prop({ enum: ['pending', 'accepted', 'declined'], default: 'pending' })
  status: string;
}

export const FriendRequestSchema = SchemaFactory.createForClass(FriendRequest);

// Indexes
FriendRequestSchema.index({ fromUserId: 1 });
FriendRequestSchema.index({ toUserId: 1 });
FriendRequestSchema.index({ fromUserId: 1, toUserId: 1 });
FriendRequestSchema.index({ status: 1 });
