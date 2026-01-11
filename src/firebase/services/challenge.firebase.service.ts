import { Injectable } from '@nestjs/common';
import { FirebaseService } from '../firebase.service';

@Injectable()
export class ChallengeFirebaseService {
  constructor(private firebaseService: FirebaseService) {}

  async getChallengeById(challengeId: string): Promise<any | null> {
    const db = this.firebaseService.getFirestore();
    const doc = await db.collection('challenges').doc(challengeId).get();
    if (!doc.exists) {
      return null;
    }
    return { id: doc.id, ...doc.data() };
  }

  async getUserChallenges(userId: string): Promise<any[]> {
    const db = this.firebaseService.getFirestore();
    const snapshot = await db
      .collection('challenges')
      .where('participantIds', 'array-contains', userId)
      .get();
    return snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
  }

  async createChallenge(data: Record<string, any>): Promise<any> {
    const db = this.firebaseService.getFirestore();
    const docRef = await db.collection('challenges').add({
      ...data,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });
    const doc = await docRef.get();
    return { id: doc.id, ...doc.data() };
  }

  async updateChallenge(challengeId: string, data: Record<string, any>): Promise<any> {
    const db = this.firebaseService.getFirestore();
    await db.collection('challenges').doc(challengeId).update({
      ...data,
      updatedAt: new Date().toISOString(),
    });
    const doc = await db.collection('challenges').doc(challengeId).get();
    return { id: doc.id, ...doc.data() };
  }

  async deleteChallenge(challengeId: string): Promise<boolean> {
    const db = this.firebaseService.getFirestore();
    await db.collection('challenges').doc(challengeId).delete();
    return true;
  }

  // Challenge invitations
  async getChallengeInvitation(invitationId: string): Promise<any | null> {
    const db = this.firebaseService.getFirestore();
    const doc = await db.collection('challengeInvitations').doc(invitationId).get();
    if (!doc.exists) {
      return null;
    }
    return { id: doc.id, ...doc.data() };
  }

  async getUserChallengeInvitations(userId: string): Promise<any[]> {
    const db = this.firebaseService.getFirestore();
    const snapshot = await db
      .collection('challengeInvitations')
      .where('toUserId', '==', userId)
      .where('status', '==', 'pending')
      .get();
    return snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
  }

  async createChallengeInvitation(data: Record<string, any>): Promise<any> {
    const db = this.firebaseService.getFirestore();
    const docRef = await db.collection('challengeInvitations').add({
      ...data,
      status: 'pending',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });
    const doc = await docRef.get();
    return { id: doc.id, ...doc.data() };
  }

  async updateChallengeInvitation(invitationId: string, data: Record<string, any>): Promise<any> {
    const db = this.firebaseService.getFirestore();
    await db.collection('challengeInvitations').doc(invitationId).update({
      ...data,
      updatedAt: new Date().toISOString(),
    });
    const doc = await db.collection('challengeInvitations').doc(invitationId).get();
    return { id: doc.id, ...doc.data() };
  }

  async findExistingChallengeInvitation(challengeId: string, toUserId: string): Promise<any | null> {
    const db = this.firebaseService.getFirestore();
    const snapshot = await db
      .collection('challengeInvitations')
      .where('challengeId', '==', challengeId)
      .where('toUserId', '==', toUserId)
      .where('status', '==', 'pending')
      .get();
    if (snapshot.empty) {
      return null;
    }
    const doc = snapshot.docs[0];
    return { id: doc.id, ...doc.data() };
  }
}
