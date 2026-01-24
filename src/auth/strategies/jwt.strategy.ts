import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { ConfigService } from '@nestjs/config';
import { TenantService } from '../../tenant/tenant.service';

export interface JwtPayload {
  sub: number; // userId (tenant user id)
  email: string;
  name: string;
  role?: string;
  gymId: number;
  tenantSchemaName: string;
}

export interface AuthenticatedUser {
  userId: number;
  email: string;
  name: string;
  role: string;
  gymId: number;
  tenantSchemaName: string;
}

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(
    private readonly configService: ConfigService,
    private readonly tenantService: TenantService,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: configService.get<string>('JWT_SECRET') || 'strakly-secret-key-change-in-production',
    });
  }

  async validate(payload: JwtPayload): Promise<AuthenticatedUser> {
    const userId = typeof payload.sub === 'string' ? parseInt(payload.sub) : payload.sub;
    const gymId = payload.gymId;
    const tenantSchemaName = payload.tenantSchemaName;

    if (!gymId || !tenantSchemaName) {
      throw new UnauthorizedException('Invalid token: missing tenant information');
    }

    // Verify user still exists in tenant schema
    const userData = await this.tenantService.executeInTenant(gymId, async (client) => {
      const result = await client.query(
        `SELECT u.id, u.email, u.first_name, u.last_name, u.status, l.code as role_code
         FROM users u
         LEFT JOIN public.lookups l ON l.id = u.role_id
         WHERE u.id = $1`,
        [userId]
      );
      return result.rows[0];
    });

    if (!userData) {
      throw new UnauthorizedException('User not found');
    }

    // Check if user is suspended
    if (userData.status === 'suspended') {
      throw new UnauthorizedException('Your account has been suspended');
    }

    return {
      userId: userId,
      email: payload.email,
      name: payload.name,
      role: payload.role || userData.role_code || 'client',
      gymId: gymId,
      tenantSchemaName: tenantSchemaName,
    };
  }
}
