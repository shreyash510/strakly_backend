import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type UserGymDocument = UserGym & Document;

@Schema({ timestamps: true, collection: 'user_gyms' })
export class UserGym {
  @Prop({ type: Types.ObjectId, ref: 'User', required: true })
  userId: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'Gym', required: true })
  gymId: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'User' })
  createdBy: Types.ObjectId;
}

export const UserGymSchema = SchemaFactory.createForClass(UserGym);

// Compound unique index
UserGymSchema.index({ userId: 1, gymId: 1 }, { unique: true });
