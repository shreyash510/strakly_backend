import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import { TenantService } from '../../tenant/tenant.service';

/**
 * Cross-Schema Validator Service
 *
 * Since PostgreSQL cannot enforce foreign key constraints across schemas,
 * this service provides runtime validation for cross-schema references.
 *
 * Common cross-schema references:
 * - tenant.users.marked_by -> public.users.id (attendance)
 * - tenant.staff_salaries.paid_by_id -> public.users.id
 * - tenant.memberships.created_by -> public.users.id
 * - tenant.body_metrics.measured_by -> public.users.id
 * - tenant.users.branch_id -> public.branches.id
 */
@Injectable()
export class CrossSchemaValidatorService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tenantService: TenantService,
  ) {}

  /**
   * Validate that a public.users ID exists and is active
   */
  async validatePublicUserId(userId: number): Promise<boolean> {
    const user = await this.prisma.user.findFirst({
      where: {
        id: userId,
        isDeleted: false,
      },
      select: { id: true },
    });
    return !!user;
  }

  /**
   * Validate that a public.users ID exists and has one of the specified roles
   */
  async validatePublicUserRole(
    userId: number,
    roles: string[],
    gymId: number,
  ): Promise<boolean> {
    const assignment = await this.prisma.userGymXref.findFirst({
      where: {
        userId,
        gymId,
        role: { in: roles },
        isActive: true,
        user: {
          isDeleted: false,
        },
      },
      select: { id: true },
    });
    return !!assignment;
  }

  /**
   * Validate that a branch exists and belongs to the specified gym
   */
  async validateBranchExists(
    branchId: number,
    gymId: number,
  ): Promise<boolean> {
    const branch = await this.prisma.branch.findFirst({
      where: {
        id: branchId,
        gymId,
        isActive: true,
      },
      select: { id: true },
    });
    return !!branch;
  }

  /**
   * Validate that a gym exists and is active
   */
  async validateGymExists(gymId: number): Promise<boolean> {
    const gym = await this.prisma.gym.findFirst({
      where: {
        id: gymId,
        isActive: true,
      },
      select: { id: true },
    });
    return !!gym;
  }

  /**
   * Validate that a tenant user exists (client or staff in tenant schema)
   */
  async validateTenantUserId(userId: number, gymId: number): Promise<boolean> {
    const user = await this.tenantService.executeInTenant(
      gymId,
      async (client) => {
        const result = await client.query(
          `SELECT id FROM users WHERE id = $1 AND (is_deleted = FALSE OR is_deleted IS NULL)`,
          [userId],
        );
        return result.rows[0];
      },
    );
    return !!user;
  }

  /**
   * Validate that a tenant user has one of the specified roles
   */
  async validateTenantUserRole(
    userId: number,
    gymId: number,
    roles: string[],
  ): Promise<boolean> {
    const user = await this.tenantService.executeInTenant(
      gymId,
      async (client) => {
        const result = await client.query(
          `SELECT id FROM users WHERE id = $1 AND role = ANY($2) AND (is_deleted = FALSE OR is_deleted IS NULL)`,
          [userId, roles],
        );
        return result.rows[0];
      },
    );
    return !!user;
  }

  /**
   * Validate that a plan exists in the tenant schema
   */
  async validatePlanExists(planId: number, gymId: number): Promise<boolean> {
    const plan = await this.tenantService.executeInTenant(
      gymId,
      async (client) => {
        const result = await client.query(
          `SELECT id FROM plans WHERE id = $1 AND is_active = true AND (is_deleted = FALSE OR is_deleted IS NULL)`,
          [planId],
        );
        return result.rows[0];
      },
    );
    return !!plan;
  }

  /**
   * Validate that an offer exists and is valid in the tenant schema
   */
  async validateOfferExists(offerId: number, gymId: number): Promise<boolean> {
    const offer = await this.tenantService.executeInTenant(
      gymId,
      async (client) => {
        const result = await client.query(
          `SELECT id FROM offers WHERE id = $1 AND is_active = true AND (is_deleted = FALSE OR is_deleted IS NULL)`,
          [offerId],
        );
        return result.rows[0];
      },
    );
    return !!offer;
  }

  /**
   * Validate that a membership exists in the tenant schema
   */
  async validateMembershipExists(
    membershipId: number,
    gymId: number,
  ): Promise<boolean> {
    const membership = await this.tenantService.executeInTenant(
      gymId,
      async (client) => {
        const result = await client.query(
          `SELECT id FROM memberships WHERE id = $1 AND (is_deleted = FALSE OR is_deleted IS NULL)`,
          [membershipId],
        );
        return result.rows[0];
      },
    );
    return !!membership;
  }

  /**
   * Validate staff user for operations like marking attendance, paying salary etc.
   * Staff should be admin, manager, or branch_admin in public.users
   */
  async validateStaffForOperation(
    staffId: number,
    gymId: number,
    branchId?: number,
  ): Promise<{
    valid: boolean;
    message?: string;
  }> {
    // First check if user exists in public schema
    const userExists = await this.validatePublicUserId(staffId);
    if (!userExists) {
      return { valid: false, message: 'Staff user not found' };
    }

    // Check if user has assignment to this gym with appropriate role
    const validRoles = ['admin', 'manager', 'branch_admin', 'trainer'];
    const hasRole = await this.validatePublicUserRole(
      staffId,
      validRoles,
      gymId,
    );
    if (!hasRole) {
      return {
        valid: false,
        message: 'User does not have staff permissions for this gym',
      };
    }

    // If branchId is specified, validate branch access
    if (branchId) {
      const assignment = await this.prisma.userGymXref.findFirst({
        where: {
          userId: staffId,
          gymId,
          isActive: true,
          OR: [
            { branchId: null }, // Has access to all branches
            { branchId }, // Has access to this specific branch
          ],
        },
      });

      if (!assignment) {
        return {
          valid: false,
          message: 'User does not have access to this branch',
        };
      }
    }

    return { valid: true };
  }

  /**
   * Batch validate multiple references at once for efficiency
   */
  async batchValidate(
    validations: Array<{
      type: 'publicUser' | 'branch' | 'gym' | 'tenantUser' | 'plan' | 'offer';
      id: number;
      gymId?: number;
    }>,
  ): Promise<Map<string, boolean>> {
    const results = new Map<string, boolean>();

    await Promise.all(
      validations.map(async (v) => {
        const key = `${v.type}:${v.id}:${v.gymId || 0}`;
        let valid = false;

        switch (v.type) {
          case 'publicUser':
            valid = await this.validatePublicUserId(v.id);
            break;
          case 'branch':
            valid = v.gymId
              ? await this.validateBranchExists(v.id, v.gymId)
              : false;
            break;
          case 'gym':
            valid = await this.validateGymExists(v.id);
            break;
          case 'tenantUser':
            valid = v.gymId
              ? await this.validateTenantUserId(v.id, v.gymId)
              : false;
            break;
          case 'plan':
            valid = v.gymId
              ? await this.validatePlanExists(v.id, v.gymId)
              : false;
            break;
          case 'offer':
            valid = v.gymId
              ? await this.validateOfferExists(v.id, v.gymId)
              : false;
            break;
        }

        results.set(key, valid);
      }),
    );

    return results;
  }
}
