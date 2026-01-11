import { Injectable } from '@nestjs/common';
import { FirebaseService } from '../firebase.service';

@Injectable()
export class PostFirebaseService {
  constructor(private firebaseService: FirebaseService) {}

  async getAllPosts(limit: number = 50): Promise<any[]> {
    const db = this.firebaseService.getFirestore();
    const snapshot = await db.collection('posts').orderBy('createdAt', 'desc').limit(limit).get();
    return snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
  }

  async getFriendsPosts(friendIds: string[], limit: number = 50): Promise<any[]> {
    const db = this.firebaseService.getFirestore();
    if (friendIds.length === 0) {
      return [];
    }
    // Firestore 'in' query limited to 10
    const snapshot = await db
      .collection('posts')
      .where('userId', 'in', friendIds.slice(0, 10))
      .orderBy('createdAt', 'desc')
      .limit(limit)
      .get();
    return snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
  }

  async getPostById(postId: string): Promise<any | null> {
    const db = this.firebaseService.getFirestore();
    const doc = await db.collection('posts').doc(postId).get();
    if (!doc.exists) {
      return null;
    }
    return { id: doc.id, ...doc.data() };
  }

  async createPost(data: Record<string, any>): Promise<any> {
    const db = this.firebaseService.getFirestore();
    const docRef = await db.collection('posts').add({
      ...data,
      reactions: [],
      comments: [],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });
    const doc = await docRef.get();
    return { id: doc.id, ...doc.data() };
  }

  async updatePost(postId: string, data: Record<string, any>): Promise<any> {
    const db = this.firebaseService.getFirestore();
    await db.collection('posts').doc(postId).update({
      ...data,
      updatedAt: new Date().toISOString(),
    });
    const doc = await db.collection('posts').doc(postId).get();
    return { id: doc.id, ...doc.data() };
  }

  async deletePost(postId: string): Promise<boolean> {
    const db = this.firebaseService.getFirestore();
    await db.collection('posts').doc(postId).delete();
    return true;
  }
}
