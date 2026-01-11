import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

export type StreakDocument = Streak & Document;

@Schema({ _id: false })
export class StreakItem {
  @Prop({ required: true })
  itemId: string;

  @Prop({ required: true })
  itemName: string;

  @Prop({ required: true, enum: ['habit', 'goal'] })
  itemType: string;

  @Prop({ default: 0 })
  streak: number;

  @Prop({ default: 0 })
  longestStreak: number;

  @Prop()
  lastCompletedDate: string;
}

export const StreakItemSchema = SchemaFactory.createForClass(StreakItem);

@Schema({ timestamps: true, collection: 'streaks' })
export class Streak {
  @Prop({ required: true })
  userId: string;

  @Prop({ type: Map, of: StreakItemSchema, default: {} })
  items: Map<string, StreakItem>;

  @Prop()
  updatedAt: string;
}

export const StreakSchema = SchemaFactory.createForClass(Streak);
