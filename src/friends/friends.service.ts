import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ConflictException,
} from '@nestjs/common';
import { FirebaseService } from '../firebase/firebase.service';
import * as admin from 'firebase-admin';

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

  constructor(private readonly firebaseService: FirebaseService) {}

  private getDb(): admin.firestore.Firestore {
    return this.firebaseService.getFirestore();
  }

  // Get user profile by email
  async findUserByEmail(email: string): Promise<UserProfile | null> {
    const usersSnapshot = await this.getDb()
      .collection('users')
      .where('email', '==', email)
      .limit(1)
      .get();

    if (usersSnapshot.empty) {
      return null;
    }

    const userDoc = usersSnapshot.docs[0];
    return {
      id: userDoc.id,
      ...userDoc.data(),
    } as UserProfile;
  }

  // Get user profile by ID
  async getUserProfile(userId: string): Promise<UserProfile | null> {
    const userDoc = await this.getDb().collection('users').doc(userId).get();

    if (!userDoc.exists) {
      return null;
    }

    return {
      id: userDoc.id,
      ...userDoc.data(),
    } as UserProfile;
  }

  // Get all friends for a user
  async getFriends(userId: string): Promise<Friend[]> {
    const snapshot = await this.getDb()
      .collection('users')
      .doc(userId)
      .collection(this.friendsCollection)
      .orderBy('connectedAt', 'desc')
      .get();

    return snapshot.docs.map((doc) => ({
      id: doc.id,
      ...doc.data(),
    })) as Friend[];
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
    const streaksDoc = await this.getDb()
      .collection('users')
      .doc(friendUserId)
      .collection('current-streaks')
      .doc('user-streaks')
      .get();

    if (streaksDoc.exists) {
      const streaksData = streaksDoc.data();
      if (streaksData?.items) {
        // Sum all streaks
        totalStreak = Object.values(streaksData.items as Record<string, { streak: number }>).reduce(
          (sum, item) => sum + (item.streak || 0),
          0,
        );
      }
    }

    // Get challenges won/lost
    let challengesWon = 0;
    let challengesLost = 0;

    const challengesSnapshot = await this.getDb()
      .collection('challenges')
      .where('participantIds', 'array-contains', friendUserId)
      .where('status', '==', 'completed')
      .get();

    challengesSnapshot.docs.forEach((doc) => {
      const challenge = doc.data();
      if (challenge.winnerId === friendUserId) {
        challengesWon++;
      } else if (challenge.winnerId) {
        // Has a winner but it's not this user
        challengesLost++;
      }
    });

    return { totalStreak, challengesWon, challengesLost };
  }

  // Get pending friend requests (both incoming and outgoing)
  async getFriendRequests(
    userId: string,
  ): Promise<{ incoming: FriendRequest[]; outgoing: FriendRequest[] }> {
    // Get incoming requests
    const incomingSnapshot = await this.getDb()
      .collection(this.requestsCollection)
      .where('toUserId', '==', userId)
      .where('status', '==', 'pending')
      .orderBy('createdAt', 'desc')
      .get();

    const incoming = incomingSnapshot.docs.map((doc) => ({
      id: doc.id,
      ...doc.data(),
    })) as FriendRequest[];

    // Get outgoing requests
    const outgoingSnapshot = await this.getDb()
      .collection(this.requestsCollection)
      .where('fromUserId', '==', userId)
      .where('status', '==', 'pending')
      .orderBy('createdAt', 'desc')
      .get();

    const outgoing = outgoingSnapshot.docs.map((doc) => ({
      id: doc.id,
      ...doc.data(),
    })) as FriendRequest[];

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
    const existingFriend = await this.getDb()
      .collection('users')
      .doc(fromUserId)
      .collection(this.friendsCollection)
      .where('friendUserId', '==', toUser.id)
      .limit(1)
      .get();

    if (!existingFriend.empty) {
      throw new ConflictException('Already friends with this user');
    }

    // Check if request already exists
    const existingRequest = await this.getDb()
      .collection(this.requestsCollection)
      .where('fromUserId', '==', fromUserId)
      .where('toUserId', '==', toUser.id)
      .where('status', '==', 'pending')
      .limit(1)
      .get();

    if (!existingRequest.empty) {
      throw new ConflictException('Friend request already sent');
    }

    // Check if there's a pending request from the other user
    const reverseRequest = await this.getDb()
      .collection(this.requestsCollection)
      .where('fromUserId', '==', toUser.id)
      .where('toUserId', '==', fromUserId)
      .where('status', '==', 'pending')
      .limit(1)
      .get();

    if (!reverseRequest.empty) {
      // Auto-accept the reverse request
      return this.respondToRequest(fromUserId, reverseRequest.docs[0].id, 'accept');
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
      status: 'pending',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    const docRef = await this.getDb()
      .collection(this.requestsCollection)
      .add(requestData);

    return {
      id: docRef.id,
      ...requestData,
    } as FriendRequest;
  }

  // Respond to friend request (accept/decline)
  async respondToRequest(
    userId: string,
    requestId: string,
    action: 'accept' | 'decline',
  ): Promise<FriendRequest> {
    const requestRef = this.getDb()
      .collection(this.requestsCollection)
      .doc(requestId);

    const requestDoc = await requestRef.get();

    if (!requestDoc.exists) {
      throw new NotFoundException('Friend request not found');
    }

    const request = { id: requestDoc.id, ...requestDoc.data() } as FriendRequest;

    if (request.toUserId !== userId) {
      throw new BadRequestException('Cannot respond to this request');
    }

    if (request.status !== 'pending') {
      throw new BadRequestException('Request already processed');
    }

    const now = new Date().toISOString();

    if (action === 'accept') {
      // Add to both users' friends lists
      const batch = this.getDb().batch();

      // Add friend for current user
      const friend1Ref = this.getDb()
        .collection('users')
        .doc(userId)
        .collection(this.friendsCollection)
        .doc();

      batch.set(friend1Ref, {
        friendUserId: request.fromUserId,
        friendName: request.fromUserName,
        friendEmail: request.fromUserEmail,
        connectedAt: now,
      });

      // Add friend for sender
      const friend2Ref = this.getDb()
        .collection('users')
        .doc(request.fromUserId)
        .collection(this.friendsCollection)
        .doc();

      batch.set(friend2Ref, {
        friendUserId: userId,
        friendName: request.toUserName,
        friendEmail: request.toUserEmail,
        connectedAt: now,
      });

      // Update request status
      batch.update(requestRef, {
        status: 'accepted',
        updatedAt: now,
      });

      await batch.commit();
    } else {
      // Decline - just update status
      await requestRef.update({
        status: 'declined',
        updatedAt: now,
      });
    }

    const updatedDoc = await requestRef.get();
    return { id: updatedDoc.id, ...updatedDoc.data() } as FriendRequest;
  }

  // Cancel sent friend request
  async cancelRequest(userId: string, requestId: string): Promise<{ success: boolean }> {
    const requestRef = this.getDb()
      .collection(this.requestsCollection)
      .doc(requestId);

    const requestDoc = await requestRef.get();

    if (!requestDoc.exists) {
      throw new NotFoundException('Friend request not found');
    }

    const request = requestDoc.data() as FriendRequest;

    if (request.fromUserId !== userId) {
      throw new BadRequestException('Cannot cancel this request');
    }

    if (request.status !== 'pending') {
      throw new BadRequestException('Request already processed');
    }

    await requestRef.delete();

    return { success: true };
  }

  // Remove friend
  async removeFriend(userId: string, friendId: string): Promise<{ success: boolean }> {
    // Get friend document
    const friendDoc = await this.getDb()
      .collection('users')
      .doc(userId)
      .collection(this.friendsCollection)
      .doc(friendId)
      .get();

    if (!friendDoc.exists) {
      throw new NotFoundException('Friend not found');
    }

    const friend = friendDoc.data() as Friend;

    // Remove from both users
    const batch = this.getDb().batch();

    // Remove from current user
    batch.delete(
      this.getDb()
        .collection('users')
        .doc(userId)
        .collection(this.friendsCollection)
        .doc(friendId),
    );

    // Find and remove from other user
    const otherFriendSnapshot = await this.getDb()
      .collection('users')
      .doc(friend.friendUserId)
      .collection(this.friendsCollection)
      .where('friendUserId', '==', userId)
      .limit(1)
      .get();

    if (!otherFriendSnapshot.empty) {
      batch.delete(otherFriendSnapshot.docs[0].ref);
    }

    await batch.commit();

    return { success: true };
  }
}
