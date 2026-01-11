import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

export type HabitDocument = Habit & Document;

@Schema({ timestamps: true, collection: 'habits' })
export class Habit {
  @Prop({ required: true })
  userId: string;

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

  @Prop()
  createdAt: string;

  @Prop()
  updatedAt: string;
}

export const HabitSchema = SchemaFactory.createForClass(Habit);
