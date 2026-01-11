import {
  Injectable,
  NotFoundException,
  ForbiddenException,
} from '@nestjs/common';
import { DatabaseService } from '../database/database.service';
import { FriendsService } from '../friends/friends.service';
import {
  CreatePostDto,
  UpdatePostDto,
  ReactionType,
  PostCategory,
} from './dto/create-post.dto';

export interface PostReaction {
  userId: string;
  userName: string;
  type: ReactionType;
}

export interface PostComment {
  id: string;
  userId: string;
  userName: string;
  content: string;
  createdAt: string;
}

export interface Post {
  id: string;
  userId: string;
  userName: string;
  content: string;
  category?: PostCategory;
  reactions: PostReaction[];
  comments: PostComment[];
  createdAt: string;
  updatedAt: string;
}

@Injectable()
export class PostsService {
  constructor(
    private readonly databaseService: DatabaseService,
    private readonly friendsService: FriendsService,
  ) {}

  // Get feed posts (own posts + friends' posts)
  async getFeed(userId: string): Promise<Post[]> {
    // Get user's friends
    const friends = await this.friendsService.getFriends(userId);
    const friendIds = friends.map((f) => f.friendUserId);

    // Include user's own posts
    const allowedUserIds = [userId, ...friendIds];

    return this.databaseService.getFriendsPosts(allowedUserIds, 50);
  }

  // Get posts by category
  async getPostsByCategory(
    userId: string,
    category: PostCategory,
  ): Promise<Post[]> {
    const allPosts = await this.getFeed(userId);
    return allPosts.filter((p) => p.category === category);
  }

  // Get user's own posts
  async getMyPosts(userId: string): Promise<Post[]> {
    return this.databaseService.getFriendsPosts([userId], 50);
  }

  // Get single post
  async getPost(userId: string, postId: string): Promise<Post> {
    const post = await this.databaseService.getPostById(postId);

    if (!post) {
      throw new NotFoundException('Post not found');
    }

    // Check if user can view this post (own post or friend's post)
    if (post.userId !== userId) {
      const friends = await this.friendsService.getFriends(userId);
      const friendIds = friends.map((f) => f.friendUserId);

      if (!friendIds.includes(post.userId)) {
        throw new ForbiddenException('Cannot view this post');
      }
    }

    return post;
  }

  // Create a new post
  async createPost(userId: string, dto: CreatePostDto): Promise<Post> {
    const user = await this.friendsService.getUserProfile(userId);
    if (!user) {
      throw new NotFoundException('User not found');
    }

    const postData = {
      userId,
      userName: user.name || 'Unknown',
      content: dto.content,
      category: dto.category || null,
    };

    return this.databaseService.createPost(postData);
  }

  // Update a post (only own posts)
  async updatePost(
    userId: string,
    postId: string,
    dto: UpdatePostDto,
  ): Promise<Post> {
    const post = await this.databaseService.getPostById(postId);

    if (!post) {
      throw new NotFoundException('Post not found');
    }

    if (post.userId !== userId) {
      throw new ForbiddenException('Cannot update this post');
    }

    const updateData: Partial<Post> = {};

    if (dto.content !== undefined) {
      updateData.content = dto.content;
    }

    if (dto.category !== undefined) {
      updateData.category = dto.category;
    }

    return this.databaseService.updatePost(postId, updateData);
  }

  // Delete a post (only own posts)
  async deletePost(userId: string, postId: string): Promise<{ success: boolean }> {
    const post = await this.databaseService.getPostById(postId);

    if (!post) {
      throw new NotFoundException('Post not found');
    }

    if (post.userId !== userId) {
      throw new ForbiddenException('Cannot delete this post');
    }

    await this.databaseService.deletePost(postId);

    return { success: true };
  }

  // Add/toggle reaction
  async toggleReaction(
    userId: string,
    postId: string,
    type: ReactionType,
  ): Promise<Post> {
    const post = await this.getPost(userId, postId);

    const user = await this.friendsService.getUserProfile(userId);
    if (!user) {
      throw new NotFoundException('User not found');
    }

    // Check if user already reacted with this type
    const existingReactionIndex = post.reactions.findIndex(
      (r) => r.userId === userId && r.type === type,
    );

    let updatedReactions: PostReaction[];

    if (existingReactionIndex !== -1) {
      // Remove the reaction (toggle off)
      updatedReactions = post.reactions.filter(
        (_, index) => index !== existingReactionIndex,
      );
    } else {
      // Remove any other reaction from this user and add new one
      updatedReactions = [
        ...post.reactions.filter((r) => r.userId !== userId),
        {
          userId,
          userName: user.name || 'Unknown',
          type,
        },
      ];
    }

    return this.databaseService.updatePost(postId, {
      reactions: updatedReactions,
    });
  }

  // Add comment
  async addComment(
    userId: string,
    postId: string,
    content: string,
  ): Promise<Post> {
    const post = await this.getPost(userId, postId);

    const user = await this.friendsService.getUserProfile(userId);
    if (!user) {
      throw new NotFoundException('User not found');
    }

    const newComment: PostComment = {
      id: `comment-${Date.now()}`,
      userId,
      userName: user.name || 'Unknown',
      content,
      createdAt: new Date().toISOString(),
    };

    const updatedComments = [...post.comments, newComment];

    return this.databaseService.updatePost(postId, {
      comments: updatedComments,
    });
  }

  // Delete comment (only own comments)
  async deleteComment(
    userId: string,
    postId: string,
    commentId: string,
  ): Promise<Post> {
    const post = await this.getPost(userId, postId);

    const comment = post.comments.find((c) => c.id === commentId);

    if (!comment) {
      throw new NotFoundException('Comment not found');
    }

    // Only comment author or post author can delete
    if (comment.userId !== userId && post.userId !== userId) {
      throw new ForbiddenException('Cannot delete this comment');
    }

    const updatedComments = post.comments.filter((c) => c.id !== commentId);

    return this.databaseService.updatePost(postId, {
      comments: updatedComments,
    });
  }
}
