import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

export type RewardDocument = Reward & Document;

@Schema({ timestamps: true, collection: 'rewards' })
export class Reward {
  @Prop({ required: true })
  userId: string;

  @Prop({ required: true })
  reward: string;

  @Prop()
  description: string;

  @Prop({ required: true, enum: ['entertainment', 'food', 'shopping', 'experience', 'self_care', 'other'] })
  category: string;

  @Prop({ required: true })
  pointsRequired: number;

  @Prop({ default: 0 })
  currentPoints: number;

  @Prop({ enum: ['in_progress', 'available', 'claimed'], default: 'in_progress' })
  status: string;

  @Prop()
  claimedAt: string;

  @Prop()
  createdAt: string;

  @Prop()
  updatedAt: string;
}

export const RewardSchema = SchemaFactory.createForClass(Reward);
