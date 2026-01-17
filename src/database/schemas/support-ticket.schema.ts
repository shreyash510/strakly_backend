import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type SupportTicketDocument = SupportTicket & Document;

export type TicketCategory = 'bug' | 'feature_request' | 'account' | 'billing' | 'other';
export type TicketPriority = 'low' | 'medium' | 'high' | 'urgent';
export type TicketStatus = 'open' | 'in_progress' | 'resolved' | 'closed';

@Schema({ timestamps: true, collection: 'support_tickets' })
export class SupportTicket {
  @Prop({ type: Types.ObjectId, ref: 'User', required: true })
  userId: Types.ObjectId;

  @Prop({ required: true })
  userName: string;

  @Prop({ type: String, enum: ['superadmin', 'admin', 'trainer', 'user'], default: 'user' })
  userRole: string;

  @Prop({ required: true })
  subject: string;

  @Prop({ required: true })
  description: string;

  @Prop({ type: String, enum: ['bug', 'feature_request', 'account', 'billing', 'other'], required: true })
  category: TicketCategory;

  @Prop({ type: String, enum: ['low', 'medium', 'high', 'urgent'], default: 'medium' })
  priority: TicketPriority;

  @Prop({ type: String, enum: ['open', 'in_progress', 'resolved', 'closed'], default: 'open' })
  status: TicketStatus;

  @Prop()
  response?: string;

  @Prop({ type: Types.ObjectId, ref: 'User' })
  assignedTo?: Types.ObjectId;

  @Prop()
  resolvedAt?: Date;

  @Prop()
  createdAt: Date;

  @Prop()
  updatedAt: Date;
}

export const SupportTicketSchema = SchemaFactory.createForClass(SupportTicket);

// Create indexes
SupportTicketSchema.index({ userId: 1 });
SupportTicketSchema.index({ status: 1 });
SupportTicketSchema.index({ category: 1 });
SupportTicketSchema.index({ priority: 1 });
SupportTicketSchema.index({ createdAt: -1 });
