import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

export type PostDocument = Post & Document;

@Schema({ _id: false })
export class PostReaction {
  @Prop({ required: true })
  userId: string;

  @Prop({ required: true })
  userName: string;

  @Prop({ required: true, enum: ['like', 'celebrate', 'support'] })
  type: string;
}

export const PostReactionSchema = SchemaFactory.createForClass(PostReaction);

@Schema({ _id: false })
export class PostComment {
  @Prop({ required: true })
  id: string;

  @Prop({ required: true })
  userId: string;

  @Prop({ required: true })
  userName: string;

  @Prop()
  userAvatar: string;

  @Prop({ required: true })
  content: string;

  @Prop({ required: true })
  createdAt: string;
}

export const PostCommentSchema = SchemaFactory.createForClass(PostComment);

@Schema({ timestamps: true, collection: 'posts' })
export class Post {
  @Prop({ required: true })
  userId: string;

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

  @Prop()
  createdAt: string;

  @Prop()
  updatedAt: string;
}

export const PostSchema = SchemaFactory.createForClass(Post);
