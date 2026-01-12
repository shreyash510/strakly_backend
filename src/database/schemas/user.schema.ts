import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type UserDocument = User & Document;

@Schema({ timestamps: true, collection: 'users' })
export class User {
  @Prop({ required: true, unique: true })
  email: string;

  @Prop({ required: true })
  password: string;

  @Prop()
  firstName: string;

  @Prop()
  lastName: string;

  @Prop()
  phone: string;

  @Prop()
  profileImage: string;

  @Prop({ type: Types.ObjectId, ref: 'Role' })
  roleId: Types.ObjectId;

  @Prop({ enum: ['SUPER_ADMIN', 'ADMIN', 'TRAINER', 'USER'], default: 'USER' })
  role: string;

  @Prop({ default: false })
  isSystemUser: boolean;

  @Prop({ enum: ['active', 'inactive', 'pending', 'suspended'], default: 'pending' })
  status: string;

  @Prop({ default: false })
  isActive: boolean;

  @Prop()
  lastLoginAt: Date;

  // Legacy fields for backward compatibility
  @Prop()
  name: string;

  @Prop()
  passwordHash: string;

  @Prop()
  bio: string;

  @Prop({ default: 0 })
  streak: number;

  // Audit fields
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

export const UserSchema = SchemaFactory.createForClass(User);

// Index for email
UserSchema.index({ email: 1 }, { unique: true });
UserSchema.index({ roleId: 1 });
UserSchema.index({ isArchived: 1 });
