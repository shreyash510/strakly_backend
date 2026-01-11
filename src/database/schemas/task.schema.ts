import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

export type TaskDocument = Task & Document;

@Schema({ timestamps: true, collection: 'tasks' })
export class Task {
  @Prop({ required: true })
  userId: string;

  @Prop({ required: true })
  title: string;

  @Prop()
  description: string;

  @Prop()
  dueDate: string;

  @Prop({ required: true, enum: ['low', 'medium', 'high'], default: 'medium' })
  priority: string;

  @Prop({ enum: ['pending', 'in_progress', 'completed'], default: 'pending' })
  status: string;

  @Prop()
  category: string;

  @Prop()
  createdAt: string;

  @Prop()
  updatedAt: string;
}

export const TaskSchema = SchemaFactory.createForClass(Task);
