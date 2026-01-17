import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type TrainerDocument = Trainer & Document;

export type TrainerStatus = 'active' | 'inactive' | 'suspended';

@Schema({ timestamps: true, collection: 'trainers' })
export class Trainer {
  @Prop({ type: Types.ObjectId, ref: 'User', required: true })
  userId: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'Gym' })
  gymId: Types.ObjectId;

  @Prop({ type: [String], default: [] })
  specializations: string[];

  @Prop({ default: 0 })
  experience: number;

  @Prop({ type: [String], default: [] })
  certifications: string[];

  @Prop({ default: 0 })
  rating: number;

  @Prop({ default: 0 })
  totalClients: number;

  @Prop({ type: String, enum: ['active', 'inactive', 'suspended'], default: 'active' })
  status: TrainerStatus;

  @Prop()
  bio: string;

  @Prop()
  createdAt: Date;

  @Prop()
  updatedAt: Date;
}

export const TrainerSchema = SchemaFactory.createForClass(Trainer);
