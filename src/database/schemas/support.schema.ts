import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type SupportDocument = Support & Document;

export type SupportCategory = 'technical' | 'billing' | 'general' | 'feedback' | 'bug';
export type SupportPriority = 'low' | 'medium' | 'high' | 'urgent';
export type SupportStatus = 'open' | 'in_progress' | 'resolved' | 'closed';

@Schema()
export class SupportResponse {
  @Prop({ type: Types.ObjectId, ref: 'User', required: true })
  responderId: Types.ObjectId;

  @Prop({ required: true })
  responderName: string;

  @Prop({ required: true })
  responderRole: string;

  @Prop({ required: true })
  message: string;

  @Prop({ default: () => new Date() })
  createdAt: Date;
}

export const SupportResponseSchema = SchemaFactory.createForClass(SupportResponse);

@Schema({ timestamps: true, collection: 'support_tickets' })
export class Support {
  @Prop({ type: Types.ObjectId, ref: 'User', required: true })
  userId: Types.ObjectId;

  @Prop({ required: true })
  userName: string;

  @Prop({ required: true })
  userRole: string;

  @Prop()
  userEmail: string;

  @Prop({ required: true })
  subject: string;

  @Prop({ required: true })
  description: string;

  @Prop({ type: String, enum: ['technical', 'billing', 'general', 'feedback', 'bug'], default: 'general' })
  category: SupportCategory;

  @Prop({ type: String, enum: ['low', 'medium', 'high', 'urgent'], default: 'medium' })
  priority: SupportPriority;

  @Prop({ type: String, enum: ['open', 'in_progress', 'resolved', 'closed'], default: 'open' })
  status: SupportStatus;

  @Prop({ type: [SupportResponseSchema], default: [] })
  responses: SupportResponse[];

  @Prop({ type: Types.ObjectId, ref: 'User' })
  assignedTo: Types.ObjectId;

  @Prop()
  createdAt: Date;

  @Prop()
  updatedAt: Date;
}

export const SupportSchema = SchemaFactory.createForClass(Support);
