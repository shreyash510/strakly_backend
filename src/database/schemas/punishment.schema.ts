import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type PunishmentDocument = Punishment & Document;

@Schema({ timestamps: true, collection: 'punishments' })
export class Punishment {
  @Prop({ type: Types.ObjectId, ref: 'User', required: true })
  userId: Types.ObjectId;

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
  triggeredAt: Date;

  @Prop()
  completedAt: Date;

  // Audit fields
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

export const PunishmentSchema = SchemaFactory.createForClass(Punishment);

// Indexes
PunishmentSchema.index({ userId: 1 });
PunishmentSchema.index({ userId: 1, isActive: 1 });
PunishmentSchema.index({ isArchived: 1 });
