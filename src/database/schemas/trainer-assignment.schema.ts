import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type TrainerAssignmentDocument = TrainerAssignment & Document;

@Schema({ timestamps: true, collection: 'trainer_assignments' })
export class TrainerAssignment {
  @Prop({ type: Types.ObjectId, ref: 'User', required: true })
  trainerId: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'User', required: true })
  userId: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'Gym', required: true })
  gymId: Types.ObjectId;

  @Prop({ default: true })
  isActive: boolean;

  @Prop({ default: Date.now })
  assignedAt: Date;

  @Prop({ type: Types.ObjectId, ref: 'User' })
  assignedBy: Types.ObjectId;

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

export const TrainerAssignmentSchema = SchemaFactory.createForClass(TrainerAssignment);

// Compound unique index
TrainerAssignmentSchema.index({ trainerId: 1, userId: 1, gymId: 1 }, { unique: true });
