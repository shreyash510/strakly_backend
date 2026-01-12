import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type GymDocument = Gym & Document;

@Schema({ timestamps: true, collection: 'gyms' })
export class Gym {
  @Prop({ required: true })
  name: string;

  @Prop()
  code: string;

  @Prop()
  email: string;

  @Prop()
  phone: string;

  @Prop()
  address: string;

  @Prop()
  city: string;

  @Prop()
  state: string;

  @Prop()
  zipCode: string;

  @Prop()
  logo: string;

  @Prop({ type: Types.ObjectId, ref: 'User' })
  adminId: Types.ObjectId; // Gym owner

  @Prop({ default: false })
  isActive: boolean;

  @Prop()
  activatedAt: Date;

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

export const GymSchema = SchemaFactory.createForClass(Gym);
