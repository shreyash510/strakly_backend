import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ConflictException,
} from '@nestjs/common';
import { DatabaseService } from '../database/database.service';

export interface FriendWithDetails {
  id: string;
  name: string;
  email: string;
  connectedAt?: string;
}

export interface FriendWithStats extends FriendWithDetails {
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
  constructor(private readonly databaseService: DatabaseService) {}

  // Get user profile by email
  async findUserByEmail(email: string): Promise<UserProfile | null> {
    return this.databaseService.findUserByEmail(email);
  }

  // Get user profile by ID
  async getUserProfile(userId: string): Promise<UserProfile | null> {
    return this.databaseService.findUserById(userId);
  }

  // Get all friends for a user (with details)
  async getFriends(userId: string): Promise<FriendWithDetails[]> {
    const friendDoc = await this.databaseService.getFriendsDocument(userId);

    if (!friendDoc || !friendDoc.friends || friendDoc.friends.length === 0) {
      return [];
    }

    // Get details for each friend
    const friendsWithDetails: FriendWithDetails[] = [];
    for (const friendId of friendDoc.friends) {
      const user = await this.getUserProfile(friendId);
      if (user) {
        friendsWithDetails.push({
          id: user.id,
          name: user.name,
          email: user.email,
        });
      }
    }

    return friendsWithDetails;
  }

  // Get all users (excluding current user)
  async getAllUsers(currentUserId: string): Promise<UserProfile[]> {
    return this.databaseService.searchUsers('', currentUserId);
  }

  // Get all friends with stats
  async getFriendsWithStats(userId: string): Promise<FriendWithStats[]> {
    const friends = await this.getFriends(userId);

    if (friends.length === 0) {
      return [];
    }

    const friendsWithStats: FriendWithStats[] = await Promise.all(
      friends.map(async (friend) => {
        const stats = await this.getFriendStats(friend.id);
        return {
          ...friend,
          ...stats,
        };
      }),
    );

    return friendsWithStats;
  }

  // Get stats for a specific user
  async getFriendStats(
    friendUserId: string,
  ): Promise<{ totalStreak: number; challengesWon: number; challengesLost: number }> {
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

  // Get pending friend requests
  async getFriendRequests(
    userId: string,
  ): Promise<{ incoming: FriendRequest[]; sent: FriendRequest[] }> {
    const incoming = await this.databaseService.getPendingFriendRequests(userId);
    const sent = await this.databaseService.getSentFriendRequests(userId);

    return { incoming, sent };
  }

  // Send friend request
  async sendFriendRequest(
    fromUserId: string,
    toUserId: string,
  ): Promise<FriendRequest> {
    // Find target user
    const toUser = await this.getUserProfile(toUserId);
    if (!toUser) {
      throw new NotFoundException('User not found');
    }

    if (toUser.id === fromUserId) {
      throw new BadRequestException('Cannot send friend request to yourself');
    }

    // Check if already friends
    const friendDoc = await this.databaseService.getFriendsDocument(fromUserId);
    if (friendDoc?.friends?.includes(toUserId)) {
      throw new ConflictException('Already friends with this user');
    }

    // Check if request already exists
    const existingRequest = await this.databaseService.findFriendRequest(fromUserId, toUserId);
    if (existingRequest) {
      throw new ConflictException('Friend request already sent');
    }

    // Check if there's a pending request from the other user
    const reverseRequest = await this.databaseService.findFriendRequest(toUserId, fromUserId);
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

  // Respond to friend request
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

    if (action === 'accept') {
      // Add to both users' friends arrays
      await this.databaseService.addFriend(userId, request.fromUserId);
      await this.databaseService.addFriend(request.fromUserId, userId);
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

    await this.databaseService.updateFriendRequest(requestId, {
      status: 'cancelled',
    });

    return { success: true };
  }

  // Remove friend
  async removeFriend(userId: string, friendId: string): Promise<{ success: boolean }> {
    // Remove from current user's friends
    await this.databaseService.removeFriend(userId, friendId);

    // Remove from other user's friends
    await this.databaseService.removeFriend(friendId, userId);

    return { success: true };
  }
}
