import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { ConfigService } from '@nestjs/config';
import { DatabaseService } from '../../database/database.service';

export interface JwtPayload {
  sub: string; // userId
  email: string;
  name: string;
  role?: string;
}

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(
    private readonly configService: ConfigService,
    private readonly databaseService: DatabaseService,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: configService.get<string>('JWT_SECRET') || 'strakly-secret-key-change-in-production',
    });
  }

  async validate(payload: JwtPayload) {
    // Verify user still exists
    const user = await this.databaseService.findUserById(payload.sub);

    if (!user) {
      throw new UnauthorizedException('User not found');
    }

    // Check if user is suspended
    if (user.status === 'suspended') {
      throw new UnauthorizedException('Your account has been suspended');
    }

    return {
      userId: payload.sub,
      email: payload.email,
      name: payload.name,
      role: payload.role || user.role || 'user',
    };
  }
}
