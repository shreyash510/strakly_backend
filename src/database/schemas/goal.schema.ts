import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

export type GoalDocument = Goal & Document;

@Schema({ timestamps: true, collection: 'goals' })
export class Goal {
  @Prop({ required: true })
  userId: string;

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

  @Prop()
  createdAt: string;

  @Prop()
  updatedAt: string;
}

export const GoalSchema = SchemaFactory.createForClass(Goal);
