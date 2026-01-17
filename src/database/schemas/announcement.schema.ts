import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type AnnouncementDocument = Announcement & Document;

export type AnnouncementType = 'general' | 'update' | 'event' | 'maintenance' | 'promotion';
export type AnnouncementPriority = 'low' | 'medium' | 'high' | 'urgent';
export type AnnouncementStatus = 'draft' | 'published' | 'archived';

@Schema({ timestamps: true, collection: 'announcements' })
export class Announcement {
  @Prop({ required: true })
  title: string;

  @Prop({ required: true })
  content: string;

  @Prop({ type: String, enum: ['general', 'update', 'event', 'maintenance', 'promotion'], default: 'general' })
  type: AnnouncementType;

  @Prop({ type: String, enum: ['low', 'medium', 'high', 'urgent'], default: 'medium' })
  priority: AnnouncementPriority;

  @Prop({ type: String, enum: ['draft', 'published', 'archived'], default: 'draft' })
  status: AnnouncementStatus;

  @Prop({ type: [String], default: ['user'] })
  targetAudience: string[];

  @Prop()
  publishedAt?: Date;

  @Prop()
  expiresAt?: Date;

  @Prop({ type: Types.ObjectId, ref: 'User', required: true })
  authorId: Types.ObjectId;

  @Prop({ required: true })
  authorName: string;

  @Prop({ type: Types.ObjectId, ref: 'Gym' })
  gymId?: Types.ObjectId;

  @Prop({ default: true })
  isActive: boolean;

  @Prop()
  createdAt: Date;

  @Prop()
  updatedAt: Date;
}

export const AnnouncementSchema = SchemaFactory.createForClass(Announcement);

// Create indexes
AnnouncementSchema.index({ status: 1 });
AnnouncementSchema.index({ type: 1 });
AnnouncementSchema.index({ priority: 1 });
AnnouncementSchema.index({ publishedAt: -1 });
