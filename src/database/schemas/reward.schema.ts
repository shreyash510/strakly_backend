import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type RewardDocument = Reward & Document;

@Schema({ timestamps: true, collection: 'rewards' })
export class Reward {
  @Prop({ type: Types.ObjectId, ref: 'User', required: true })
  userId: Types.ObjectId;

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
  claimedAt: Date;

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

export const RewardSchema = SchemaFactory.createForClass(Reward);

// Indexes
RewardSchema.index({ userId: 1 });
RewardSchema.index({ userId: 1, status: 1 });
RewardSchema.index({ isArchived: 1 });
