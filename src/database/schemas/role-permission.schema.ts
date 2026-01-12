import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type RolePermissionDocument = RolePermission & Document;

@Schema({ timestamps: true, collection: 'role_permissions' })
export class RolePermission {
  @Prop({ type: Types.ObjectId, ref: 'Role', required: true })
  roleId: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'Permission', required: true })
  permissionId: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'User' })
  createdBy: Types.ObjectId;
}

export const RolePermissionSchema = SchemaFactory.createForClass(RolePermission);

// Compound unique index
RolePermissionSchema.index({ roleId: 1, permissionId: 1 }, { unique: true });
