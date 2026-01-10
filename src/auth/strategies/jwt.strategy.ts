import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { ConfigService } from '@nestjs/config';
import { FirebaseService } from '../../firebase/firebase.service';

export interface JwtPayload {
  sub: string; // userId
  email: string;
  name: string;
}

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(
    private readonly configService: ConfigService,
    private readonly firebaseService: FirebaseService,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: configService.get<string>('JWT_SECRET') || 'strakly-secret-key-change-in-production',
    });
  }

  async validate(payload: JwtPayload) {
    // Verify user still exists
    const db = this.firebaseService.getFirestore();
    const userDoc = await db.collection('users').doc(payload.sub).get();

    if (!userDoc.exists) {
      throw new UnauthorizedException('User not found');
    }

    return {
      userId: payload.sub,
      email: payload.email,
      name: payload.name,
    };
  }
}
