import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';
import { GYM_STATUSES } from '../../constants';
import type { GymStatus } from '../../constants';

export type { GymStatus };

export type GymDocument = Gym & Document;

@Schema({ timestamps: true, collection: 'gyms' })
export class Gym {
  @Prop({ required: true })
  name: string;

  @Prop({ required: true })
  address: string;

  @Prop({ required: true })
  city: string;

  @Prop({ required: true })
  state: string;

  @Prop({ required: true })
  zipCode: string;

  @Prop()
  country?: string;

  @Prop()
  phone?: string;

  @Prop({ required: true })
  email: string;

  @Prop()
  website?: string;

  @Prop()
  description?: string;

  @Prop()
  openingTime?: string;

  @Prop()
  closingTime?: string;

  @Prop()
  capacity?: number;

  @Prop()
  monthlyFee?: number;

  @Prop({ default: true })
  isActive: boolean;

  @Prop({ type: String, enum: GYM_STATUSES, default: 'active' })
  status: GymStatus;

  @Prop({ type: [String], default: [] })
  amenities: string[];

  @Prop({ default: 0 })
  totalMembers: number;

  @Prop({ default: 0 })
  totalTrainers: number;

  @Prop()
  createdAt: Date;

  @Prop()
  updatedAt: Date;
}

export const GymSchema = SchemaFactory.createForClass(Gym);
