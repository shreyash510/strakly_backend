import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type HabitDocument = Habit & Document;

@Schema({ timestamps: true, collection: 'habits' })
export class Habit {
  @Prop({ type: Types.ObjectId, ref: 'User', required: true })
  userId: Types.ObjectId;

  @Prop({ required: true })
  title: string;

  @Prop()
  description: string;

  @Prop({ required: true, enum: ['daily', 'weekly', 'monthly'], default: 'daily' })
  frequency: string;

  @Prop({ default: true })
  isGoodHabit: boolean;

  @Prop({ default: true })
  isActive: boolean;

  @Prop({ default: 0 })
  streak: number;

  @Prop({ default: 0 })
  longestStreak: number;

  @Prop({ type: [String], default: [] })
  completedDates: string[];

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

export const HabitSchema = SchemaFactory.createForClass(Habit);

// Indexes
HabitSchema.index({ userId: 1 });
HabitSchema.index({ userId: 1, isActive: 1 });
HabitSchema.index({ isArchived: 1 });
