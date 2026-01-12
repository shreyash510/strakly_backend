import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type PostDocument = Post & Document;

@Schema({ _id: false })
export class PostReaction {
  @Prop({ type: Types.ObjectId, ref: 'User', required: true })
  userId: Types.ObjectId;

  @Prop({ required: true })
  userName: string;

  @Prop({ required: true, enum: ['like', 'celebrate', 'support'] })
  type: string;
}

export const PostReactionSchema = SchemaFactory.createForClass(PostReaction);

@Schema({ _id: false })
export class PostComment {
  @Prop({ type: Types.ObjectId, default: () => new Types.ObjectId() })
  id: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'User', required: true })
  userId: Types.ObjectId;

  @Prop({ required: true })
  userName: string;

  @Prop()
  userAvatar: string;

  @Prop({ required: true })
  content: string;

  @Prop({ default: () => new Date() })
  createdAt: Date;
}

export const PostCommentSchema = SchemaFactory.createForClass(PostComment);

@Schema({ timestamps: true, collection: 'posts' })
export class Post {
  @Prop({ type: Types.ObjectId, ref: 'User', required: true })
  userId: Types.ObjectId;

  @Prop({ required: true })
  userName: string;

  @Prop()
  userAvatar: string;

  @Prop({ required: true })
  content: string;

  @Prop({ enum: ['general', 'challenge'] })
  category: string;

  @Prop({ type: [PostReactionSchema], default: [] })
  reactions: PostReaction[];

  @Prop({ type: [PostCommentSchema], default: [] })
  comments: PostComment[];

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

export const PostSchema = SchemaFactory.createForClass(Post);

// Indexes
PostSchema.index({ userId: 1 });
PostSchema.index({ category: 1 });
PostSchema.index({ createdAt: -1 });
PostSchema.index({ isArchived: 1 });
