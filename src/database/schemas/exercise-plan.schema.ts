import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type ExercisePlanDocument = ExercisePlan & Document;

@Schema()
export class Exercise {
  @Prop()
  name: string;

  @Prop()
  sets: number;

  @Prop()
  reps: number;

  @Prop()
  duration: number; // minutes

  @Prop()
  restTime: number; // seconds
}

@Schema({ timestamps: true, collection: 'exercise_plans' })
export class ExercisePlan {
  @Prop({ type: Types.ObjectId, ref: 'User', required: true })
  userId: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'Gym', required: true })
  gymId: Types.ObjectId;

  @Prop({ required: true })
  title: string;

  @Prop()
  description: string;

  @Prop([Exercise])
  exercises: Exercise[];

  @Prop()
  startDate: Date;

  @Prop()
  endDate: Date;

  @Prop({ default: true })
  isActive: boolean;

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

export const ExercisePlanSchema = SchemaFactory.createForClass(ExercisePlan);
