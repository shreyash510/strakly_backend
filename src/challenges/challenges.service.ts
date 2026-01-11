import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
} from '@nestjs/common';
import { DatabaseService } from '../database/database.service';
import { FriendsService } from '../friends/friends.service';
import { CreateChallengeDto } from './dto/create-challenge.dto';

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
  participantIds?: string[];
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
  constructor(
    private readonly databaseService: DatabaseService,
    private readonly friendsService: FriendsService,
  ) {}

  // Get all challenges for a user (as participant)
  async getChallenges(userId: string): Promise<Challenge[]> {
    return this.databaseService.getUserChallenges(userId);
  }

  // Get single challenge
  async getChallenge(userId: string, challengeId: string): Promise<Challenge> {
    const challenge = await this.databaseService.getChallengeById(challengeId);

    if (!challenge) {
      throw new NotFoundException('Challenge not found');
    }

    // Check if user is a participant
    if (!challenge.participantIds?.includes(userId)) {
      throw new ForbiddenException('Not a participant of this challenge');
    }

    return challenge;
  }

  // Get pending invitations for a user
  async getInvitations(userId: string): Promise<ChallengeInvitation[]> {
    return this.databaseService.getUserChallengeInvitations(userId);
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
    const friendIds = friends.map((f) => f.id);

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
      participantIds: [userId],
      status,
    };

    const challenge = await this.databaseService.createChallenge(challengeData);

    // Create invitations for each invited friend
    for (const friendId of dto.invitedFriendIds) {
      const friend = friends.find((f) => f.id === friendId);
      if (friend) {
        await this.databaseService.createChallengeInvitation({
          challengeId: challenge.id,
          challengeTitle: dto.title,
          challengeDescription: dto.description || '',
          challengePrize: dto.prize,
          startDate: dto.startDate,
          endDate: dto.endDate,
          fromUserId: userId,
          fromUserName: creator.name || 'Unknown',
          toUserId: friendId,
          participantCount: 1,
        });
      }
    }

    return challenge;
  }

  // Respond to challenge invitation
  async respondToInvitation(
    userId: string,
    invitationId: string,
    action: 'accept' | 'decline',
  ): Promise<ChallengeInvitation> {
    const invitation = await this.databaseService.getChallengeInvitation(invitationId);

    if (!invitation) {
      throw new NotFoundException('Invitation not found');
    }

    if (invitation.toUserId !== userId) {
      throw new ForbiddenException('Cannot respond to this invitation');
    }

    if (invitation.status !== 'pending') {
      throw new BadRequestException('Invitation already processed');
    }

    // Check if challenge still exists
    const challenge = await this.databaseService.getChallengeById(invitation.challengeId);

    if (!challenge) {
      throw new NotFoundException('Challenge no longer exists');
    }

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

      const updatedParticipants = [...challenge.participants, newParticipant];
      const updatedParticipantIds = [...(challenge.participantIds || []), userId];

      await this.databaseService.updateChallenge(invitation.challengeId, {
        participants: updatedParticipants,
        participantIds: updatedParticipantIds,
      });
    }

    // Update invitation status
    return this.databaseService.updateChallengeInvitation(invitationId, {
      status: action === 'accept' ? 'accepted' : 'declined',
    });
  }

  // Mark today as complete for a challenge
  async markComplete(
    userId: string,
    challengeId: string,
  ): Promise<Challenge> {
    const challenge = await this.databaseService.getChallengeById(challengeId);

    if (!challenge) {
      throw new NotFoundException('Challenge not found');
    }

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

    return this.databaseService.updateChallenge(challengeId, {
      participants: updatedParticipants,
    });
  }

  // Check and update challenge statuses (called by scheduler)
  async updateChallengeStatuses(): Promise<void> {
    const now = new Date();
    const today = now.toISOString().split('T')[0];
    const yesterday = new Date(now.getTime() - 24 * 60 * 60 * 1000)
      .toISOString()
      .split('T')[0];

    // Get all challenges (need to implement getAllChallenges in DatabaseService)
    // For now, skip this as it requires a new method
    // TODO: Implement batch status updates for challenges
  }

  // Delete challenge (only creator can delete upcoming challenges)
  async deleteChallenge(
    userId: string,
    challengeId: string,
  ): Promise<{ success: boolean }> {
    const challenge = await this.databaseService.getChallengeById(challengeId);

    if (!challenge) {
      throw new NotFoundException('Challenge not found');
    }

    if (challenge.creatorId !== userId) {
      throw new ForbiddenException('Only the creator can delete this challenge');
    }

    if (challenge.status !== 'upcoming') {
      throw new BadRequestException('Can only delete upcoming challenges');
    }

    await this.databaseService.deleteChallenge(challengeId);

    return { success: true };
  }
}
