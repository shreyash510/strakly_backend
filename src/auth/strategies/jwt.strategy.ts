import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { ConfigService } from '@nestjs/config';
import { TenantService } from '../../tenant/tenant.service';
import { PrismaService } from '../../database/prisma.service';

export interface JwtPayload {
  sub: number; // userId (tenant user id or system user id for superadmin)
  email: string;
  name: string;
  role?: string;
  gymId: number | null;
  tenantSchemaName: string | null;
  isSuperAdmin?: boolean;
  isAdmin?: boolean; // Admin users are in public.users, not tenant.users
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
    private readonly prisma: PrismaService,
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
    const isAdmin = payload.isAdmin === true;

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

    // Handle admin case - admin users are in public.users, not tenant.users
    if (isAdmin) {
      // Verify admin user exists in public.users
      const adminUser = await this.prisma.user.findUnique({
        where: { id: userId },
        include: {
          gymAssignments: {
            where: { isActive: true, gymId: gymId || undefined },
          },
        },
      });

      if (!adminUser) {
        throw new UnauthorizedException('User not found');
      }

      if (adminUser.isDeleted) {
        throw new UnauthorizedException('Your account has been deleted');
      }

      if (adminUser.status === 'suspended') {
        throw new UnauthorizedException('Your account has been suspended');
      }

      if (adminUser.status === 'inactive') {
        throw new UnauthorizedException('Your account is inactive');
      }

      return {
        userId: userId,
        email: payload.email,
        name: payload.name,
        role: payload.role || 'admin',
        gymId: gymId,
        tenantSchemaName: tenantSchemaName,
        isSuperAdmin: false,
      };
    }

    // For tenant users (manager, trainer, client), require tenant information
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
