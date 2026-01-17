import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type ReportDocument = Report & Document;

export type ReportType = 'revenue' | 'membership' | 'attendance' | 'trainer_performance' | 'equipment' | 'custom';
export type ReportStatus = 'draft' | 'generated' | 'published' | 'archived';
export type ReportPeriod = 'daily' | 'weekly' | 'monthly' | 'quarterly' | 'yearly' | 'custom';

@Schema()
export class ReportMetrics {
  @Prop()
  totalRevenue?: number;

  @Prop()
  totalMembers?: number;

  @Prop()
  newMembers?: number;

  @Prop()
  activeMembers?: number;

  @Prop()
  avgAttendance?: number;

  @Prop()
  topTrainer?: string;
}

export const ReportMetricsSchema = SchemaFactory.createForClass(ReportMetrics);

@Schema({ timestamps: true, collection: 'reports' })
export class Report {
  @Prop({ required: true })
  title: string;

  @Prop()
  description?: string;

  @Prop({ type: String, enum: ['revenue', 'membership', 'attendance', 'trainer_performance', 'equipment', 'custom'], required: true })
  type: ReportType;

  @Prop({ type: String, enum: ['draft', 'generated', 'published', 'archived'], default: 'draft' })
  status: ReportStatus;

  @Prop({ type: String, enum: ['daily', 'weekly', 'monthly', 'quarterly', 'yearly', 'custom'], required: true })
  period: ReportPeriod;

  @Prop({ required: true })
  startDate: Date;

  @Prop({ required: true })
  endDate: Date;

  @Prop({ type: Types.ObjectId, ref: 'Gym' })
  gymId?: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'User', required: true })
  generatedBy: Types.ObjectId;

  @Prop()
  generatedAt?: Date;

  @Prop()
  publishedAt?: Date;

  @Prop()
  fileUrl?: string;

  @Prop({ type: ReportMetricsSchema })
  metrics?: ReportMetrics;

  @Prop()
  createdAt: Date;

  @Prop()
  updatedAt: Date;
}

export const ReportSchema = SchemaFactory.createForClass(Report);

// Create indexes
ReportSchema.index({ type: 1 });
ReportSchema.index({ status: 1 });
ReportSchema.index({ period: 1 });
ReportSchema.index({ gymId: 1 });
ReportSchema.index({ createdAt: -1 });
