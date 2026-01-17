import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type PermissionDocument = Permission & Document;

// CRUD permissions for most resources
export interface CrudPermissions {
  create: boolean;
  read: boolean;
  update: boolean;
  delete: boolean;
}

// Read-only permissions for reports
export interface ReadOnlyPermissions {
  read: boolean;
}

// Manager permissions structure matching frontend
export interface ManagerPermissions {
  users: CrudPermissions;
  trainers: CrudPermissions;
  programs: CrudPermissions;
  announcements: CrudPermissions;
  challenges: CrudPermissions;
  rewards: CrudPermissions;
  reports: ReadOnlyPermissions;
}

// Default CRUD permissions (all false)
const defaultCrudPermissions: CrudPermissions = {
  create: false,
  read: false,
  update: false,
  delete: false,
};

// Default read-only permissions (all false)
const defaultReadOnlyPermissions: ReadOnlyPermissions = {
  read: false,
};

// Default manager permissions
export const DEFAULT_MANAGER_PERMISSIONS: ManagerPermissions = {
  users: { ...defaultCrudPermissions },
  trainers: { ...defaultCrudPermissions },
  programs: { ...defaultCrudPermissions },
  announcements: { ...defaultCrudPermissions },
  challenges: { ...defaultCrudPermissions },
  rewards: { ...defaultCrudPermissions },
  reports: { ...defaultReadOnlyPermissions },
};

// Schema for CRUD permissions
@Schema({ _id: false })
export class CrudPermissionsSchema {
  @Prop({ default: false })
  create: boolean;

  @Prop({ default: false })
  read: boolean;

  @Prop({ default: false })
  update: boolean;

  @Prop({ default: false })
  delete: boolean;
}

// Schema for read-only permissions
@Schema({ _id: false })
export class ReadOnlyPermissionsSchema {
  @Prop({ default: false })
  read: boolean;
}

// Schema for manager permissions
@Schema({ _id: false })
export class ManagerPermissionsSchema {
  @Prop({ type: CrudPermissionsSchema, default: () => ({ ...defaultCrudPermissions }) })
  users: CrudPermissionsSchema;

  @Prop({ type: CrudPermissionsSchema, default: () => ({ ...defaultCrudPermissions }) })
  trainers: CrudPermissionsSchema;

  @Prop({ type: CrudPermissionsSchema, default: () => ({ ...defaultCrudPermissions }) })
  programs: CrudPermissionsSchema;

  @Prop({ type: CrudPermissionsSchema, default: () => ({ ...defaultCrudPermissions }) })
  announcements: CrudPermissionsSchema;

  @Prop({ type: CrudPermissionsSchema, default: () => ({ ...defaultCrudPermissions }) })
  challenges: CrudPermissionsSchema;

  @Prop({ type: CrudPermissionsSchema, default: () => ({ ...defaultCrudPermissions }) })
  rewards: CrudPermissionsSchema;

  @Prop({ type: ReadOnlyPermissionsSchema, default: () => ({ ...defaultReadOnlyPermissions }) })
  reports: ReadOnlyPermissionsSchema;
}

@Schema({ timestamps: true, collection: 'permissions' })
export class Permission {
  @Prop({ type: Types.ObjectId, ref: 'User', required: true, unique: true })
  userId: Types.ObjectId;

  @Prop({ type: ManagerPermissionsSchema, default: () => ({ ...DEFAULT_MANAGER_PERMISSIONS }) })
  permissions: ManagerPermissionsSchema;

  @Prop()
  createdAt: Date;

  @Prop()
  updatedAt: Date;
}

export const PermissionSchema = SchemaFactory.createForClass(Permission);
