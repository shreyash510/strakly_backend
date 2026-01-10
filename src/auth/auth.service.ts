import {
  Injectable,
  UnauthorizedException,
  ConflictException,
} from '@nestjs/common';
import { FirebaseService } from '../firebase/firebase.service';
import { CreateUserDto } from './dto/create-user.dto';
import { LoginDto } from './dto/login.dto';
import * as crypto from 'crypto';

export interface User {
  id: string;
  name: string;
  email: string;
  passwordHash: string;
  createdAt: string;
  updatedAt: string;
}

export interface UserResponse {
  id: string;
  name: string;
  email: string;
}

@Injectable()
export class AuthService {
  constructor(private readonly firebaseService: FirebaseService) {}

  private hashPassword(password: string): string {
    return crypto.createHash('sha256').update(password).digest('hex');
  }

  async register(createUserDto: CreateUserDto): Promise<UserResponse> {
    const db = this.firebaseService.getFirestore();

    // Check if user already exists
    const existingUser = await db
      .collection('users')
      .where('email', '==', createUserDto.email)
      .get();

    if (!existingUser.empty) {
      throw new ConflictException('User with this email already exists');
    }

    const userData = {
      name: createUserDto.name,
      email: createUserDto.email,
      passwordHash: this.hashPassword(createUserDto.password),
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    const docRef = await db.collection('users').add(userData);

    return {
      id: docRef.id,
      name: userData.name,
      email: userData.email,
    };
  }

  async login(loginDto: LoginDto): Promise<UserResponse> {
    const db = this.firebaseService.getFirestore();

    const usersSnapshot = await db
      .collection('users')
      .where('email', '==', loginDto.email)
      .get();

    if (usersSnapshot.empty) {
      throw new UnauthorizedException('Invalid credentials');
    }

    const userDoc = usersSnapshot.docs[0];
    const userData = userDoc.data() as User;

    const passwordHash = this.hashPassword(loginDto.password);

    if (userData.passwordHash !== passwordHash) {
      throw new UnauthorizedException('Invalid credentials');
    }

    return {
      id: userDoc.id,
      name: userData.name,
      email: userData.email,
    };
  }

  async getProfile(userId: string): Promise<UserResponse> {
    const db = this.firebaseService.getFirestore();

    const userDoc = await db.collection('users').doc(userId).get();

    if (!userDoc.exists) {
      throw new UnauthorizedException('User not found');
    }

    const userData = userDoc.data() as User;

    return {
      id: userDoc.id,
      name: userData.name,
      email: userData.email,
    };
  }

  async updateProfile(
    userId: string,
    name: string,
  ): Promise<UserResponse> {
    const db = this.firebaseService.getFirestore();

    await db.collection('users').doc(userId).update({
      name,
      updatedAt: new Date().toISOString(),
    });

    const userDoc = await db.collection('users').doc(userId).get();
    const userData = userDoc.data() as User;

    return {
      id: userDoc.id,
      name: userData.name,
      email: userData.email,
    };
  }
}
