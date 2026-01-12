import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type GoalDocument = Goal & Document;

@Schema({ timestamps: true, collection: 'goals' })
export class Goal {
  @Prop({ type: Types.ObjectId, ref: 'User', required: true })
  userId: Types.ObjectId;

  @Prop({ required: true })
  title: string;

  @Prop()
  description: string;

  @Prop({ required: true, enum: ['health', 'career', 'finance', 'education', 'relationships', 'personal', 'other'] })
  category: string;

  @Prop({ required: true, enum: ['regular', 'savings'], default: 'regular' })
  goalType: string;

  @Prop({ required: true })
  targetDate: string;

  @Prop({ default: 0, min: 0, max: 100 })
  progress: number;

  @Prop({ enum: ['not_started', 'in_progress', 'completed', 'abandoned'], default: 'not_started' })
  status: string;

  @Prop({ default: 0 })
  streak: number;

  @Prop({ default: 0 })
  longestStreak: number;

  @Prop()
  targetAmount: number;

  @Prop()
  currentAmount: number;

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

export const GoalSchema = SchemaFactory.createForClass(Goal);

// Indexes
GoalSchema.index({ userId: 1 });
GoalSchema.index({ userId: 1, status: 1 });
GoalSchema.index({ userId: 1, category: 1 });
GoalSchema.index({ isArchived: 1 });
