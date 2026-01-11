import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

export type PunishmentDocument = Punishment & Document;

@Schema({ timestamps: true, collection: 'punishments' })
export class Punishment {
  @Prop({ required: true })
  userId: string;

  @Prop({ required: true })
  title: string;

  @Prop()
  description: string;

  @Prop({ required: true, enum: ['restriction', 'task', 'financial', 'social', 'other'] })
  category: string;

  @Prop({ required: true, enum: ['mild', 'moderate', 'severe'] })
  severity: string;

  @Prop({ required: true })
  triggerCondition: string;

  @Prop({ default: true })
  isActive: boolean;

  @Prop({ enum: ['pending', 'completed', 'skipped'], default: 'pending' })
  status: string;

  @Prop()
  triggeredAt: string;

  @Prop()
  completedAt: string;

  @Prop()
  createdAt: string;

  @Prop()
  updatedAt: string;
}

export const PunishmentSchema = SchemaFactory.createForClass(Punishment);
