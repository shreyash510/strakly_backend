import { Injectable } from '@nestjs/common';
import { FirebaseService } from '../firebase.service';

@Injectable()
export class UserFirebaseService {
  constructor(private firebaseService: FirebaseService) {}

  async findUserByEmail(email: string): Promise<any | null> {
    const db = this.firebaseService.getFirestore();
    const snapshot = await db.collection('users').where('email', '==', email).get();
    if (snapshot.empty) {
      return null;
    }
    const doc = snapshot.docs[0];
    return { id: doc.id, ...doc.data() };
  }

  async findUserById(userId: string): Promise<any | null> {
    const db = this.firebaseService.getFirestore();
    const doc = await db.collection('users').doc(userId).get();
    if (!doc.exists) {
      return null;
    }
    return { id: doc.id, ...doc.data() };
  }

  async createUser(data: Record<string, any>): Promise<any> {
    const db = this.firebaseService.getFirestore();
    const docRef = await db.collection('users').add({
      ...data,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });
    const doc = await docRef.get();
    return { id: doc.id, ...doc.data() };
  }

  async updateUser(userId: string, data: Record<string, any>): Promise<any> {
    const db = this.firebaseService.getFirestore();
    await db.collection('users').doc(userId).update({
      ...data,
      updatedAt: new Date().toISOString(),
    });
    const doc = await db.collection('users').doc(userId).get();
    return { id: doc.id, ...doc.data() };
  }

  async searchUsers(query: string, excludeUserId?: string): Promise<any[]> {
    const db = this.firebaseService.getFirestore();
    const snapshot = await db
      .collection('users')
      .where('name', '>=', query)
      .where('name', '<=', query + '\uf8ff')
      .limit(20)
      .get();
    return snapshot.docs
      .filter((doc) => !excludeUserId || doc.id !== excludeUserId)
      .map((doc) => ({
        id: doc.id,
        name: doc.data().name,
        email: doc.data().email,
      }));
  }
}
