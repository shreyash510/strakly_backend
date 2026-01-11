import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ConflictException,
} from '@nestjs/common';
import { DatabaseService } from '../database/database.service';

export interface Friend {
  id: string;
  odataEntityId: string;
  friendUserId: string;
  friendName: string;
  friendEmail: string;
  connectedAt: string;
}

export interface FriendWithStats extends Friend {
  totalStreak: number;
  challengesWon: number;
  challengesLost: number;
}

export interface FriendRequest {
  id: string;
  fromUserId: string;
  fromUserName: string;
  fromUserEmail: string;
  toUserId: string;
  toUserName: string;
  toUserEmail: string;
  status: 'pending' | 'accepted' | 'declined';
  createdAt: string;
  updatedAt: string;
}

export interface UserProfile {
  id: string;
  name: string;
  email: string;
}

@Injectable()
export class FriendsService {
  private readonly friendsCollection = 'friends';
  private readonly requestsCollection = 'friendRequests';

  constructor(private readonly databaseService: DatabaseService) {}

  // Get user profile by email
  async findUserByEmail(email: string): Promise<UserProfile | null> {
    return this.databaseService.findUserByEmail(email);
  }

  // Get user profile by ID
  async getUserProfile(userId: string): Promise<UserProfile | null> {
    return this.databaseService.findUserById(userId);
  }

  // Get all friends for a user
  async getFriends(userId: string): Promise<Friend[]> {
    return this.databaseService.getCollection<Friend>(
      this.friendsCollection,
      userId,
    );
  }

  // Get all friends with stats (totalStreak, challengesWon, challengesLost)
  async getFriendsWithStats(userId: string): Promise<FriendWithStats[]> {
    const friends = await this.getFriends(userId);

    if (friends.length === 0) {
      return [];
    }

    // Get stats for each friend
    const friendsWithStats: FriendWithStats[] = await Promise.all(
      friends.map(async (friend) => {
        const stats = await this.getFriendStats(friend.friendUserId);
        return {
          ...friend,
          ...stats,
        };
      }),
    );

    return friendsWithStats;
  }

  // Get stats for a specific user (totalStreak, challengesWon, challengesLost)
  async getFriendStats(
    friendUserId: string,
  ): Promise<{ totalStreak: number; challengesWon: number; challengesLost: number }> {
    // Get total streak from current-streaks
    let totalStreak = 0;
    const streaksData = await this.databaseService.getDocument<any>(
      'current-streaks',
      friendUserId,
      'user-streaks',
    );

    if (streaksData?.items) {
      totalStreak = Object.values(streaksData.items as Record<string, { streak: number }>).reduce(
        (sum, item) => sum + (item.streak || 0),
        0,
      );
    }

    // Get challenges won/lost
    let challengesWon = 0;
    let challengesLost = 0;

    const challenges = await this.databaseService.getUserChallenges(friendUserId);
    challenges.forEach((challenge: any) => {
      if (challenge.status === 'completed') {
        if (challenge.winnerId === friendUserId) {
          challengesWon++;
        } else if (challenge.winnerId) {
          challengesLost++;
        }
      }
    });

    return { totalStreak, challengesWon, challengesLost };
  }

  // Get pending friend requests (both incoming and outgoing)
  async getFriendRequests(
    userId: string,
  ): Promise<{ incoming: FriendRequest[]; outgoing: FriendRequest[] }> {
    const incoming = await this.databaseService.getPendingFriendRequests(userId);
    const outgoing = await this.databaseService.getSentFriendRequests(userId);

    return { incoming, outgoing };
  }

  // Send friend request
  async sendFriendRequest(
    fromUserId: string,
    toEmail: string,
  ): Promise<FriendRequest> {
    // Find target user by email
    const toUser = await this.findUserByEmail(toEmail);
    if (!toUser) {
      throw new NotFoundException('User with this email not found');
    }

    if (toUser.id === fromUserId) {
      throw new BadRequestException('Cannot send friend request to yourself');
    }

    // Check if already friends
    const friends = await this.getFriends(fromUserId);
    const existingFriend = friends.find((f) => f.friendUserId === toUser.id);

    if (existingFriend) {
      throw new ConflictException('Already friends with this user');
    }

    // Check if request already exists
    const existingRequest = await this.databaseService.findFriendRequest(fromUserId, toUser.id);

    if (existingRequest) {
      throw new ConflictException('Friend request already sent');
    }

    // Check if there's a pending request from the other user
    const reverseRequest = await this.databaseService.findFriendRequest(toUser.id, fromUserId);

    if (reverseRequest) {
      // Auto-accept the reverse request
      return this.respondToRequest(fromUserId, reverseRequest.id, 'accept');
    }

    // Get sender profile
    const fromUser = await this.getUserProfile(fromUserId);
    if (!fromUser) {
      throw new NotFoundException('Sender user not found');
    }

    // Create friend request
    const requestData = {
      fromUserId,
      fromUserName: fromUser.name || 'Unknown',
      fromUserEmail: fromUser.email,
      toUserId: toUser.id,
      toUserName: toUser.name || 'Unknown',
      toUserEmail: toUser.email,
    };

    return this.databaseService.createFriendRequest(requestData);
  }

  // Respond to friend request (accept/decline)
  async respondToRequest(
    userId: string,
    requestId: string,
    action: 'accept' | 'decline',
  ): Promise<FriendRequest> {
    const request = await this.databaseService.getFriendRequestById(requestId);

    if (!request) {
      throw new NotFoundException('Friend request not found');
    }

    if (request.toUserId !== userId) {
      throw new BadRequestException('Cannot respond to this request');
    }

    if (request.status !== 'pending') {
      throw new BadRequestException('Request already processed');
    }

    const now = new Date().toISOString();

    if (action === 'accept') {
      // Add to both users' friends lists
      await this.databaseService.createDocument(
        this.friendsCollection,
        userId,
        {
          friendUserId: request.fromUserId,
          friendName: request.fromUserName,
          friendEmail: request.fromUserEmail,
          connectedAt: now,
        },
      );

      await this.databaseService.createDocument(
        this.friendsCollection,
        request.fromUserId,
        {
          friendUserId: userId,
          friendName: request.toUserName,
          friendEmail: request.toUserEmail,
          connectedAt: now,
        },
      );
    }

    // Update request status
    return this.databaseService.updateFriendRequest(requestId, {
      status: action === 'accept' ? 'accepted' : 'declined',
    });
  }

  // Cancel sent friend request
  async cancelRequest(userId: string, requestId: string): Promise<{ success: boolean }> {
    const request = await this.databaseService.getFriendRequestById(requestId);

    if (!request) {
      throw new NotFoundException('Friend request not found');
    }

    if (request.fromUserId !== userId) {
      throw new BadRequestException('Cannot cancel this request');
    }

    if (request.status !== 'pending') {
      throw new BadRequestException('Request already processed');
    }

    // Delete the request - for now update status to cancelled
    await this.databaseService.updateFriendRequest(requestId, {
      status: 'cancelled',
    });

    return { success: true };
  }

  // Remove friend
  async removeFriend(userId: string, friendId: string): Promise<{ success: boolean }> {
    // Get friend document
    const friend = await this.databaseService.getDocument<Friend>(
      this.friendsCollection,
      userId,
      friendId,
    );

    if (!friend) {
      throw new NotFoundException('Friend not found');
    }

    // Remove from current user
    await this.databaseService.deleteDocument(this.friendsCollection, userId, friendId);

    // Find and remove from other user
    const otherUserFriends = await this.databaseService.getCollection<Friend>(
      this.friendsCollection,
      friend.friendUserId,
    );

    const otherFriend = otherUserFriends.find((f) => f.friendUserId === userId);
    if (otherFriend) {
      await this.databaseService.deleteDocument(
        this.friendsCollection,
        friend.friendUserId,
        otherFriend.id,
      );
    }

    return { success: true };
  }
}
