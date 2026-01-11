import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

export type FriendDocument = Friend & Document;

@Schema({ timestamps: true, collection: 'friends' })
export class Friend {
  @Prop({ required: true, unique: true })
  userId: string;

  @Prop({ type: [String], default: [] })
  friends: string[];
}

export const FriendSchema = SchemaFactory.createForClass(Friend);
