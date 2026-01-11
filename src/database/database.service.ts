import { Injectable, OnModuleInit, Optional } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { FirebaseService } from '../firebase/firebase.service';
import {
  UserFirebaseService,
  FriendFirebaseService,
  ChallengeFirebaseService,
  PostFirebaseService,
  StreakFirebaseService,
} from '../firebase/services';
import {
  BaseMongoService,
  UserMongoService,
  FriendMongoService,
  ChallengeMongoService,
  PostMongoService,
  StreakMongoService,
} from './services';

@Injectable()
export class DatabaseService implements OnModuleInit {
  private readonly databaseType: string;

  constructor(
    private configService: ConfigService,
    // Firebase services
    @Optional() private firebaseService: FirebaseService,
    @Optional() private userFirebaseService: UserFirebaseService,
    @Optional() private friendFirebaseService: FriendFirebaseService,
    @Optional() private challengeFirebaseService: ChallengeFirebaseService,
    @Optional() private postFirebaseService: PostFirebaseService,
    @Optional() private streakFirebaseService: StreakFirebaseService,
    // MongoDB services
    @Optional() private baseMongoService: BaseMongoService,
    @Optional() private userMongoService: UserMongoService,
    @Optional() private friendMongoService: FriendMongoService,
    @Optional() private challengeMongoService: ChallengeMongoService,
    @Optional() private postMongoService: PostMongoService,
    @Optional() private streakMongoService: StreakMongoService,
  ) {
    this.databaseType = this.configService.get<string>('DATABASE_TYPE') || 'firebase';
  }

  onModuleInit() {
    console.log(`DatabaseService initialized with type: ${this.databaseType}`);
  }

  isFirebase(): boolean {
    return this.databaseType === 'firebase';
  }

  isMongoDB(): boolean {
    return this.databaseType === 'mongodb';
  }

  // Get the underlying services for direct access when needed
  getFirebaseService(): FirebaseService {
    return this.firebaseService;
  }

  getUserMongoService(): UserMongoService {
    return this.userMongoService;
  }

  getFriendMongoService(): FriendMongoService {
    return this.friendMongoService;
  }

  getChallengeMongoService(): ChallengeMongoService {
    return this.challengeMongoService;
  }

  getPostMongoService(): PostMongoService {
    return this.postMongoService;
  }

  getStreakMongoService(): StreakMongoService {
    return this.streakMongoService;
  }

  // Generic CRUD operations
  async getCollection<T>(collectionName: string, userId: string): Promise<T[]> {
    if (this.isMongoDB()) {
      return this.baseMongoService.getCollection<T>(collectionName, userId);
    }
    return this.firebaseService.getCollection<T>(collectionName, userId);
  }

  async getDocument<T>(collectionName: string, userId: string, docId: string): Promise<T | null> {
    if (this.isMongoDB()) {
      return this.baseMongoService.getDocument<T>(collectionName, userId, docId);
    }
    return this.firebaseService.getDocument<T>(collectionName, userId, docId);
  }

  async createDocument<T>(collectionName: string, userId: string, data: Record<string, any>): Promise<T> {
    if (this.isMongoDB()) {
      return this.baseMongoService.createDocument<T>(collectionName, userId, data);
    }
    return this.firebaseService.createDocument<T>(collectionName, userId, data);
  }

  async updateDocument<T>(collectionName: string, userId: string, docId: string, data: Record<string, any>): Promise<T> {
    if (this.isMongoDB()) {
      return this.baseMongoService.updateDocument<T>(collectionName, userId, docId, data);
    }
    return this.firebaseService.updateDocument<T>(collectionName, userId, docId, data);
  }

  async deleteDocument(collectionName: string, userId: string, docId: string): Promise<boolean> {
    if (this.isMongoDB()) {
      return this.baseMongoService.deleteDocument(collectionName, userId, docId);
    }
    return this.firebaseService.deleteDocument(collectionName, userId, docId);
  }

  async setDocument<T>(collectionName: string, userId: string, docId: string, data: Record<string, any>): Promise<T> {
    if (this.isMongoDB()) {
      return this.baseMongoService.setDocument<T>(collectionName, userId, docId, data);
    }
    return this.firebaseService.setDocument<T>(collectionName, userId, docId, data);
  }

  async getAllUsersCollection<T>(collectionName: string): Promise<{ userId: string; habits: T[] }[]> {
    if (this.isMongoDB()) {
      return this.baseMongoService.getAllUsersCollection<T>(collectionName);
    }
    return this.firebaseService.getAllUsersCollection<T>(collectionName);
  }

  // User methods (for auth)
  async findUserByEmail(email: string): Promise<any | null> {
    if (this.isMongoDB()) {
      return this.userMongoService.findUserByEmail(email);
    }
    return this.userFirebaseService.findUserByEmail(email);
  }

  async findUserById(userId: string): Promise<any | null> {
    if (this.isMongoDB()) {
      return this.userMongoService.findUserById(userId);
    }
    return this.userFirebaseService.findUserById(userId);
  }

  async createUser(data: Record<string, any>): Promise<any> {
    if (this.isMongoDB()) {
      return this.userMongoService.createUser(data);
    }
    return this.userFirebaseService.createUser(data);
  }

  async updateUser(userId: string, data: Record<string, any>): Promise<any> {
    if (this.isMongoDB()) {
      return this.userMongoService.updateUser(userId, data);
    }
    return this.userFirebaseService.updateUser(userId, data);
  }

  async searchUsers(query: string, excludeUserId?: string): Promise<any[]> {
    if (this.isMongoDB()) {
      return this.userMongoService.searchUsers(query, excludeUserId);
    }
    return this.userFirebaseService.searchUsers(query, excludeUserId);
  }

  // Friends methods
  async getFriendsDocument(userId: string): Promise<{ userId: string; friends: string[] } | null> {
    if (this.isMongoDB()) {
      return this.friendMongoService.getFriendsDocument(userId);
    }
    return this.friendFirebaseService.getFriendsDocument(userId);
  }

  async addFriend(userId: string, friendId: string): Promise<void> {
    if (this.isMongoDB()) {
      return this.friendMongoService.addFriend(userId, friendId);
    }
    return this.friendFirebaseService.addFriend(userId, friendId);
  }

  async removeFriend(userId: string, friendId: string): Promise<void> {
    if (this.isMongoDB()) {
      return this.friendMongoService.removeFriend(userId, friendId);
    }
    return this.friendFirebaseService.removeFriend(userId, friendId);
  }

  async findFriendship(userId1: string, userId2: string): Promise<any | null> {
    if (this.isMongoDB()) {
      return this.friendMongoService.findFriendship(userId1, userId2);
    }
    return this.friendFirebaseService.findFriendship(userId1, userId2);
  }

  async getFriends(userId: string): Promise<any[]> {
    if (this.isMongoDB()) {
      return this.friendMongoService.getFriends(userId);
    }
    return this.friendFirebaseService.getFriends(userId);
  }

  async deleteFriendship(userId1: string, userId2: string): Promise<boolean> {
    if (this.isMongoDB()) {
      return this.friendMongoService.deleteFriendship(userId1, userId2);
    }
    return this.friendFirebaseService.deleteFriendship(userId1, userId2);
  }

  async createFriend(data: Record<string, any>): Promise<any> {
    if (this.isMongoDB()) {
      return this.friendMongoService.createFriend(data);
    }
    return this.friendFirebaseService.createFriend(data);
  }

  // Friend requests
  async findFriendRequest(fromUserId: string, toUserId: string): Promise<any | null> {
    if (this.isMongoDB()) {
      return this.friendMongoService.findFriendRequest(fromUserId, toUserId);
    }
    return this.friendFirebaseService.findFriendRequest(fromUserId, toUserId);
  }

  async getFriendRequestById(requestId: string): Promise<any | null> {
    if (this.isMongoDB()) {
      return this.friendMongoService.getFriendRequestById(requestId);
    }
    return this.friendFirebaseService.getFriendRequestById(requestId);
  }

  async getPendingFriendRequests(userId: string): Promise<any[]> {
    if (this.isMongoDB()) {
      return this.friendMongoService.getPendingFriendRequests(userId);
    }
    return this.friendFirebaseService.getPendingFriendRequests(userId);
  }

  async getSentFriendRequests(userId: string): Promise<any[]> {
    if (this.isMongoDB()) {
      return this.friendMongoService.getSentFriendRequests(userId);
    }
    return this.friendFirebaseService.getSentFriendRequests(userId);
  }

  async createFriendRequest(data: Record<string, any>): Promise<any> {
    if (this.isMongoDB()) {
      return this.friendMongoService.createFriendRequest(data);
    }
    return this.friendFirebaseService.createFriendRequest(data);
  }

  async updateFriendRequest(requestId: string, data: Record<string, any>): Promise<any> {
    if (this.isMongoDB()) {
      return this.friendMongoService.updateFriendRequest(requestId, data);
    }
    return this.friendFirebaseService.updateFriendRequest(requestId, data);
  }

  // Challenge methods
  async getChallengeById(challengeId: string): Promise<any | null> {
    if (this.isMongoDB()) {
      return this.challengeMongoService.getChallengeById(challengeId);
    }
    return this.challengeFirebaseService.getChallengeById(challengeId);
  }

  async getUserChallenges(userId: string): Promise<any[]> {
    if (this.isMongoDB()) {
      return this.challengeMongoService.getUserChallenges(userId);
    }
    return this.challengeFirebaseService.getUserChallenges(userId);
  }

  async createChallenge(data: Record<string, any>): Promise<any> {
    if (this.isMongoDB()) {
      return this.challengeMongoService.createChallenge(data);
    }
    return this.challengeFirebaseService.createChallenge(data);
  }

  async updateChallenge(challengeId: string, data: Record<string, any>): Promise<any> {
    if (this.isMongoDB()) {
      return this.challengeMongoService.updateChallenge(challengeId, data);
    }
    return this.challengeFirebaseService.updateChallenge(challengeId, data);
  }

  async deleteChallenge(challengeId: string): Promise<boolean> {
    if (this.isMongoDB()) {
      return this.challengeMongoService.deleteChallenge(challengeId);
    }
    return this.challengeFirebaseService.deleteChallenge(challengeId);
  }

  // Challenge invitations
  async getChallengeInvitation(invitationId: string): Promise<any | null> {
    if (this.isMongoDB()) {
      return this.challengeMongoService.getChallengeInvitation(invitationId);
    }
    return this.challengeFirebaseService.getChallengeInvitation(invitationId);
  }

  async getUserChallengeInvitations(userId: string): Promise<any[]> {
    if (this.isMongoDB()) {
      return this.challengeMongoService.getUserChallengeInvitations(userId);
    }
    return this.challengeFirebaseService.getUserChallengeInvitations(userId);
  }

  async createChallengeInvitation(data: Record<string, any>): Promise<any> {
    if (this.isMongoDB()) {
      return this.challengeMongoService.createChallengeInvitation(data);
    }
    return this.challengeFirebaseService.createChallengeInvitation(data);
  }

  async updateChallengeInvitation(invitationId: string, data: Record<string, any>): Promise<any> {
    if (this.isMongoDB()) {
      return this.challengeMongoService.updateChallengeInvitation(invitationId, data);
    }
    return this.challengeFirebaseService.updateChallengeInvitation(invitationId, data);
  }

  async findExistingChallengeInvitation(challengeId: string, toUserId: string): Promise<any | null> {
    if (this.isMongoDB()) {
      return this.challengeMongoService.findExistingChallengeInvitation(challengeId, toUserId);
    }
    return this.challengeFirebaseService.findExistingChallengeInvitation(challengeId, toUserId);
  }

  // Posts methods
  async getAllPosts(limit: number = 50): Promise<any[]> {
    if (this.isMongoDB()) {
      return this.postMongoService.getAllPosts(limit);
    }
    return this.postFirebaseService.getAllPosts(limit);
  }

  async getFriendsPosts(friendIds: string[], limit: number = 50): Promise<any[]> {
    if (this.isMongoDB()) {
      return this.postMongoService.getFriendsPosts(friendIds, limit);
    }
    return this.postFirebaseService.getFriendsPosts(friendIds, limit);
  }

  async getPostById(postId: string): Promise<any | null> {
    if (this.isMongoDB()) {
      return this.postMongoService.getPostById(postId);
    }
    return this.postFirebaseService.getPostById(postId);
  }

  async createPost(data: Record<string, any>): Promise<any> {
    if (this.isMongoDB()) {
      return this.postMongoService.createPost(data);
    }
    return this.postFirebaseService.createPost(data);
  }

  async updatePost(postId: string, data: Record<string, any>): Promise<any> {
    if (this.isMongoDB()) {
      return this.postMongoService.updatePost(postId, data);
    }
    return this.postFirebaseService.updatePost(postId, data);
  }

  async deletePost(postId: string): Promise<boolean> {
    if (this.isMongoDB()) {
      return this.postMongoService.deletePost(postId);
    }
    return this.postFirebaseService.deletePost(postId);
  }

  // Streaks methods
  async getUserStreaks(userId: string): Promise<any | null> {
    if (this.isMongoDB()) {
      return this.streakMongoService.getUserStreaks(userId);
    }
    return this.streakFirebaseService.getUserStreaks(userId);
  }

  async upsertUserStreaks(userId: string, data: Record<string, any>): Promise<any> {
    if (this.isMongoDB()) {
      return this.streakMongoService.upsertUserStreaks(userId, data);
    }
    return this.streakFirebaseService.upsertUserStreaks(userId, data);
  }
}
