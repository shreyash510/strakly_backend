import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../database/prisma.service';

export interface JwtPayload {
  sub: number; // userId
  email: string;
  name: string;
  role?: string;
}

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(
    private readonly configService: ConfigService,
    private readonly prisma: PrismaService,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: configService.get<string>('JWT_SECRET') || 'strakly-secret-key-change-in-production',
    });
  }

  async validate(payload: JwtPayload) {
    const userId = typeof payload.sub === 'string' ? parseInt(payload.sub) : payload.sub;

    // Verify user still exists
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: { role: true },
    });

    if (!user) {
      throw new UnauthorizedException('User not found');
    }

    // Check if user is suspended
    if (user.status === 'suspended') {
      throw new UnauthorizedException('Your account has been suspended');
    }

    const userRole = user.role?.code || 'user';

    return {
      userId: userId,
      email: payload.email,
      name: payload.name,
      role: payload.role || userRole,
    };
  }
}
