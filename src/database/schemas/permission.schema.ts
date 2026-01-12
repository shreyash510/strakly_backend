import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type PermissionDocument = Permission & Document;

@Schema({ timestamps: true, collection: 'permissions' })
export class Permission {
  @Prop({ required: true, unique: true })
  name: string; // 'USER_CREATE', 'TRAINER_READ', etc.

  @Prop({ required: true, unique: true })
  label: string; // 'Create User', 'View Trainer', etc.

  @Prop()
  description: string;

  @Prop()
  module: string; // 'user', 'trainer', 'gym', 'diet', 'exercise', etc.

  @Prop({ required: true, enum: ['system', 'gym'] })
  level: string;

  @Prop({ default: 0 })
  sortOrder: number;

  @Prop({ default: false })
  isSystem: boolean;

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

export const PermissionSchema = SchemaFactory.createForClass(Permission);
