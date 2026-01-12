import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type DietPlanDocument = DietPlan & Document;

@Schema()
export class Meal {
  @Prop()
  name: string;

  @Prop()
  time: string;

  @Prop([String])
  items: string[];

  @Prop()
  calories: number;
}

@Schema({ timestamps: true, collection: 'diet_plans' })
export class DietPlan {
  @Prop({ type: Types.ObjectId, ref: 'User', required: true })
  userId: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'Gym', required: true })
  gymId: Types.ObjectId;

  @Prop({ required: true })
  title: string;

  @Prop()
  description: string;

  @Prop([Meal])
  meals: Meal[];

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

export const DietPlanSchema = SchemaFactory.createForClass(DietPlan);
