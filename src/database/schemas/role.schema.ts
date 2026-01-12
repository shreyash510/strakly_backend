import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type RoleDocument = Role & Document;

@Schema({ timestamps: true, collection: 'roles' })
export class Role {
  @Prop({ required: true, unique: true })
  name: string; // 'SUPER_ADMIN', 'ADMIN', 'TRAINER', 'USER'

  @Prop({ required: true, unique: true })
  label: string; // 'Super Admin', 'Gym Admin', 'Trainer', 'User'

  @Prop()
  description: string;

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

export const RoleSchema = SchemaFactory.createForClass(Role);
