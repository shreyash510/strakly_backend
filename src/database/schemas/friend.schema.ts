import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type FriendDocument = Friend & Document;

@Schema({ timestamps: true, collection: 'friends' })
export class Friend {
  @Prop({ type: Types.ObjectId, ref: 'User', required: true, unique: true })
  userId: Types.ObjectId;

  @Prop({ type: [Types.ObjectId], ref: 'User', default: [] })
  friends: Types.ObjectId[];
}

export const FriendSchema = SchemaFactory.createForClass(Friend);

// Indexes
FriendSchema.index({ userId: 1 }, { unique: true });
FriendSchema.index({ friends: 1 });
