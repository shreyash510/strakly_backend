import { Injectable } from '@nestjs/common';
import { FirebaseService } from '../firebase.service';

@Injectable()
export class FriendFirebaseService {
  constructor(private firebaseService: FirebaseService) {}

  async findFriendship(userId1: string, userId2: string): Promise<any | null> {
    const db = this.firebaseService.getFirestore();
    let snapshot = await db
      .collection('friends')
      .where('userId', '==', userId1)
      .where('friendId', '==', userId2)
      .get();
    if (snapshot.empty) {
      snapshot = await db
        .collection('friends')
        .where('userId', '==', userId2)
        .where('friendId', '==', userId1)
        .get();
    }
    if (snapshot.empty) {
      return null;
    }
    const doc = snapshot.docs[0];
    return { id: doc.id, ...doc.data() };
  }

  async getFriends(userId: string): Promise<any[]> {
    const db = this.firebaseService.getFirestore();
    const results: any[] = [];

    const snapshot1 = await db.collection('friends').where('userId', '==', userId).get();
    snapshot1.docs.forEach((doc) => results.push({ id: doc.id, ...doc.data() }));

    const snapshot2 = await db.collection('friends').where('friendId', '==', userId).get();
    snapshot2.docs.forEach((doc) => results.push({ id: doc.id, ...doc.data() }));

    return results;
  }

  async deleteFriendship(userId1: string, userId2: string): Promise<boolean> {
    const friendship = await this.findFriendship(userId1, userId2);
    if (friendship) {
      const db = this.firebaseService.getFirestore();
      await db.collection('friends').doc(friendship.id).delete();
    }
    return true;
  }

  async createFriend(data: Record<string, any>): Promise<any> {
    const db = this.firebaseService.getFirestore();
    const docRef = await db.collection('friends').add({
      ...data,
      createdAt: new Date().toISOString(),
    });
    const doc = await docRef.get();
    return { id: doc.id, ...doc.data() };
  }

  // Friend requests
  async findFriendRequest(fromUserId: string, toUserId: string): Promise<any | null> {
    const db = this.firebaseService.getFirestore();
    const snapshot = await db
      .collection('friendRequests')
      .where('fromUserId', '==', fromUserId)
      .where('toUserId', '==', toUserId)
      .where('status', '==', 'pending')
      .get();
    if (snapshot.empty) {
      return null;
    }
    const doc = snapshot.docs[0];
    return { id: doc.id, ...doc.data() };
  }

  async getFriendRequestById(requestId: string): Promise<any | null> {
    const db = this.firebaseService.getFirestore();
    const doc = await db.collection('friendRequests').doc(requestId).get();
    if (!doc.exists) {
      return null;
    }
    return { id: doc.id, ...doc.data() };
  }

  async getPendingFriendRequests(userId: string): Promise<any[]> {
    const db = this.firebaseService.getFirestore();
    const snapshot = await db
      .collection('friendRequests')
      .where('toUserId', '==', userId)
      .where('status', '==', 'pending')
      .get();
    return snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
  }

  async getSentFriendRequests(userId: string): Promise<any[]> {
    const db = this.firebaseService.getFirestore();
    const snapshot = await db
      .collection('friendRequests')
      .where('fromUserId', '==', userId)
      .where('status', '==', 'pending')
      .get();
    return snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
  }

  async createFriendRequest(data: Record<string, any>): Promise<any> {
    const db = this.firebaseService.getFirestore();
    const docRef = await db.collection('friendRequests').add({
      ...data,
      status: 'pending',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });
    const doc = await docRef.get();
    return { id: doc.id, ...doc.data() };
  }

  async updateFriendRequest(requestId: string, data: Record<string, any>): Promise<any> {
    const db = this.firebaseService.getFirestore();
    await db.collection('friendRequests').doc(requestId).update({
      ...data,
      updatedAt: new Date().toISOString(),
    });
    const doc = await db.collection('friendRequests').doc(requestId).get();
    return { id: doc.id, ...doc.data() };
  }

  // New array-based friends structure
  async getFriendsDocument(userId: string): Promise<{ userId: string; friends: string[] } | null> {
    const db = this.firebaseService.getFirestore();
    const doc = await db.collection('friends').doc(userId).get();
    if (!doc.exists) {
      return null;
    }
    const data = doc.data();
    return {
      userId: data?.userId || userId,
      friends: data?.friends || [],
    };
  }

  async addFriend(userId: string, friendId: string): Promise<void> {
    const db = this.firebaseService.getFirestore();
    const docRef = db.collection('friends').doc(userId);
    const doc = await docRef.get();

    if (doc.exists) {
      const data = doc.data();
      const friends = data?.friends || [];
      if (!friends.includes(friendId)) {
        await docRef.update({ friends: [...friends, friendId] });
      }
    } else {
      await docRef.set({
        userId,
        friends: [friendId],
        createdAt: new Date().toISOString(),
      });
    }
  }

  async removeFriend(userId: string, friendId: string): Promise<void> {
    const db = this.firebaseService.getFirestore();
    const docRef = db.collection('friends').doc(userId);
    const doc = await docRef.get();

    if (doc.exists) {
      const data = doc.data();
      const friends = (data?.friends || []).filter((id: string) => id !== friendId);
      await docRef.update({ friends });
    }
  }
}
