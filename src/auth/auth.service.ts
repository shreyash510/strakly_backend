import {
  Injectable,
  UnauthorizedException,
  ConflictException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { FirebaseService } from '../firebase/firebase.service';
import { CreateUserDto } from './dto/create-user.dto';
import { LoginDto } from './dto/login.dto';
import * as bcrypt from 'bcrypt';

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

export interface AuthResponse {
  user: UserResponse;
  accessToken: string;
}

@Injectable()
export class AuthService {
  private readonly SALT_ROUNDS = 10;

  constructor(
    private readonly firebaseService: FirebaseService,
    private readonly jwtService: JwtService,
  ) {}

  private async hashPassword(password: string): Promise<string> {
    return bcrypt.hash(password, this.SALT_ROUNDS);
  }

  private async comparePassword(password: string, hash: string): Promise<boolean> {
    return bcrypt.compare(password, hash);
  }

  private generateToken(user: UserResponse): string {
    const payload = {
      sub: user.id,
      email: user.email,
      name: user.name,
    };
    return this.jwtService.sign(payload);
  }

  async register(createUserDto: CreateUserDto): Promise<AuthResponse> {
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
      passwordHash: await this.hashPassword(createUserDto.password),
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    const docRef = await db.collection('users').add(userData);

    const user: UserResponse = {
      id: docRef.id,
      name: userData.name,
      email: userData.email,
    };

    return {
      user,
      accessToken: this.generateToken(user),
    };
  }

  async login(loginDto: LoginDto): Promise<AuthResponse> {
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

    // Check password with bcrypt
    const isPasswordValid = await this.comparePassword(
      loginDto.password,
      userData.passwordHash,
    );

    if (!isPasswordValid) {
      throw new UnauthorizedException('Invalid credentials');
    }

    const user: UserResponse = {
      id: userDoc.id,
      name: userData.name,
      email: userData.email,
    };

    return {
      user,
      accessToken: this.generateToken(user),
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

  async changePassword(
    userId: string,
    currentPassword: string,
    newPassword: string,
  ): Promise<{ success: boolean }> {
    const db = this.firebaseService.getFirestore();

    const userDoc = await db.collection('users').doc(userId).get();

    if (!userDoc.exists) {
      throw new UnauthorizedException('User not found');
    }

    const userData = userDoc.data() as User;

    // Verify current password
    const isPasswordValid = await this.comparePassword(
      currentPassword,
      userData.passwordHash,
    );

    if (!isPasswordValid) {
      throw new UnauthorizedException('Current password is incorrect');
    }

    // Update password
    await db.collection('users').doc(userId).update({
      passwordHash: await this.hashPassword(newPassword),
      updatedAt: new Date().toISOString(),
    });

    return { success: true };
  }

  async refreshToken(userId: string): Promise<{ accessToken: string }> {
    const user = await this.getProfile(userId);
    return {
      accessToken: this.generateToken(user),
    };
  }
}
