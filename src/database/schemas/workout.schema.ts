import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type WorkoutDocument = Workout & Document;

@Schema({ timestamps: true })
export class WorkoutExercise {
  @Prop({ required: true })
  name: string;

  @Prop()
  sets?: number;

  @Prop()
  reps?: string;

  @Prop()
  duration?: number;

  @Prop()
  restTime?: number;

  @Prop()
  notes?: string;
}

export const WorkoutExerciseSchema = SchemaFactory.createForClass(WorkoutExercise);

@Schema({ timestamps: true, collection: 'workouts' })
export class Workout {
  @Prop({ required: true })
  title: string;

  @Prop()
  description?: string;

  @Prop({ required: true })
  category: string;

  @Prop({ type: String, enum: ['beginner', 'intermediate', 'advanced'], default: 'beginner' })
  difficulty: string;

  @Prop({ required: true })
  duration: number;

  @Prop({ type: String, enum: ['draft', 'active', 'archived'], default: 'draft' })
  status: string;

  @Prop({ type: [WorkoutExerciseSchema], default: [] })
  exercises: WorkoutExercise[];

  @Prop()
  sessionsPerWeek?: number;

  @Prop()
  estimatedSessionDuration?: number;

  @Prop({ type: Types.ObjectId, ref: 'User' })
  createdBy: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'Gym' })
  gymId?: Types.ObjectId;

  @Prop()
  createdAt: Date;

  @Prop()
  updatedAt: Date;
}

export const WorkoutSchema = SchemaFactory.createForClass(Workout);
