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

  async searchUsers(
    query: string,
    excludeUserId?: string,
    page: number = 1,
    limit: number = 20,
  ): Promise<{ users: any[]; hasMore: boolean; page: number; total?: number }> {
    const db = this.firebaseService.getFirestore();
    // Firebase doesn't support offset well, so we fetch more and slice
    const fetchLimit = page * limit + 1;
    const snapshot = await db
      .collection('users')
      .where('name', '>=', query)
      .where('name', '<=', query + '\uf8ff')
      .limit(fetchLimit)
      .get();

    const allDocs = snapshot.docs.filter(
      (doc) => !excludeUserId || doc.id !== excludeUserId,
    );
    const startIndex = (page - 1) * limit;
    const paginatedDocs = allDocs.slice(startIndex, startIndex + limit);
    const hasMore = allDocs.length > startIndex + limit;

    const users = paginatedDocs.map((doc) => ({
      id: doc.id,
      name: doc.data().name,
      email: doc.data().email,
    }));

    return { users, hasMore, page };
  }
}
