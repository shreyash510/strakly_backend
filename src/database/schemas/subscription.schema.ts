import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type SubscriptionDocument = Subscription & Document;

export type SubscriptionPlan = 'free' | 'basic' | 'premium' | 'enterprise';
export type SubscriptionStatus = 'active' | 'inactive' | 'cancelled' | 'expired' | 'pending';
export type BillingCycle = 'monthly' | 'quarterly' | 'yearly';

@Schema({ timestamps: true, collection: 'subscriptions' })
export class Subscription {
  @Prop({ type: Types.ObjectId, ref: 'User', required: true })
  userId: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'Gym' })
  gymId?: Types.ObjectId;

  @Prop({ type: String, enum: ['free', 'basic', 'premium', 'enterprise'], default: 'free' })
  plan: SubscriptionPlan;

  @Prop({ type: String, enum: ['active', 'inactive', 'cancelled', 'expired', 'pending'], default: 'active' })
  status: SubscriptionStatus;

  @Prop({ type: String, enum: ['monthly', 'quarterly', 'yearly'], default: 'monthly' })
  billingCycle: BillingCycle;

  @Prop({ required: true })
  startDate: Date;

  @Prop()
  endDate?: Date;

  @Prop({ default: 0 })
  amount: number;

  @Prop()
  currency: string;

  @Prop()
  paymentMethod?: string;

  @Prop()
  stripeCustomerId?: string;

  @Prop()
  stripeSubscriptionId?: string;

  @Prop({ default: false })
  autoRenew: boolean;

  @Prop()
  cancelledAt?: Date;

  @Prop()
  createdAt: Date;

  @Prop()
  updatedAt: Date;
}

export const SubscriptionSchema = SchemaFactory.createForClass(Subscription);

// Create indexes
SubscriptionSchema.index({ userId: 1 });
SubscriptionSchema.index({ gymId: 1 });
SubscriptionSchema.index({ status: 1 });
SubscriptionSchema.index({ plan: 1 });
SubscriptionSchema.index({ endDate: 1 });
