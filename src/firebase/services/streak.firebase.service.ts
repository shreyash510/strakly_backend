import { Injectable } from '@nestjs/common';
import { FirebaseService } from '../firebase.service';

@Injectable()
export class StreakFirebaseService {
  constructor(private firebaseService: FirebaseService) {}

  async getUserStreaks(userId: string): Promise<any | null> {
    const db = this.firebaseService.getFirestore();
    const doc = await db.collection('streaks').doc(userId).get();
    if (!doc.exists) {
      return null;
    }
    return { id: doc.id, ...doc.data() };
  }

  async upsertUserStreaks(userId: string, data: Record<string, any>): Promise<any> {
    const db = this.firebaseService.getFirestore();
    await db.collection('streaks').doc(userId).set(
      { ...data, updatedAt: new Date().toISOString() },
      { merge: true },
    );
    const doc = await db.collection('streaks').doc(userId).get();
    return { id: doc.id, ...doc.data() };
  }
}
