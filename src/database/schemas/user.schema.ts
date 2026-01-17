import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

export type UserRole = 'superadmin' | 'admin' | 'trainer' | 'user';
export type UserStatus = 'active' | 'inactive' | 'suspended';
export type Gender = 'male' | 'female' | 'other';

export type UserDocument = User & Document;

@Schema({ timestamps: true, collection: 'users' })
export class User {
  @Prop({ required: true })
  name: string;

  @Prop({ required: true, unique: true })
  email: string;

  @Prop({ required: true })
  passwordHash: string;

  @Prop()
  phone?: string;

  @Prop()
  avatar?: string;

  @Prop()
  bio?: string;

  @Prop({ type: String, enum: ['superadmin', 'admin', 'trainer', 'user'], default: 'user' })
  role: UserRole;

  @Prop({ type: String, enum: ['active', 'inactive', 'suspended'], default: 'active' })
  status: UserStatus;

  @Prop()
  dateOfBirth?: string;

  @Prop({ type: String, enum: ['male', 'female', 'other'] })
  gender?: Gender;

  @Prop()
  address?: string;

  @Prop()
  city?: string;

  @Prop()
  state?: string;

  @Prop()
  zipCode?: string;

  @Prop()
  gymId?: string;

  @Prop()
  trainerId?: string;

  @Prop({ default: 0 })
  streak: number;

  @Prop()
  joinDate?: string;

  @Prop()
  lastLoginAt?: string;

  @Prop()
  createdAt: Date;

  @Prop()
  updatedAt: Date;
}

export const UserSchema = SchemaFactory.createForClass(User);
