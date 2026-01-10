import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
} from '@nestjs/common';
import { FirebaseService } from '../firebase/firebase.service';
import { FriendsService } from '../friends/friends.service';
import { CreateChallengeDto } from './dto/create-challenge.dto';
import * as admin from 'firebase-admin';

export type ChallengeStatus = 'upcoming' | 'active' | 'completed';
export type ParticipantStatus = 'pending' | 'active' | 'failed' | 'won' | 'lost';

export interface ChallengeParticipant {
  odataUserId: string;
  odataUserName: string;
  odataUserEmail: string;
  odataCurrentStreak: number;
  odataRank: number;
  odataStatus: ParticipantStatus;
  odataJoinedAt: string;
  odataLastCompletedDate?: string;
}

export interface Challenge {
  id: string;
  title: string;
  description: string;
  prize: string;
  startDate: string;
  endDate: string;
  creatorId: string;
  creatorName: string;
  participants: ChallengeParticipant[];
  status: ChallengeStatus;
  winnerId?: string;
  winnerName?: string;
  createdAt: string;
  updatedAt: string;
}

export interface ChallengeInvitation {
  id: string;
  challengeId: string;
  challengeTitle: string;
  challengeDescription: string;
  challengePrize: string;
  startDate: string;
  endDate: string;
  fromUserId: string;
  fromUserName: string;
  toUserId: string;
  status: 'pending' | 'accepted' | 'declined';
  participantCount: number;
  createdAt: string;
}

@Injectable()
export class ChallengesService {
  private readonly challengesCollection = 'challenges';
  private readonly invitationsCollection = 'challengeInvitations';

  constructor(
    private readonly firebaseService: FirebaseService,
    private readonly friendsService: FriendsService,
  ) {}

  private getDb(): admin.firestore.Firestore {
    return this.firebaseService.getFirestore();
  }

  // Get all challenges for a user (as participant)
  async getChallenges(userId: string): Promise<Challenge[]> {
    const snapshot = await this.getDb()
      .collection(this.challengesCollection)
      .where('participantIds', 'array-contains', userId)
      .orderBy('createdAt', 'desc')
      .get();

    return snapshot.docs.map((doc) => ({
      id: doc.id,
      ...doc.data(),
    })) as Challenge[];
  }

  // Get single challenge
  async getChallenge(userId: string, challengeId: string): Promise<Challenge> {
    const doc = await this.getDb()
      .collection(this.challengesCollection)
      .doc(challengeId)
      .get();

    if (!doc.exists) {
      throw new NotFoundException('Challenge not found');
    }

    const challenge = { id: doc.id, ...doc.data() } as Challenge & {
      participantIds: string[];
    };

    // Check if user is a participant
    if (!challenge.participantIds?.includes(userId)) {
      throw new ForbiddenException('Not a participant of this challenge');
    }

    return challenge;
  }

  // Get pending invitations for a user
  async getInvitations(userId: string): Promise<ChallengeInvitation[]> {
    const snapshot = await this.getDb()
      .collection(this.invitationsCollection)
      .where('toUserId', '==', userId)
      .where('status', '==', 'pending')
      .orderBy('createdAt', 'desc')
      .get();

    return snapshot.docs.map((doc) => ({
      id: doc.id,
      ...doc.data(),
    })) as ChallengeInvitation[];
  }

  // Create a new challenge
  async createChallenge(
    userId: string,
    dto: CreateChallengeDto,
  ): Promise<Challenge> {
    // Validate dates
    const startDate = new Date(dto.startDate);
    const endDate = new Date(dto.endDate);
    const now = new Date();

    if (endDate <= startDate) {
      throw new BadRequestException('End date must be after start date');
    }

    // Get creator profile
    const creator = await this.friendsService.getUserProfile(userId);
    if (!creator) {
      throw new NotFoundException('User not found');
    }

    // Verify all invited users are friends
    const friends = await this.friendsService.getFriends(userId);
    const friendIds = friends.map((f) => f.friendUserId);

    for (const friendId of dto.invitedFriendIds) {
      if (!friendIds.includes(friendId)) {
        throw new BadRequestException(
          `User ${friendId} is not in your friends list`,
        );
      }
    }

    // Determine initial status
    const status: ChallengeStatus = startDate > now ? 'upcoming' : 'active';

    // Create challenge document
    const challengeData = {
      title: dto.title,
      description: dto.description || '',
      prize: dto.prize,
      startDate: dto.startDate,
      endDate: dto.endDate,
      creatorId: userId,
      creatorName: creator.name || 'Unknown',
      participants: [
        {
          odataUserId: userId,
          odataUserName: creator.name || 'Unknown',
          odataUserEmail: creator.email,
          odataCurrentStreak: 0,
          odataRank: 1,
          odataStatus: 'active' as ParticipantStatus,
          odataJoinedAt: new Date().toISOString(),
        },
      ],
      participantIds: [userId], // For querying
      status,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    const docRef = await this.getDb()
      .collection(this.challengesCollection)
      .add(challengeData);

    // Create invitations for each invited friend
    const batch = this.getDb().batch();

    for (const friendId of dto.invitedFriendIds) {
      const friend = friends.find((f) => f.friendUserId === friendId);
      if (friend) {
        const invitationRef = this.getDb()
          .collection(this.invitationsCollection)
          .doc();

        batch.set(invitationRef, {
          challengeId: docRef.id,
          challengeTitle: dto.title,
          challengeDescription: dto.description || '',
          challengePrize: dto.prize,
          startDate: dto.startDate,
          endDate: dto.endDate,
          fromUserId: userId,
          fromUserName: creator.name || 'Unknown',
          toUserId: friendId,
          status: 'pending',
          participantCount: 1,
          createdAt: new Date().toISOString(),
        });
      }
    }

    await batch.commit();

    return {
      id: docRef.id,
      ...challengeData,
    } as Challenge;
  }

  // Respond to challenge invitation
  async respondToInvitation(
    userId: string,
    invitationId: string,
    action: 'accept' | 'decline',
  ): Promise<ChallengeInvitation> {
    const invitationRef = this.getDb()
      .collection(this.invitationsCollection)
      .doc(invitationId);

    const invitationDoc = await invitationRef.get();

    if (!invitationDoc.exists) {
      throw new NotFoundException('Invitation not found');
    }

    const invitation = {
      id: invitationDoc.id,
      ...invitationDoc.data(),
    } as ChallengeInvitation;

    if (invitation.toUserId !== userId) {
      throw new ForbiddenException('Cannot respond to this invitation');
    }

    if (invitation.status !== 'pending') {
      throw new BadRequestException('Invitation already processed');
    }

    // Check if challenge still exists and hasn't started (for accept)
    const challengeRef = this.getDb()
      .collection(this.challengesCollection)
      .doc(invitation.challengeId);

    const challengeDoc = await challengeRef.get();

    if (!challengeDoc.exists) {
      // Challenge was deleted, remove invitation
      await invitationRef.delete();
      throw new NotFoundException('Challenge no longer exists');
    }

    const challenge = challengeDoc.data() as Challenge;

    if (action === 'accept') {
      // Check if challenge already started
      const startDate = new Date(challenge.startDate);
      if (startDate <= new Date() && challenge.status === 'active') {
        throw new BadRequestException('Cannot join an active challenge');
      }

      // Get user profile
      const user = await this.friendsService.getUserProfile(userId);
      if (!user) {
        throw new NotFoundException('User not found');
      }

      // Add user to challenge participants
      const newParticipant: ChallengeParticipant = {
        odataUserId: userId,
        odataUserName: user.name || 'Unknown',
        odataUserEmail: user.email,
        odataCurrentStreak: 0,
        odataRank: challenge.participants.length + 1,
        odataStatus: 'active',
        odataJoinedAt: new Date().toISOString(),
      };

      await challengeRef.update({
        participants: admin.firestore.FieldValue.arrayUnion(newParticipant),
        participantIds: admin.firestore.FieldValue.arrayUnion(userId),
        updatedAt: new Date().toISOString(),
      });

      // Update all pending invitations for this challenge with new participant count
      const pendingInvitations = await this.getDb()
        .collection(this.invitationsCollection)
        .where('challengeId', '==', invitation.challengeId)
        .where('status', '==', 'pending')
        .get();

      const updateBatch = this.getDb().batch();
      pendingInvitations.docs.forEach((doc) => {
        updateBatch.update(doc.ref, {
          participantCount: challenge.participants.length + 1,
        });
      });
      await updateBatch.commit();
    }

    // Update invitation status
    await invitationRef.update({
      status: action === 'accept' ? 'accepted' : 'declined',
    });

    const updatedInvitation = await invitationRef.get();
    return {
      id: updatedInvitation.id,
      ...updatedInvitation.data(),
    } as ChallengeInvitation;
  }

  // Mark today as complete for a challenge
  async markComplete(
    userId: string,
    challengeId: string,
  ): Promise<Challenge> {
    const challengeRef = this.getDb()
      .collection(this.challengesCollection)
      .doc(challengeId);

    const challengeDoc = await challengeRef.get();

    if (!challengeDoc.exists) {
      throw new NotFoundException('Challenge not found');
    }

    const challenge = { id: challengeDoc.id, ...challengeDoc.data() } as Challenge & {
      participantIds: string[];
    };

    if (!challenge.participantIds?.includes(userId)) {
      throw new ForbiddenException('Not a participant of this challenge');
    }

    if (challenge.status !== 'active') {
      throw new BadRequestException('Challenge is not active');
    }

    const today = new Date().toISOString().split('T')[0];

    // Find user's participant record
    const participantIndex = challenge.participants.findIndex(
      (p) => p.odataUserId === userId,
    );

    if (participantIndex === -1) {
      throw new NotFoundException('Participant not found');
    }

    const participant = challenge.participants[participantIndex];

    // Check if already completed today
    if (participant.odataLastCompletedDate === today) {
      throw new BadRequestException('Already completed for today');
    }

    // Check if participant failed (broke streak)
    if (participant.odataStatus === 'failed') {
      throw new BadRequestException('You have already failed this challenge');
    }

    // Update streak
    const updatedParticipants = [...challenge.participants];
    updatedParticipants[participantIndex] = {
      ...participant,
      odataCurrentStreak: participant.odataCurrentStreak + 1,
      odataLastCompletedDate: today,
    };

    // Re-rank participants by streak
    updatedParticipants.sort(
      (a, b) => b.odataCurrentStreak - a.odataCurrentStreak,
    );
    updatedParticipants.forEach((p, index) => {
      p.odataRank = index + 1;
    });

    await challengeRef.update({
      participants: updatedParticipants,
      updatedAt: new Date().toISOString(),
    });

    const updatedDoc = await challengeRef.get();
    return { id: updatedDoc.id, ...updatedDoc.data() } as Challenge;
  }

  // Check and update challenge statuses (called by scheduler)
  async updateChallengeStatuses(): Promise<void> {
    const now = new Date();
    const today = now.toISOString().split('T')[0];
    const yesterday = new Date(now.getTime() - 24 * 60 * 60 * 1000)
      .toISOString()
      .split('T')[0];

    // Activate upcoming challenges that should start
    const upcomingSnapshot = await this.getDb()
      .collection(this.challengesCollection)
      .where('status', '==', 'upcoming')
      .where('startDate', '<=', today)
      .get();

    for (const doc of upcomingSnapshot.docs) {
      await doc.ref.update({
        status: 'active',
        updatedAt: new Date().toISOString(),
      });
    }

    // Complete challenges that have ended
    const activeSnapshot = await this.getDb()
      .collection(this.challengesCollection)
      .where('status', '==', 'active')
      .where('endDate', '<', today)
      .get();

    for (const doc of activeSnapshot.docs) {
      const challenge = doc.data() as Challenge;

      // Determine winner (highest streak)
      const sortedParticipants = [...challenge.participants].sort(
        (a, b) => b.odataCurrentStreak - a.odataCurrentStreak,
      );

      const winner = sortedParticipants[0];

      // Update participant statuses
      const updatedParticipants = sortedParticipants.map((p, index) => ({
        ...p,
        odataStatus: index === 0 ? 'won' : ('lost' as ParticipantStatus),
        odataRank: index + 1,
      }));

      await doc.ref.update({
        status: 'completed',
        winnerId: winner.odataUserId,
        winnerName: winner.odataUserName,
        participants: updatedParticipants,
        updatedAt: new Date().toISOString(),
      });
    }

    // Mark failed participants (missed yesterday and haven't completed today)
    const activeChallenges = await this.getDb()
      .collection(this.challengesCollection)
      .where('status', '==', 'active')
      .get();

    for (const doc of activeChallenges.docs) {
      const challenge = doc.data() as Challenge;
      let hasUpdates = false;

      const updatedParticipants = challenge.participants.map((p) => {
        // Skip already failed participants
        if (p.odataStatus === 'failed') return p;

        // Check if participant missed yesterday and hasn't completed today
        if (
          p.odataLastCompletedDate &&
          p.odataLastCompletedDate < yesterday &&
          p.odataLastCompletedDate !== today
        ) {
          hasUpdates = true;
          return { ...p, odataStatus: 'failed' as ParticipantStatus };
        }

        return p;
      });

      if (hasUpdates) {
        await doc.ref.update({
          participants: updatedParticipants,
          updatedAt: new Date().toISOString(),
        });
      }
    }
  }

  // Delete challenge (only creator can delete upcoming challenges)
  async deleteChallenge(
    userId: string,
    challengeId: string,
  ): Promise<{ success: boolean }> {
    const challengeRef = this.getDb()
      .collection(this.challengesCollection)
      .doc(challengeId);

    const challengeDoc = await challengeRef.get();

    if (!challengeDoc.exists) {
      throw new NotFoundException('Challenge not found');
    }

    const challenge = challengeDoc.data() as Challenge;

    if (challenge.creatorId !== userId) {
      throw new ForbiddenException('Only the creator can delete this challenge');
    }

    if (challenge.status !== 'upcoming') {
      throw new BadRequestException('Can only delete upcoming challenges');
    }

    // Delete all invitations for this challenge
    const invitationsSnapshot = await this.getDb()
      .collection(this.invitationsCollection)
      .where('challengeId', '==', challengeId)
      .get();

    const batch = this.getDb().batch();
    invitationsSnapshot.docs.forEach((doc) => {
      batch.delete(doc.ref);
    });
    batch.delete(challengeRef);

    await batch.commit();

    return { success: true };
  }
}
