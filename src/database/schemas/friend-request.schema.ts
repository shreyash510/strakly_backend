import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

export type FriendRequestDocument = FriendRequest & Document;

@Schema({ timestamps: true, collection: 'friendRequests' })
export class FriendRequest {
  @Prop({ required: true })
  fromUserId: string;

  @Prop({ required: true })
  fromUserName: string;

  @Prop({ required: true })
  fromUserEmail: string;

  @Prop({ required: true })
  toUserId: string;

  @Prop({ required: true })
  toUserName: string;

  @Prop({ required: true })
  toUserEmail: string;

  @Prop({ enum: ['pending', 'accepted', 'declined'], default: 'pending' })
  status: string;

  @Prop()
  createdAt: string;

  @Prop()
  updatedAt: string;
}

export const FriendRequestSchema = SchemaFactory.createForClass(FriendRequest);
