import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type UserProgressDocument = UserProgress & Document;

@Schema()
export class Measurements {
  @Prop()
  chest: number;

  @Prop()
  waist: number;

  @Prop()
  hips: number;

  @Prop()
  arms: number;

  @Prop()
  thighs: number;
}

@Schema({ timestamps: true, collection: 'user_progress' })
export class UserProgress {
  @Prop({ type: Types.ObjectId, ref: 'User', required: true })
  userId: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'Gym', required: true })
  gymId: Types.ObjectId;

  @Prop()
  weight: number; // kg

  @Prop()
  height: number; // cm

  @Prop()
  bodyFat: number; // percentage

  @Prop()
  muscleMass: number; // kg

  @Prop({ type: Measurements })
  measurements: Measurements;

  @Prop()
  notes: string;

  @Prop({ default: Date.now })
  recordedAt: Date;

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

export const UserProgressSchema = SchemaFactory.createForClass(UserProgress);
