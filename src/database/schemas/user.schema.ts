import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';
import { USER_ROLES, USER_STATUSES, GENDERS } from '../../constants';
import type { UserRole, UserStatus, Gender } from '../../constants';

export type { UserRole, UserStatus, Gender };

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

  @Prop({ type: String, enum: USER_ROLES, default: 'user' })
  role: UserRole;

  @Prop({ type: String, enum: USER_STATUSES, default: 'active' })
  status: UserStatus;

  @Prop()
  dateOfBirth?: string;

  @Prop({ type: String, enum: GENDERS })
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
