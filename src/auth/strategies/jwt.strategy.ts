import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { ConfigService } from '@nestjs/config';
import { TenantService } from '../../tenant/tenant.service';

export interface JwtPayload {
  sub: number; // userId (tenant user id or system user id for superadmin)
  email: string;
  name: string;
  role?: string;
  gymId: number | null;
  tenantSchemaName: string | null;
  isSuperAdmin?: boolean;
}

export interface AuthenticatedUser {
  userId: number;
  email: string;
  name: string;
  role: string;
  gymId: number | null;
  tenantSchemaName: string | null;
  isSuperAdmin: boolean;
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
    const isSuperAdmin = payload.isSuperAdmin === true;

    // Handle superadmin case - they don't have gym/tenant info
    if (isSuperAdmin) {
      return {
        userId: userId,
        email: payload.email,
        name: payload.name,
        role: payload.role || 'superadmin',
        gymId: null,
        tenantSchemaName: null,
        isSuperAdmin: true,
      };
    }

    // For regular users, require tenant information
    if (!gymId || !tenantSchemaName) {
      throw new UnauthorizedException('Invalid token: missing tenant information');
    }

    // Verify user still exists in tenant schema
    const userData = await this.tenantService.executeInTenant(gymId, async (client) => {
      const result = await client.query(
        `SELECT id, email, name, status, role
         FROM users
         WHERE id = $1`,
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
      role: payload.role || userData.role || 'client',
      gymId: gymId,
      tenantSchemaName: tenantSchemaName,
      isSuperAdmin: false,
    };
  }
}
