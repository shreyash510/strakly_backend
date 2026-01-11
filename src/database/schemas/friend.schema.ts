import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

export type FriendDocument = Friend & Document;

@Schema({ timestamps: true, collection: 'friends' })
export class Friend {
  @Prop({ required: true })
  oderId: string;

  @Prop({ required: true })
  friendUserId: string;

  @Prop({ required: true })
  friendName: string;

  @Prop({ required: true })
  friendEmail: string;

  @Prop()
  addedAt: string;
}

export const FriendSchema = SchemaFactory.createForClass(Friend);
