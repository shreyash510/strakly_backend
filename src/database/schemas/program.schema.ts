import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type ProgramDocument = Program & Document;

export type ProgramType = 'workout' | 'diet' | 'exercise';
export type DifficultyLevel = 'beginner' | 'intermediate' | 'advanced';

@Schema()
export class Exercise {
  @Prop({ required: true })
  name: string;

  @Prop()
  description: string;

  @Prop()
  sets: number;

  @Prop()
  reps: number;

  @Prop()
  duration: number;

  @Prop()
  restTime: number;

  @Prop()
  videoUrl: string;

  @Prop()
  imageUrl: string;
}

export const ExerciseSchema = SchemaFactory.createForClass(Exercise);

@Schema({ timestamps: true, collection: 'programs' })
export class Program {
  @Prop({ required: true })
  title: string;

  @Prop()
  description: string;

  @Prop({ type: String, enum: ['workout', 'diet', 'exercise'], required: true })
  type: ProgramType;

  @Prop()
  duration: number;

  @Prop({ type: String, enum: ['beginner', 'intermediate', 'advanced'], default: 'beginner' })
  difficulty: DifficultyLevel;

  @Prop({ type: Types.ObjectId, ref: 'User', required: true })
  createdBy: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'Gym' })
  gymId: Types.ObjectId;

  @Prop({ type: [ExerciseSchema], default: [] })
  exercises: Exercise[];

  @Prop({ default: false })
  isPublic: boolean;

  @Prop()
  imageUrl: string;

  @Prop()
  createdAt: Date;

  @Prop()
  updatedAt: Date;
}

export const ProgramSchema = SchemaFactory.createForClass(Program);
