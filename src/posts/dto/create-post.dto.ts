import {
  IsString,
  IsNotEmpty,
  IsOptional,
  IsEnum,
  MaxLength,
} from 'class-validator';

export enum PostCategory {
  GOAL = 'goal',
  HABIT = 'habit',
  CHALLENGE = 'challenge',
  GENERAL = 'general',
}

export class CreatePostDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(1000)
  content: string;

  @IsEnum(PostCategory)
  @IsOptional()
  category?: PostCategory;
}

export class UpdatePostDto {
  @IsString()
  @IsOptional()
  @MaxLength(1000)
  content?: string;

  @IsEnum(PostCategory)
  @IsOptional()
  category?: PostCategory;
}

export enum ReactionType {
  LIKE = 'like',
  CELEBRATE = 'celebrate',
  SUPPORT = 'support',
}

export class AddReactionDto {
  @IsString()
  @IsNotEmpty()
  postId: string;

  @IsEnum(ReactionType)
  @IsNotEmpty()
  type: ReactionType;
}

export class AddCommentDto {
  @IsString()
  @IsNotEmpty()
  postId: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(500)
  content: string;
}
