import { Injectable, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as admin from 'firebase-admin';

@Injectable()
export class FirebaseService implements OnModuleInit {
  private db: admin.firestore.Firestore;

  constructor(private configService: ConfigService) {}

  onModuleInit() {
    if (!admin.apps.length) {
      admin.initializeApp({
        credential: admin.credential.cert({
          projectId: this.configService.get<string>('firebase.projectId'),
          privateKey: this.configService.get<string>('firebase.privateKey'),
          clientEmail: this.configService.get<string>('firebase.clientEmail'),
        }),
      });
    }
    this.db = admin.firestore();
  }

  getFirestore(): admin.firestore.Firestore {
    return this.db;
  }

  getAuth(): admin.auth.Auth {
    return admin.auth();
  }

  // Generic CRUD operations for Firestore
  async getCollection<T>(
    collectionName: string,
    userId: string,
  ): Promise<T[]> {
    const snapshot = await this.db
      .collection('users')
      .doc(userId)
      .collection(collectionName)
      .orderBy('createdAt', 'desc')
      .get();

    return snapshot.docs.map((doc) => ({
      id: doc.id,
      ...doc.data(),
    })) as T[];
  }

  async getDocument<T>(
    collectionName: string,
    userId: string,
    docId: string,
  ): Promise<T | null> {
    const doc = await this.db
      .collection('users')
      .doc(userId)
      .collection(collectionName)
      .doc(docId)
      .get();

    if (!doc.exists) {
      return null;
    }

    return { id: doc.id, ...doc.data() } as T;
  }

  async createDocument<T>(
    collectionName: string,
    userId: string,
    data: Record<string, any>,
  ): Promise<T> {
    const docRef = await this.db
      .collection('users')
      .doc(userId)
      .collection(collectionName)
      .add({
        ...data,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });

    const doc = await docRef.get();
    return { id: doc.id, ...doc.data() } as T;
  }

  async updateDocument<T>(
    collectionName: string,
    userId: string,
    docId: string,
    data: Record<string, any>,
  ): Promise<T> {
    const docRef = this.db
      .collection('users')
      .doc(userId)
      .collection(collectionName)
      .doc(docId);

    await docRef.update({
      ...data,
      updatedAt: new Date().toISOString(),
    });

    const doc = await docRef.get();
    return { id: doc.id, ...doc.data() } as T;
  }

  async deleteDocument(
    collectionName: string,
    userId: string,
    docId: string,
  ): Promise<boolean> {
    await this.db
      .collection('users')
      .doc(userId)
      .collection(collectionName)
      .doc(docId)
      .delete();

    return true;
  }
}
