import {
  Injectable,
  NotFoundException,
  ForbiddenException,
} from '@nestjs/common';
import { FirebaseService } from '../firebase/firebase.service';
import { FriendsService } from '../friends/friends.service';
import {
  CreatePostDto,
  UpdatePostDto,
  ReactionType,
  PostCategory,
} from './dto/create-post.dto';
import * as admin from 'firebase-admin';

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
  private readonly postsCollection = 'posts';

  constructor(
    private readonly firebaseService: FirebaseService,
    private readonly friendsService: FriendsService,
  ) {}

  private getDb(): admin.firestore.Firestore {
    return this.firebaseService.getFirestore();
  }

  // Get feed posts (own posts + friends' posts)
  async getFeed(userId: string): Promise<Post[]> {
    // Get user's friends
    const friends = await this.friendsService.getFriends(userId);
    const friendIds = friends.map((f) => f.friendUserId);

    // Include user's own posts
    const allowedUserIds = [userId, ...friendIds];

    // Firestore 'in' query supports max 30 values
    // For larger friend lists, we'd need pagination or different approach
    const userIdsToQuery = allowedUserIds.slice(0, 30);

    const snapshot = await this.getDb()
      .collection(this.postsCollection)
      .where('userId', 'in', userIdsToQuery)
      .orderBy('createdAt', 'desc')
      .limit(50)
      .get();

    return snapshot.docs.map((doc) => ({
      id: doc.id,
      ...doc.data(),
    })) as Post[];
  }

  // Get posts by category
  async getPostsByCategory(
    userId: string,
    category: PostCategory,
  ): Promise<Post[]> {
    const friends = await this.friendsService.getFriends(userId);
    const friendIds = friends.map((f) => f.friendUserId);
    const allowedUserIds = [userId, ...friendIds].slice(0, 30);

    const snapshot = await this.getDb()
      .collection(this.postsCollection)
      .where('userId', 'in', allowedUserIds)
      .where('category', '==', category)
      .orderBy('createdAt', 'desc')
      .limit(50)
      .get();

    return snapshot.docs.map((doc) => ({
      id: doc.id,
      ...doc.data(),
    })) as Post[];
  }

  // Get user's own posts
  async getMyPosts(userId: string): Promise<Post[]> {
    const snapshot = await this.getDb()
      .collection(this.postsCollection)
      .where('userId', '==', userId)
      .orderBy('createdAt', 'desc')
      .get();

    return snapshot.docs.map((doc) => ({
      id: doc.id,
      ...doc.data(),
    })) as Post[];
  }

  // Get single post
  async getPost(userId: string, postId: string): Promise<Post> {
    const doc = await this.getDb()
      .collection(this.postsCollection)
      .doc(postId)
      .get();

    if (!doc.exists) {
      throw new NotFoundException('Post not found');
    }

    const post = { id: doc.id, ...doc.data() } as Post;

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
      reactions: [],
      comments: [],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    const docRef = await this.getDb()
      .collection(this.postsCollection)
      .add(postData);

    return {
      id: docRef.id,
      ...postData,
    } as Post;
  }

  // Update a post (only own posts)
  async updatePost(
    userId: string,
    postId: string,
    dto: UpdatePostDto,
  ): Promise<Post> {
    const postRef = this.getDb().collection(this.postsCollection).doc(postId);
    const postDoc = await postRef.get();

    if (!postDoc.exists) {
      throw new NotFoundException('Post not found');
    }

    const post = postDoc.data() as Post;

    if (post.userId !== userId) {
      throw new ForbiddenException('Cannot update this post');
    }

    const updateData: Partial<Post> = {
      updatedAt: new Date().toISOString(),
    };

    if (dto.content !== undefined) {
      updateData.content = dto.content;
    }

    if (dto.category !== undefined) {
      updateData.category = dto.category;
    }

    await postRef.update(updateData);

    const updatedDoc = await postRef.get();
    return { id: updatedDoc.id, ...updatedDoc.data() } as Post;
  }

  // Delete a post (only own posts)
  async deletePost(userId: string, postId: string): Promise<{ success: boolean }> {
    const postRef = this.getDb().collection(this.postsCollection).doc(postId);
    const postDoc = await postRef.get();

    if (!postDoc.exists) {
      throw new NotFoundException('Post not found');
    }

    const post = postDoc.data() as Post;

    if (post.userId !== userId) {
      throw new ForbiddenException('Cannot delete this post');
    }

    await postRef.delete();

    return { success: true };
  }

  // Add/toggle reaction
  async toggleReaction(
    userId: string,
    postId: string,
    type: ReactionType,
  ): Promise<Post> {
    const post = await this.getPost(userId, postId);
    const postRef = this.getDb().collection(this.postsCollection).doc(postId);

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

    await postRef.update({
      reactions: updatedReactions,
      updatedAt: new Date().toISOString(),
    });

    const updatedDoc = await postRef.get();
    return { id: updatedDoc.id, ...updatedDoc.data() } as Post;
  }

  // Add comment
  async addComment(
    userId: string,
    postId: string,
    content: string,
  ): Promise<Post> {
    const post = await this.getPost(userId, postId);
    const postRef = this.getDb().collection(this.postsCollection).doc(postId);

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

    await postRef.update({
      comments: admin.firestore.FieldValue.arrayUnion(newComment),
      updatedAt: new Date().toISOString(),
    });

    const updatedDoc = await postRef.get();
    return { id: updatedDoc.id, ...updatedDoc.data() } as Post;
  }

  // Delete comment (only own comments)
  async deleteComment(
    userId: string,
    postId: string,
    commentId: string,
  ): Promise<Post> {
    const post = await this.getPost(userId, postId);
    const postRef = this.getDb().collection(this.postsCollection).doc(postId);

    const comment = post.comments.find((c) => c.id === commentId);

    if (!comment) {
      throw new NotFoundException('Comment not found');
    }

    // Only comment author or post author can delete
    if (comment.userId !== userId && post.userId !== userId) {
      throw new ForbiddenException('Cannot delete this comment');
    }

    const updatedComments = post.comments.filter((c) => c.id !== commentId);

    await postRef.update({
      comments: updatedComments,
      updatedAt: new Date().toISOString(),
    });

    const updatedDoc = await postRef.get();
    return { id: updatedDoc.id, ...updatedDoc.data() } as Post;
  }
}
