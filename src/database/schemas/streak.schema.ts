import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type StreakDocument = Streak & Document;

@Schema({ _id: false })
export class StreakItem {
  @Prop({ type: Types.ObjectId, required: true })
  itemId: Types.ObjectId;

  @Prop({ required: true })
  itemName: string;

  @Prop({ required: true, enum: ['habit', 'goal'] })
  itemType: string;

  @Prop({ default: 0 })
  streak: number;

  @Prop({ default: 0 })
  longestStreak: number;

  @Prop()
  lastCompletedDate: Date;
}

export const StreakItemSchema = SchemaFactory.createForClass(StreakItem);

@Schema({ timestamps: true, collection: 'streaks' })
export class Streak {
  @Prop({ type: Types.ObjectId, ref: 'User', required: true, unique: true })
  userId: Types.ObjectId;

  @Prop({ type: Map, of: StreakItemSchema, default: {} })
  items: Map<string, StreakItem>;
}

export const StreakSchema = SchemaFactory.createForClass(Streak);

// Indexes
StreakSchema.index({ userId: 1 }, { unique: true });
